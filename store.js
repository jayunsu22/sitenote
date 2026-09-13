// store.js — 상태 저장소
// localStorage 에 즉시 저장하고, 변경분을 syncQueue 에 쌓아 3초 뒤 n8n webhook 으로 백업한다.
// 백업 실패/오프라인이면 큐를 유지했다가 다음 기회(온라인 복귀, 앱 재실행)에 재시도.
// Share(share.js) 에 의존. 브라우저에서는 전역 Store, node 에서는 module.exports.
(function (root) {
  'use strict';

  var Share = root.Share || (typeof require === 'function' ? require('./share.js') : null);

  var KEY = 'sitenote.v1';
  var N8N_BASE = 'https://primary-production-a6fa.up.railway.app';
  var SYNC_URL = N8N_BASE + '/webhook/sitenote-sync';
  var RESTORE_URL = N8N_BASE + '/webhook/sitenote-restore';
  var DEBOUNCE_MS = 3000;
  var FETCH_TIMEOUT_MS = 15000;

  var state = null;
  var listeners = [];
  var timer = null;
  var flushing = false;
  var seq = 0; // 큐 항목 식별용 단조 증가 번호 (같은 ms 에 두 번 갱신돼도 구분됨)

  function enqueue(op) {
    seq += 1;
    state.syncQueue = Share.mergeQueue(state.syncQueue, Object.assign({ ts: Date.now(), seq: seq }, op));
  }

  // ---------- 기본값 ----------
  function defaultSettings() {
    return {
      questions: Object.assign({}, Share.DEFAULT_QUESTIONS),
      backupKey: '',
      lastTab: ''
    };
  }
  function defaultState() {
    return { version: 1, clients: [], sites: [], photos: [], settings: defaultSettings(), syncQueue: [], lastSyncAt: 0, lastSyncError: '' };
  }
  function blankSite(clientId, color) {
    var now = Date.now();
    var s = { id: genId('s'), clientId: clientId, color: color, createdAt: now, updatedAt: now };
    Share.FIELDS.forEach(function (f) {
      if (f.type === 'select') s[f.key] = { v: '미확인', memo: '' };
      else if (f.type === 'films') s[f.key] = [];
      else s[f.key] = '';
    });
    return s;
  }
  // 서버/구버전에서 온 현장 객체에 누락된 항목을 기본값으로 채움
  function normalizeSite(raw) {
    var s = Object.assign(blankSite(raw.clientId, raw.color || 0), raw);
    Share.FIELDS.forEach(function (f) {
      if (f.type === 'select' && (!s[f.key] || typeof s[f.key] !== 'object')) s[f.key] = { v: '미확인', memo: '' };
      if (f.type === 'films' && !Array.isArray(s[f.key])) s[f.key] = [];
    });
    return s;
  }
  function normalizeClient(raw) {
    return Object.assign({ contacts: [], filmPrice: '', laborPrice: '', quoteNote: '', siteNote: '', order: 0, updatedAt: 0 }, raw);
  }
  // 사진(명함 등): 거래처 고정값에 붙는 이미지. dataUrl 은 앱에서 축소한 JPEG
  function normalizePhoto(raw) {
    return Object.assign({ id: '', clientId: '', name: '', dataUrl: '', w: 0, h: 0, bytes: 0, createdAt: 0, updatedAt: 0 }, raw);
  }
  function genId(prefix) {
    return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  // ---------- 저장/불러오기 ----------
  function load() {
    var raw = null;
    try { raw = localStorage.getItem(KEY); } catch (e) { /* 저장소 접근 불가 */ }
    var parsed = null;
    if (raw) { try { parsed = JSON.parse(raw); } catch (e) { parsed = null; } }
    state = defaultState();
    if (parsed) {
      state.clients = (parsed.clients || []).map(normalizeClient);
      state.sites = (parsed.sites || []).map(normalizeSite);
      state.photos = (parsed.photos || []).map(normalizePhoto);
      state.settings = Object.assign(defaultSettings(), parsed.settings || {});
      state.settings.questions = Object.assign({}, Share.DEFAULT_QUESTIONS, (parsed.settings || {}).questions || {});
      state.syncQueue = parsed.syncQueue || [];
      seq = state.syncQueue.reduce(function (m, o) { return Math.max(m, o.seq || 0); }, seq);
      state.lastSyncAt = parsed.lastSyncAt || 0;
      state.lastSyncError = parsed.lastSyncError || '';
    }
    return state;
  }
  // 저장 성공 여부를 돌려준다 — 사진처럼 용량이 큰 항목은 실패하면 되돌려야 하기 때문
  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); return true; }
    catch (e) { return false; /* 용량 초과 등 — 메모리 상태는 유지 */ }
  }
  function emit() { listeners.forEach(function (fn) { try { fn(state); } catch (e) { /* 리스너 오류 무시 */ } }); }

  // 변경 커밋: 저장 → 큐 → 디바운스 전송 → 리스너
  function commit(op) {
    if (op) enqueue(op);
    var saved = persist();
    scheduleFlush();
    emit();
    return saved;
  }

  // 설정 중 서버로 보낼 것만 (백업키·마지막 탭은 폰에만)
  function settingsForSync() {
    return { questions: state.settings.questions };
  }

  // ---------- 거래처 ----------
  function clients() {
    return state.clients.slice().sort(function (a, b) { return a.order - b.order; });
  }
  function getClient(id) { return state.clients.find(function (c) { return c.id === id; }) || null; }
  function addClient(name) {
    var maxOrder = state.clients.reduce(function (m, c) { return Math.max(m, c.order); }, -1);
    var c = normalizeClient({ id: genId('c'), name: String(name || '').trim() || '새 거래처', order: maxOrder + 1, updatedAt: Date.now() });
    state.clients.push(c);
    commit({ op: 'upsert', type: 'client', id: c.id, data: c });
    return c;
  }
  function updateClient(id, patch) {
    var c = getClient(id);
    if (!c) return null;
    Object.assign(c, patch, { updatedAt: Date.now() });
    commit({ op: 'upsert', type: 'client', id: c.id, data: c });
    return c;
  }
  function renameClient(id, name) { return updateClient(id, { name: String(name || '').trim() || '새 거래처' }); }
  function reorderClients(idsInOrder) {
    idsInOrder.forEach(function (id, i) {
      var c = getClient(id);
      if (c && c.order !== i) { c.order = i; c.updatedAt = Date.now(); enqueue({ op: 'upsert', type: 'client', id: c.id, data: c }); }
    });
    commit(null);
  }
  function deleteClient(id) {
    state.sites.filter(function (s) { return s.clientId === id; }).forEach(function (s) {
      enqueue({ op: 'delete', type: 'site', id: s.id });
    });
    state.photos.filter(function (p) { return p.clientId === id; }).forEach(function (p) {
      enqueue({ op: 'delete', type: 'photo', id: p.id });
    });
    state.sites = state.sites.filter(function (s) { return s.clientId !== id; });
    state.photos = state.photos.filter(function (p) { return p.clientId !== id; });
    state.clients = state.clients.filter(function (c) { return c.id !== id; });
    commit({ op: 'delete', type: 'client', id: id });
  }

  // ---------- 현장 ----------
  function getSite(id) { return state.sites.find(function (s) { return s.id === id; }) || null; }
  function sitesOf(clientId) {
    return Share.sortSites(state.sites.filter(function (s) { return s.clientId === clientId; }));
  }
  function addSite(clientId) {
    var s = blankSite(clientId, Share.nextColor(state.sites, clientId));
    state.sites.push(s);
    commit({ op: 'upsert', type: 'site', id: s.id, data: s });
    return s;
  }
  function updateSite(id, patch) {
    var s = getSite(id);
    if (!s) return null;
    Object.assign(s, patch, { updatedAt: Date.now() });
    commit({ op: 'upsert', type: 'site', id: s.id, data: s });
    return s;
  }
  function deleteSite(id) {
    state.sites = state.sites.filter(function (s) { return s.id !== id; });
    commit({ op: 'delete', type: 'site', id: id });
  }

  // ---------- 사진 (거래처 고정값) ----------
  function getPhoto(id) { return state.photos.find(function (p) { return p.id === id; }) || null; }
  function photosOf(clientId) {
    return state.photos.filter(function (p) { return p.clientId === clientId; })
      .sort(function (a, b) { return (a.createdAt || 0) - (b.createdAt || 0); });
  }
  // 저장공간이 가득 차면 방금 추가한 사진을 되돌리고 null 을 돌려준다 (앱이 안내 문구를 띄움)
  function addPhoto(clientId, photo) {
    var now = Date.now();
    var p = normalizePhoto(Object.assign({ id: genId('p'), clientId: clientId, createdAt: now }, photo, { updatedAt: now }));
    state.photos.push(p);
    if (commit({ op: 'upsert', type: 'photo', id: p.id, data: p })) return p;
    state.photos = state.photos.filter(function (x) { return x.id !== p.id; });
    state.syncQueue = state.syncQueue.filter(function (o) { return !(o.type === 'photo' && o.id === p.id); });
    persist(); emit();
    return null;
  }
  function updatePhoto(id, patch) {
    var p = getPhoto(id);
    if (!p) return null;
    Object.assign(p, patch, { updatedAt: Date.now() });
    commit({ op: 'upsert', type: 'photo', id: p.id, data: p });
    return p;
  }
  function deletePhoto(id) {
    state.photos = state.photos.filter(function (p) { return p.id !== id; });
    commit({ op: 'delete', type: 'photo', id: id });
  }

  // ---------- 설정 ----------
  function setSettings(patch) {
    Object.assign(state.settings, patch);
    if (patch && patch.questions) state.settings.questions = Object.assign({}, Share.DEFAULT_QUESTIONS, patch.questions);
    // 백업키·lastTab 만 바뀐 경우엔 서버로 보낼 필요 없지만, 단순화를 위해 항상 settings 를 큐에 넣는다 (키는 제외됨)
    commit({ op: 'upsert', type: 'settings', id: 'settings', data: settingsForSync() });
  }

  // ---------- 동기화 ----------
  function pendingCount() { return state.syncQueue.length; }

  function scheduleFlush() {
    if (!state.syncQueue.length || !state.settings.backupKey) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () { timer = null; flush(); }, DEBOUNCE_MS);
  }

  function fetchWithTimeout(url, opt) {
    if (typeof AbortController === 'undefined') return fetch(url, opt);
    var ctrl = new AbortController();
    var t = setTimeout(function () { ctrl.abort(); }, FETCH_TIMEOUT_MS);
    return fetch(url, Object.assign({ signal: ctrl.signal }, opt)).finally(function () { clearTimeout(t); });
  }

  // 큐를 서버로 전송. 성공하면 전송한 항목만 큐에서 제거 (전송 중 새로 들어온 변경은 남김)
  function flush() {
    if (flushing) return Promise.resolve(false);
    if (!state.syncQueue.length) return Promise.resolve(true);
    if (!state.settings.backupKey) return Promise.resolve(false);
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return Promise.resolve(false);

    flushing = true;
    var batch = state.syncQueue.slice();
    var body = JSON.stringify({ key: state.settings.backupKey, ops: batch });
    return fetchWithTimeout(SYNC_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json().catch(function () { return {}; });
      })
      .then(function () {
        // 전송한 것과 동일한(seq 같은) 항목만 제거 — 전송 중 갱신된 항목은 seq 가 달라 남는다
        var sentSeq = {};
        batch.forEach(function (o) { sentSeq[o.seq] = true; });
        state.syncQueue = state.syncQueue.filter(function (o) { return !sentSeq[o.seq]; });
        state.lastSyncAt = Date.now();
        state.lastSyncError = '';
        flushing = false;
        persist(); emit();
        if (state.syncQueue.length) scheduleFlush();
        return true;
      })
      .catch(function (err) {
        state.lastSyncError = String(err && err.message || err);
        flushing = false;
        persist(); emit();
        return false;
      });
  }

  // 서버에서 전체를 받아 폰 데이터를 교체. force 가 아니면 폰에 데이터가 있을 때 거부(null)
  function restore(force) {
    if (!state.settings.backupKey) return Promise.reject(new Error('백업키가 없습니다'));
    if (!force && (state.clients.length || state.sites.length)) return Promise.resolve(null);
    var url = RESTORE_URL + '?key=' + encodeURIComponent(state.settings.backupKey);
    return fetchWithTimeout(url, { method: 'GET' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        var keep = { backupKey: state.settings.backupKey, lastTab: state.settings.lastTab };
        state.clients = (data.clients || []).map(normalizeClient);
        state.sites = (data.sites || []).map(normalizeSite);
        state.photos = (data.photos || []).map(normalizePhoto);
        state.settings = Object.assign(defaultSettings(), keep);
        state.settings.questions = Object.assign({}, Share.DEFAULT_QUESTIONS, (data.settings && data.settings.questions) || {});
        state.syncQueue = [];
        state.lastSyncAt = Date.now();
        state.lastSyncError = '';
        persist(); emit();
        return { clients: state.clients.length, sites: state.sites.length, photos: state.photos.length };
      });
  }

  function onChange(fn) {
    listeners.push(fn);
    return function () { listeners = listeners.filter(function (f) { return f !== fn; }); };
  }

  // 온라인 복귀 시 재시도
  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('online', function () { if (state) flush(); });
  }

  var Store = {
    get state() { return state; },
    load: load,
    clients: clients, getClient: getClient, addClient: addClient, updateClient: updateClient,
    renameClient: renameClient, reorderClients: reorderClients, deleteClient: deleteClient,
    getSite: getSite, sitesOf: sitesOf, addSite: addSite, updateSite: updateSite, deleteSite: deleteSite,
    getPhoto: getPhoto, photosOf: photosOf, addPhoto: addPhoto, updatePhoto: updatePhoto, deletePhoto: deletePhoto,
    setSettings: setSettings,
    pendingCount: pendingCount, flush: flush, restore: restore,
    onChange: onChange,
    SYNC_URL: SYNC_URL, RESTORE_URL: RESTORE_URL
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Store;
  else root.Store = Store;
})(typeof window !== 'undefined' ? window : this);
