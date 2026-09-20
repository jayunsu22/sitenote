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
      lastTab: '',
      lastView: 'main',          // 앱을 다시 열 때 보여줄 화면: main | schedule
      team: [],                  // 팀원 명단 (이름 문자열)
      supplyDefaults: ['본드', '장갑']  // 새 현장에 자동으로 깔리는 부자재
    };
  }
  function defaultState() {
    return { version: 1, clients: [], sites: [], photos: [], settings: defaultSettings(), syncQueue: [], lastSyncAt: 0, lastSyncError: '' };
  }
  function supplyRows(names) {
    return (names || []).map(function (n) { return { name: String(n || '').trim(), ready: false }; })
      .filter(function (r) { return r.name; });
  }
  function currentSupplyDefaults() {
    return (state && state.settings && state.settings.supplyDefaults) || defaultSettings().supplyDefaults;
  }
  function blankSite(clientId, color, supplyDefaults) {
    var now = Date.now();
    var s = { id: genId('s'), clientId: clientId, color: color, createdAt: now, updatedAt: now };
    Share.FIELDS.forEach(function (f) {
      if (f.type === 'select') s[f.key] = { v: '미확인', memo: '' };
      else if (f.type === 'films') s[f.key] = [];
      else s[f.key] = '';
    });
    // 일정: 1일차 = 시작날짜(비어있음), 부자재는 설정의 기본 항목 복사
    s.days = [{ date: '', staff: [] }];
    s.supplies = supplyRows(supplyDefaults || currentSupplyDefaults());
    s.filmStage = 0; // 필름 미확정
    s.needStaff = 0; // 총 필요 인원 (0 = 아직 안 정함)
    return s;
  }
  function cleanStaff(arr) {
    var out = [];
    (Array.isArray(arr) ? arr : []).forEach(function (n) {
      var v = String(n == null ? '' : n).trim();
      if (v && out.indexOf(v) === -1) out.push(v);
    });
    return out;
  }
  // 서버/구버전에서 온 현장 객체에 누락된 항목을 기본값으로 채움
  // 일정 필드(2026-09-19 추가): films[].ready, days, supplies 가 없던 현장을 보정한다
  function normalizeSite(raw, supplyDefaults) {
    var s = Object.assign(blankSite(raw.clientId, raw.color || 0, supplyDefaults), raw);
    Share.FIELDS.forEach(function (f) {
      if (f.type === 'select' && (!s[f.key] || typeof s[f.key] !== 'object')) s[f.key] = { v: '미확인', memo: '' };
      if (f.type === 'films' && !Array.isArray(s[f.key])) s[f.key] = [];
    });
    s.films = s.films.map(function (r) { return Object.assign({ place: '', code: '', ready: false }, r || {}, { ready: !!(r && r.ready) }); });
    if (!Array.isArray(s.days) || !s.days.length) s.days = [{ date: String(s.date || ''), staff: [] }];
    s.days = s.days.map(function (d) { return { date: String((d && d.date) || ''), staff: cleanStaff(d && d.staff) }; });
    // 1일차는 시작날짜 칸과 같아야 한다 (복원 등으로 어긋났으면 시작날짜 기준으로 밀기)
    if (s.days[0].date !== String(s.date || '')) s.days = Share.shiftDays(s.days, s.date || '');
    s.filmStage = Share.filmStageOf(s);
    s.needStaff = Share.needStaffOf(s);
    if (!Array.isArray(s.supplies)) s.supplies = supplyRows(supplyDefaults || currentSupplyDefaults());
    else s.supplies = s.supplies.map(function (r) { return { name: String((r && r.name) || ''), ready: !!(r && r.ready) }; });
    return s;
  }
  function normalizeClient(raw) {
    return Object.assign({ contacts: [], filmPrice: '', laborPrice: '', quoteNote: '', siteNote: '', order: 0, updatedAt: 0 }, raw);
  }
  // 사진(명함·단가표 등): 거래처 고정값에 붙는 이미지.
  // 폰 상태에는 작은 thumb 만 두고, 원본은 IndexedDB + 백업 조각 행에 따로 보관한다.
  // (구버전에서 만든 사진은 dataUrl 을 그대로 들고 있고, 그대로 동작한다)
  function normalizePhoto(raw) {
    return Object.assign({ id: '', clientId: '', name: '', thumb: '', dataUrl: '', w: 0, h: 0, bytes: 0, parts: 0, createdAt: 0, updatedAt: 0 }, raw);
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
      // 설정을 먼저 합쳐야 현장 보정(부자재 기본 항목)이 설정값을 쓸 수 있다
      state.settings = Object.assign(defaultSettings(), parsed.settings || {});
      state.settings.questions = Object.assign({}, Share.DEFAULT_QUESTIONS, (parsed.settings || {}).questions || {});
      state.clients = (parsed.clients || []).map(normalizeClient);
      state.sites = (parsed.sites || []).map(function (r) { return normalizeSite(r, state.settings.supplyDefaults); });
      state.photos = (parsed.photos || []).map(normalizePhoto);
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
    return { questions: state.settings.questions, team: state.settings.team, supplyDefaults: state.settings.supplyDefaults };
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
      for (var i = 0; i < (p.parts || 0); i++) enqueue({ op: 'delete', type: 'photo', id: p.id + '#' + i });
      enqueue({ op: 'delete', type: 'photo', id: p.id });
      delFull(p.id);
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
    // 시작날짜만 바뀌면(달력이 아니라 복원 등) 1일차가 따라가고 2일차 이후도 같은 일수만큼 밀린다.
    // days 를 같이 넘기면(달력에서 고른 날짜들) 그대로 쓴다
    if (patch && !patch.days && Object.prototype.hasOwnProperty.call(patch, 'date') && String(patch.date || '') !== String(s.date || '')) {
      patch = Object.assign({}, patch, { days: Share.shiftDays(s.days, patch.date || '') });
    }
    Object.assign(s, patch, { updatedAt: Date.now() });
    commit({ op: 'upsert', type: 'site', id: s.id, data: s });
    return s;
  }
  // ---------- 일정: 인원 / 일차 / 준비 체크 ----------
  function dayRows(s) { return (s.days || []).map(function (d) { return { date: d.date, staff: d.staff.slice() }; }); }
  function addStaff(siteId, dayIndex, name) {
    var s = getSite(siteId); if (!s || !s.days[dayIndex]) return null;
    var v = String(name == null ? '' : name).trim();
    if (!v || s.days[dayIndex].staff.indexOf(v) !== -1) return s;
    var days = dayRows(s); days[dayIndex].staff.push(v);
    return updateSite(siteId, { days: days });
  }
  function removeStaff(siteId, dayIndex, name) {
    var s = getSite(siteId); if (!s || !s.days[dayIndex]) return null;
    var days = dayRows(s);
    days[dayIndex].staff = days[dayIndex].staff.filter(function (n) { return n !== name; });
    return updateSite(siteId, { days: days });
  }
  // 달력에서 고른 날짜들로 일차를 다시 짠다 (날짜순). 남아있는 날짜의 인원은 유지, 빠진 날의 인원은 버림.
  // 비면 1일차 한 줄(날짜 없음)만 남긴다. site.date 는 항상 첫날.
  function setDays(siteId, dates) {
    var s = getSite(siteId); if (!s) return null;
    var uniq = {};
    (dates || []).forEach(function (d) { if (Share.isIsoDate(d)) uniq[d] = true; });
    var sorted = Object.keys(uniq).sort();
    var staffByDate = {};
    s.days.forEach(function (d) { if (d.date) staffByDate[d.date] = d.staff.slice(); });
    var days = sorted.map(function (d) { return { date: d, staff: staffByDate[d] || [] }; });
    if (!days.length) days = [{ date: '', staff: (s.days[0] && !s.days[0].date) ? s.days[0].staff.slice() : [] }];
    return updateSite(siteId, { date: days[0].date, days: days });
  }
  // 마지막 일차 다음 날을 붙인다. 마지막 날짜가 비어있으면 빈 날짜로
  function addDay(siteId) {
    var s = getSite(siteId); if (!s) return null;
    var days = dayRows(s), last = days.length ? days[days.length - 1].date : '';
    days.push({ date: Share.addDays(last, 1), staff: [] });
    return updateSite(siteId, { days: days });
  }
  // 1일차(i=0)는 시작날짜 칸이 주인이라 여기서 못 지우고 못 바꾼다
  function removeDay(siteId, i) {
    var s = getSite(siteId); if (!s || i < 1 || !s.days[i]) return null;
    var days = dayRows(s); days.splice(i, 1);
    return updateSite(siteId, { days: days });
  }
  function setDayDate(siteId, i, iso) {
    var s = getSite(siteId); if (!s || i < 1 || !s.days[i]) return null;
    var days = dayRows(s); days[i].date = String(iso || '');
    return updateSite(siteId, { days: days });
  }
  // 총 필요 인원 (0 = 안 정함). 날짜별 배치 인원은 이 수와 견줘서 표시된다
  function setNeedStaff(siteId, n) {
    var s = getSite(siteId); if (!s) return null;
    return updateSite(siteId, { needStaff: Share.needStaffOf({ needStaff: n }) });
  }
  function setFilmStage(siteId, k) {
    var s = getSite(siteId); if (!s) return null;
    return updateSite(siteId, { filmStage: Share.filmStageOf({ filmStage: k }) });
  }
  function toggleFilm(siteId, i) {
    var s = getSite(siteId); if (!s || !s.films[i]) return null;
    var films = s.films.map(function (r) { return Object.assign({}, r); });
    films[i].ready = !films[i].ready;
    return updateSite(siteId, { films: films });
  }
  function toggleSupply(siteId, i) {
    var s = getSite(siteId); if (!s || !s.supplies[i]) return null;
    var sup = s.supplies.map(function (r) { return Object.assign({}, r); });
    sup[i].ready = !sup[i].ready;
    return updateSite(siteId, { supplies: sup });
  }
  function addSupply(siteId, name) {
    var s = getSite(siteId); if (!s) return null;
    var v = String(name == null ? '' : name).trim();
    if (!v || s.supplies.some(function (r) { return r.name === v; })) return s;
    return updateSite(siteId, { supplies: s.supplies.concat([{ name: v, ready: false }]) });
  }
  function removeSupply(siteId, i) {
    var s = getSite(siteId); if (!s || !s.supplies[i]) return null;
    var sup = s.supplies.slice(); sup.splice(i, 1);
    return updateSite(siteId, { supplies: sup });
  }

  function deleteSite(id) {
    state.sites = state.sites.filter(function (s) { return s.id !== id; });
    commit({ op: 'delete', type: 'site', id: id });
  }

  // ---------- 사진 원본 저장소 (IndexedDB, 없으면 localStorage) ----------
  // 원본은 수백 KB 라 상태 JSON 에 넣으면 입력할 때마다 통째로 직렬화돼 느려지고 용량도 금방 찬다.
  var DB_NAME = 'sitenote', DB_STORE = 'photos', dbPromise = null;
  function idb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB 없음')); return; }
      var req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function () { req.result.createObjectStore(DB_STORE); };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error || new Error('IndexedDB 열기 실패')); };
    });
    return dbPromise;
  }
  function idbRun(mode, fn) {
    return idb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(DB_STORE, mode), req = fn(tx.objectStore(DB_STORE));
        tx.oncomplete = function () { resolve(req ? req.result : undefined); };
        tx.onabort = tx.onerror = function () { reject(tx.error || new Error('사진 저장 실패')); };
      });
    });
  }
  function photoKey(id) { return KEY + '.photo.' + id; }
  function putFull(id, dataUrl) {
    return idbRun('readwrite', function (st) { return st.put(dataUrl, id); })
      .catch(function () { localStorage.setItem(photoKey(id), dataUrl); }); // IndexedDB 못 쓰는 브라우저
  }
  function getFull(id) {
    return idbRun('readonly', function (st) { return st.get(id); })
      .catch(function () { return null; })
      .then(function (v) {
        if (v) return v;
        try { return localStorage.getItem(photoKey(id)) || ''; } catch (e) { return ''; }
      });
  }
  function delFull(id) {
    return idbRun('readwrite', function (st) { return st.delete(id); })
      .catch(function () { /* 없으면 그만 */ })
      .then(function () { try { localStorage.removeItem(photoKey(id)); } catch (e) { /* 무시 */ } });
  }
  // 원본은 Airtable 한 칸 한도(10만자)에 맞춰 조각 행으로 나눠 보낸다.
  // 큐에는 본문 대신 '몇 번째 조각인지'만 넣고, 전송 직전에 원본에서 잘라 채운다 —
  // 그래야 백업 전까지 폰 저장소에 수백 KB 짜리 사본이 쌓이지 않는다.
  function chunkOps(photoId, parts) {
    var ops = [];
    for (var i = 0; i < parts; i++) ops.push({ op: 'upsert', type: 'photo', id: photoId + '#' + i, photoRef: photoId, part: i });
    return ops;
  }
  // 큐 항목 → 실제 전송할 op (조각 참조는 여기서 본문을 채움)
  function resolveOps(batch) {
    var cache = {};
    return Promise.all(batch.map(function (o) {
      if (!o.photoRef) return o;
      cache[o.photoRef] = cache[o.photoRef] || getFull(o.photoRef).then(function (url) {
        return Share.splitChunks(url, Share.PHOTO_CHUNK);
      });
      return cache[o.photoRef].then(function (chunks) {
        return { op: o.op, type: o.type, id: o.id, ts: o.ts, seq: o.seq,
                 data: { id: o.id, photoId: o.photoRef, i: o.part, chunk: chunks[o.part] || '' } };
      });
    }));
  }

  // ---------- 사진 (거래처 고정값) ----------
  function getPhoto(id) { return state.photos.find(function (p) { return p.id === id; }) || null; }
  function photosOf(clientId) {
    return state.photos.filter(function (p) { return p.clientId === clientId; })
      .sort(function (a, b) { return (a.createdAt || 0) - (b.createdAt || 0); });
  }
  // photo = { name, thumb, dataUrl(원본), w, h, bytes }
  // 원본은 IndexedDB 에, 메타(+thumb)는 상태에 저장. 저장공간이 가득 차면 되돌리고 null.
  function addPhoto(clientId, photo) {
    var now = Date.now();
    var full = String((photo && photo.dataUrl) || '');
    var p = normalizePhoto(Object.assign({ id: genId('p'), clientId: clientId, createdAt: now }, photo, {
      dataUrl: '', parts: Math.ceil(full.length / Share.PHOTO_CHUNK), updatedAt: now
    }));
    return putFull(p.id, full).then(function () {
      state.photos.push(p);
      if (!commit({ op: 'upsert', type: 'photo', id: p.id, data: p })) throw new Error('quota');
      chunkOps(p.id, p.parts).forEach(enqueue);
      commit(null);
      return p;
    }).catch(function () {
      state.photos = state.photos.filter(function (x) { return x.id !== p.id; });
      state.syncQueue = state.syncQueue.filter(function (o) { return !(o.type === 'photo' && String(o.id).indexOf(p.id) === 0); });
      persist(); emit();
      return delFull(p.id).then(function () { return null; });
    });
  }
  // 사진 원본 (없으면 thumb 이라도)
  function photoData(id) {
    var p = getPhoto(id);
    if (!p) return Promise.resolve('');
    if (p.dataUrl) return Promise.resolve(p.dataUrl); // 구버전 사진
    return getFull(id).then(function (v) { return v || p.thumb || ''; });
  }
  function updatePhoto(id, patch) {
    var p = getPhoto(id);
    if (!p) return null;
    Object.assign(p, patch, { updatedAt: Date.now() });
    commit({ op: 'upsert', type: 'photo', id: p.id, data: p });
    return p;
  }
  function deletePhoto(id) {
    var p = getPhoto(id);
    var parts = (p && p.parts) || 0;
    state.photos = state.photos.filter(function (x) { return x.id !== id; });
    for (var i = 0; i < parts; i++) enqueue({ op: 'delete', type: 'photo', id: id + '#' + i });
    commit({ op: 'delete', type: 'photo', id: id });
    return delFull(id);
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
    return resolveOps(batch)
      .then(function (ops) {
        return fetchWithTimeout(SYNC_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: state.settings.backupKey, ops: ops }) });
      })
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
        var keep = { backupKey: state.settings.backupKey, lastTab: state.settings.lastTab, lastView: state.settings.lastView };
        var ds = data.settings || {};
        state.settings = Object.assign(defaultSettings(), { team: ds.team, supplyDefaults: ds.supplyDefaults }, keep);
        if (!Array.isArray(state.settings.team)) state.settings.team = [];
        if (!Array.isArray(state.settings.supplyDefaults)) state.settings.supplyDefaults = defaultSettings().supplyDefaults;
        state.settings.questions = Object.assign({}, Share.DEFAULT_QUESTIONS, ds.questions || {});
        state.clients = (data.clients || []).map(normalizeClient);
        state.sites = (data.sites || []).map(function (r) { return normalizeSite(r, state.settings.supplyDefaults); });
        var metas = [], chunksById = {};
        (data.photos || []).forEach(function (r) {
          if (!r || !r.id) return;
          if (r.photoId) (chunksById[r.photoId] = chunksById[r.photoId] || []).push(r);
          else metas.push(normalizePhoto(r));
        });
        state.photos = metas;
        var fulls = metas.map(function (m) {
          var joined = Share.joinChunks(chunksById[m.id]);
          return joined ? putFull(m.id, joined).catch(function () { /* 저장 실패해도 나머지는 복원 */ }) : null;
        }).filter(Boolean);
        state.syncQueue = [];
        state.lastSyncAt = Date.now();
        state.lastSyncError = '';
        persist(); emit();
        return Promise.all(fulls).then(function () {
          return { clients: state.clients.length, sites: state.sites.length, photos: state.photos.length };
        });
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
    addStaff: addStaff, removeStaff: removeStaff, setDays: setDays, addDay: addDay, removeDay: removeDay, setDayDate: setDayDate,
    setNeedStaff: setNeedStaff, setFilmStage: setFilmStage, toggleFilm: toggleFilm, toggleSupply: toggleSupply, addSupply: addSupply, removeSupply: removeSupply,
    getPhoto: getPhoto, photosOf: photosOf, addPhoto: addPhoto, updatePhoto: updatePhoto, deletePhoto: deletePhoto,
    photoData: photoData,
    setSettings: setSettings,
    pendingCount: pendingCount, flush: flush, restore: restore,
    onChange: onChange,
    SYNC_URL: SYNC_URL, RESTORE_URL: RESTORE_URL
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Store;
  else root.Store = Store;
})(typeof window !== 'undefined' ? window : this);
