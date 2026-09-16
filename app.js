// app.js — 화면 렌더·이벤트 (메인 / 현장 상세 / 설정)
// 라우팅은 해시로: ''(메인) | '#site/<id>' | '#settings'  → 폰 뒤로가기 버튼이 그대로 동작
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var state = Store.load();
  var currentClientId = state.settings.lastTab || '';
  var currentSiteId = '';
  var checked = {}; // 상세 화면 체크박스 상태 {key: bool} — 화면 진입 시 초기화

  // ---------- 공용 UI ----------
  var toastTimer = null;
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 1800);
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function openModal(title, bodyHtml, buttons) {
    $('modalTitle').textContent = title;
    $('modalBody').innerHTML = bodyHtml;
    var wrap = $('modalBtns'); wrap.innerHTML = '';
    buttons.forEach(function (b) {
      var btn = document.createElement('button');
      btn.textContent = b.label; if (b.cls) btn.className = b.cls;
      btn.onclick = function () { b.onClick && b.onClick(); };
      wrap.appendChild(btn);
    });
    wrap.hidden = !buttons.length;
    $('modal').hidden = false;
  }
  function closeModal() { $('modal').hidden = true; }
  $('modal').addEventListener('click', function (e) { if (e.target === $('modal')) closeModal(); });

  function modalPrompt(title, value, placeholder) {
    return new Promise(function (resolve) {
      openModal(title, '<input type="text" id="modalInput" value="' + esc(value || '') + '" placeholder="' + esc(placeholder || '') + '">', [
        { label: '취소', onClick: function () { closeModal(); resolve(null); } },
        { label: '확인', cls: 'primary', onClick: function () { var v = $('modalInput').value; closeModal(); resolve(v); } }
      ]);
      var inp = $('modalInput');
      inp.focus(); inp.select();
      // 한글 IME 조합 중 Enter(keyCode 229) 는 글자 확정용이므로 무시
      inp.onkeydown = function (e) { if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) { var v = inp.value; closeModal(); resolve(v); } };
    });
  }
  function modalConfirm(title, msg, okLabel, danger) {
    return new Promise(function (resolve) {
      openModal(title, '<p style="margin:0;line-height:1.6">' + esc(msg) + '</p>', [
        { label: '취소', onClick: function () { closeModal(); resolve(false); } },
        { label: okLabel || '확인', cls: danger ? 'danger' : 'primary', onClick: function () { closeModal(); resolve(true); } }
      ]);
    });
  }
  // 하단 시트 느낌의 선택 메뉴: items = [{label, cls, value}]
  function modalSheet(title, items) {
    return new Promise(function (resolve) {
      var html = '<div class="sheet-list">' + items.map(function (it, i) {
        return '<button data-i="' + i + '" class="' + (it.cls || '') + '">' + esc(it.label) + '</button>';
      }).join('') + '</div>';
      openModal(title, html, [{ label: '닫기', onClick: function () { closeModal(); resolve(null); } }]);
      $('modalBody').querySelectorAll('button').forEach(function (b) {
        b.onclick = function () { closeModal(); resolve(items[+b.dataset.i].value); };
      });
    });
  }
  // 클립보드 복사. 실패하면 텍스트를 선택된 상태로 보여줘서 수동 복사
  function copyText(text, okMsg) {
    var done = function () { toast(okMsg || '복사됨 — 카톡/문자에 붙여넣기 하세요'); };
    var fallback = function () {
      openModal('복사', '<textarea id="modalCopy" readonly></textarea><p class="hint" style="margin-top:8px">자동 복사가 안 되면 길게 눌러 복사하세요.</p>',
        [{ label: '닫기', cls: 'primary', onClick: closeModal }]);
      var ta = $('modalCopy'); ta.value = text; ta.focus(); ta.select();
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, fallback);
    } else fallback();
  }

  // ---------- 라우팅 ----------
  function route() {
    var h = location.hash || '';
    var m = /^#site\/(.+)$/.exec(h);
    if (m && Store.getSite(m[1])) { currentSiteId = m[1]; showView('viewSite'); renderSite(); return; }
    var mp = /^#photo\/(.+)$/.exec(h);
    if (mp && Store.getPhoto(mp[1])) { showView('viewMain'); renderMain(); openPhotoViewer(mp[1]); return; }
    closePhotoViewer();
    if (h === '#settings') { showView('viewSettings'); renderSettings(); return; }
    if (h && h !== '#') { history.replaceState(null, '', location.pathname); }
    currentSiteId = '';
    showView('viewMain'); renderMain();
  }
  function showView(id) {
    ['viewMain', 'viewSite', 'viewSettings'].forEach(function (v) { $(v).hidden = v !== id; });
    window.scrollTo(0, 0);
  }
  function go(hash) { location.hash = hash; }
  function back() { if (history.length > 1) history.back(); else location.hash = ''; }
  window.addEventListener('hashchange', route);

  // ---------- 메인: 탭 ----------
  function ensureCurrentClient() {
    var cs = Store.clients();
    if (!cs.length) { currentClientId = ''; return; }
    if (!cs.some(function (c) { return c.id === currentClientId; })) currentClientId = cs[0].id;
  }
  function selectClient(id) {
    currentClientId = id;
    if (state.settings.lastTab !== id) Store.setSettings({ lastTab: id });
    renderMain();
  }
  function renderTabs() {
    var wrap = $('tabs'); wrap.innerHTML = '';
    Store.clients().forEach(function (c) {
      var b = document.createElement('button');
      b.className = 'tab' + (c.id === currentClientId ? ' active' : '');
      b.textContent = c.name; b.dataset.id = c.id;
      b.onclick = function () { selectClient(c.id); };
      attachLongPress(b, function () { clientMenu(c.id); });
      wrap.appendChild(b);
    });
    var active = wrap.querySelector('.tab.active');
    if (active && active.scrollIntoView) active.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  }
  // 길게 누르기(500ms) — 탭 순서/이름/삭제 메뉴
  function attachLongPress(el, fn) {
    var t = null, moved = false;
    var start = function () { moved = false; t = setTimeout(function () { t = null; if (!moved) fn(); }, 500); };
    var cancel = function () { if (t) { clearTimeout(t); t = null; } };
    el.addEventListener('touchstart', start, { passive: true });
    el.addEventListener('touchmove', function () { moved = true; cancel(); }, { passive: true });
    el.addEventListener('touchend', cancel); el.addEventListener('touchcancel', cancel);
    el.addEventListener('mousedown', start); el.addEventListener('mouseup', cancel); el.addEventListener('mouseleave', cancel);
    el.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  }
  function clientMenu(id) {
    var c = Store.getClient(id); if (!c) return;
    var ids = Store.clients().map(function (x) { return x.id; });
    var i = ids.indexOf(id);
    var items = [{ label: '✏️ 이름 변경', value: 'rename' }];
    if (i > 0) items.push({ label: '◀ 왼쪽으로 이동', value: 'left' });
    if (i < ids.length - 1) items.push({ label: '▶ 오른쪽으로 이동', value: 'right' });
    items.push({ label: '🗑 거래처 삭제', value: 'delete', cls: 'danger' });
    modalSheet(c.name, items).then(function (v) {
      if (v === 'rename') return renameClient(id);
      if (v === 'delete') return deleteClient(id);
      if (v === 'left' || v === 'right') {
        var j = v === 'left' ? i - 1 : i + 1;
        ids.splice(i, 1); ids.splice(j, 0, id);
        Store.reorderClients(ids); renderMain();
      }
    });
  }
  function renameClient(id) {
    var c = Store.getClient(id); if (!c) return;
    modalPrompt('거래처 이름 변경', c.name).then(function (v) {
      if (v == null || !v.trim()) return;
      Store.renameClient(id, v); renderMain();
    });
  }
  function deleteClient(id) {
    var c = Store.getClient(id); if (!c) return;
    var n = Store.sitesOf(id).length;
    var np = Store.photosOf(id).length;
    modalConfirm('거래처 삭제', '"' + c.name + '" 거래처와 현장 ' + n + '개' + (np ? ', 사진 ' + np + '장' : '') + '을 삭제합니다. 되돌릴 수 없습니다.', '삭제', true).then(function (ok) {
      if (!ok) return;
      Store.deleteClient(id); ensureCurrentClient(); renderMain(); toast('삭제됨');
    });
  }
  $('btnAddClient').onclick = function () {
    modalPrompt('거래처 추가', '', '예: 피케이디자인').then(function (v) {
      if (v == null || !v.trim()) return;
      var c = Store.addClient(v); selectClient(c.id);
    });
  };

  // ---------- 메인: 고정값 ----------
  var fixedOpen = false;
  $('fixedToggle').onclick = function () { fixedOpen = !fixedOpen; renderFixed(); };
  function renderFixed() {
    var c = Store.getClient(currentClientId);
    $('fixedWrap').hidden = !c;
    if (!c) return;
    $('fixedWrap').classList.toggle('open', fixedOpen);
    $('fixedBody').hidden = !fixedOpen;
    if (!fixedOpen) return;
    ['filmPrice', 'laborPrice', 'quoteNote', 'siteNote'].forEach(function (k) {
      var el = document.querySelector('[data-fx="' + k + '"]');
      if (document.activeElement !== el) el.value = c[k] || '';
    });
    renderContacts(c);
    renderPhotos(c);
  }
  document.querySelectorAll('[data-fx]').forEach(function (el) {
    el.addEventListener('input', function () {
      var patch = {}; patch[el.dataset.fx] = el.value;
      Store.updateClient(currentClientId, patch);
    });
  });
  function renderContacts(c) {
    var wrap = $('contactList'); wrap.innerHTML = '';
    (c.contacts || []).forEach(function (ct, i) {
      var row = document.createElement('div'); row.className = 'contact-row';
      var tel = (ct.phone || '').replace(/[^0-9+]/g, '');
      row.innerHTML = '<input type="text" class="name" placeholder="이름" value="' + esc(ct.name) + '">' +
        '<input type="tel" class="phone" placeholder="전화번호" value="' + esc(ct.phone) + '">' +
        '<a class="tel' + (tel ? '' : ' disabled') + '" href="tel:' + esc(tel) + '" title="전화걸기">📞</a>' +
        '<button class="x" title="삭제">×</button>';
      var save = function () {
        var contacts = c.contacts.slice();
        contacts[i] = { name: row.querySelector('.name').value, phone: row.querySelector('.phone').value };
        Store.updateClient(c.id, { contacts: contacts });
        var t = (contacts[i].phone || '').replace(/[^0-9+]/g, '');
        var a = row.querySelector('a.tel'); a.href = 'tel:' + t; a.classList.toggle('disabled', !t);
      };
      row.querySelector('.name').addEventListener('input', save);
      row.querySelector('.phone').addEventListener('input', save);
      row.querySelector('.x').onclick = function () {
        var contacts = c.contacts.slice(); contacts.splice(i, 1);
        Store.updateClient(c.id, { contacts: contacts }); renderContacts(Store.getClient(c.id));
      };
      wrap.appendChild(row);
    });
  }
  $('btnAddContact').onclick = function () {
    var c = Store.getClient(currentClientId); if (!c) return;
    Store.updateClient(c.id, { contacts: (c.contacts || []).concat([{ name: '', phone: '' }]) });
    renderContacts(Store.getClient(c.id));
    var inputs = $('contactList').querySelectorAll('.name'); if (inputs.length) inputs[inputs.length - 1].focus();
  };
  // ---------- 메인: 고정값 사진 (명함·단가표 등) ----------
  function renderPhotos(c) {
    var wrap = $('photoList'); wrap.innerHTML = '';
    var photos = Store.photosOf(c.id);
    wrap.hidden = !photos.length;
    $('photoEmpty').hidden = photos.length > 0;
    photos.forEach(function (p) {
      var item = document.createElement('button');
      item.type = 'button'; item.className = 'photo-item'; item.title = p.name || '사진';
      var img = document.createElement('img');
      img.alt = p.name || '사진';
      img.loading = 'lazy';
      var small = p.thumb || p.dataUrl;
      if (Share.isImageDataUrl(small)) img.src = small;
      var cap = document.createElement('span');
      cap.className = 'photo-cap' + (p.name ? '' : ' empty');
      cap.textContent = p.name || '설명 없음';
      item.appendChild(img); item.appendChild(cap);
      item.onclick = function () { go('#photo/' + p.id); };
      wrap.appendChild(item);
    });
  }

  // 파일 → JPEG data URL. 단가표 숫자가 읽혀야 하므로 품질보다 해상도를 먼저 지킨다
  function readImage(file) {
    return new Promise(function (resolve, reject) {
      var byFileReader = function () {
        var fr = new FileReader();
        fr.onload = function () {
          var img = new Image();
          img.onload = function () { resolve(img); };
          img.onerror = function () { reject(new Error('이미지 형식을 열 수 없습니다')); };
          img.src = fr.result;
        };
        fr.onerror = function () { reject(new Error('파일을 읽을 수 없습니다')); };
        fr.readAsDataURL(file);
      };
      // createImageBitmap 은 폰 사진의 회전(EXIF)까지 반영해준다. 안 되면 FileReader 로 대체
      if (typeof createImageBitmap === 'function') {
        try {
          createImageBitmap(file, { imageOrientation: 'from-image' }).then(resolve, byFileReader);
          return;
        } catch (e) { /* 옵션 미지원 */ }
      }
      byFileReader();
    });
  }
  function drawTo(img, dim) {
    var w0 = img.width || img.naturalWidth, h0 = img.height || img.naturalHeight;
    var scale = Math.min(1, dim / Math.max(w0, h0));
    var w = Math.max(1, Math.round(w0 * scale)), h = Math.max(1, Math.round(h0 * scale));
    var cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    var ctx = cv.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); // 투명 PNG 가 검게 나오지 않도록
    ctx.drawImage(img, 0, 0, w, h);
    return { cv: cv, w: w, h: h };
  }
  // 큰 변부터 줄이고, 같은 크기 안에서 품질을 낮춰가며 한도에 맞춤
  function encode(img, dims, quals, maxBytes) {
    var best = null;
    for (var d = 0; d < dims.length; d++) {
      var c = drawTo(img, dims[d]);
      for (var q = 0; q < quals.length; q++) {
        var url = c.cv.toDataURL('image/jpeg', quals[q]);
        var bytes = Share.dataUrlBytes(url);
        var cand = { dataUrl: url, w: c.w, h: c.h, bytes: bytes };
        if (!best || bytes < best.bytes) best = cand;
        if (bytes <= maxBytes) return cand;
      }
    }
    return best;
  }
  function compressImage(file) {
    return readImage(file).then(function (img) {
      if (!(img.width || img.naturalWidth)) throw new Error('이미지 크기를 알 수 없습니다');
      var dims = [];
      for (var d = Share.PHOTO_MAX_DIM; d >= Share.PHOTO_MIN_DIM; d = Math.round(d * 0.8)) dims.push(d);
      var full = encode(img, dims, [0.85, 0.75, 0.65, 0.55, 0.45], Share.PHOTO_MAX_BYTES);
      if (!full) throw new Error('사진을 변환하지 못했습니다');
      var thumb = encode(img, [Share.PHOTO_THUMB_DIM, 300, 240], [0.7, 0.6, 0.5], Share.PHOTO_THUMB_BYTES);
      return { dataUrl: full.dataUrl, w: full.w, h: full.h, bytes: full.bytes, thumb: (thumb || full).dataUrl };
    });
  }
  // 여러 장은 한 장씩 차례로 (폰 메모리 아끼기). 다 올리면 설명(메모)을 물어본다
  function addPhotoFiles(files) {
    var c = Store.getClient(currentClientId); if (!c || !files.length) return;
    toast(files.length > 1 ? '사진 ' + files.length + '장 처리 중…' : '사진 처리 중…');
    var added = [], failMsg = '';
    var next = function (i) {
      if (i >= files.length) {
        renderPhotos(Store.getClient(currentClientId));
        if (failMsg) toast(failMsg);
        if (added.length) askPhotoNames(added, 0);
        else if (!failMsg) toast('추가된 사진이 없습니다');
        return;
      }
      var f = files[i];
      if (!/^image\//.test(f.type || '')) { failMsg = '이미지 파일만 올릴 수 있습니다'; next(i + 1); return; }
      compressImage(f).then(function (r) {
        return Store.addPhoto(currentClientId, { name: '', thumb: r.thumb, dataUrl: r.dataUrl, w: r.w, h: r.h, bytes: r.bytes });
      }).then(function (saved) {
        if (saved) added.push(saved.id);
        else failMsg = '폰 저장공간이 가득 찼습니다 — 사진을 지우고 다시 시도하세요';
        next(i + 1);
      }).catch(function (e) {
        failMsg = (e && e.message) || '사진을 읽지 못했습니다';
        next(i + 1);
      });
    };
    next(0);
  }
  // 올린 직후 설명 입력 — 나중에 찾으려면 "영림 2026년 단가" 같은 메모가 있어야 한다
  function askPhotoNames(ids, i) {
    if (i >= ids.length) { toast('사진 ' + ids.length + '장 추가됨'); return; }
    var p = Store.getPhoto(ids[i]);
    if (!p) { askPhotoNames(ids, i + 1); return; }
    modalPrompt('사진 설명 ' + (ids.length > 1 ? '(' + (i + 1) + '/' + ids.length + ')' : ''), '', '예: 영림 2026년 단가').then(function (v) {
      if (v != null && v.trim()) Store.updatePhoto(p.id, { name: v.trim() });
      renderPhotos(Store.getClient(currentClientId));
      askPhotoNames(ids, i + 1);
    });
  }
  $('btnAddPhoto').onclick = function () {
    if (!currentClientId) { toast('거래처를 먼저 선택하세요'); return; }
    var inp = $('photoInput'); inp.value = ''; inp.click();
  };
  $('photoInput').onchange = function () {
    var files = Array.prototype.slice.call($('photoInput').files || []);
    $('photoInput').value = '';
    addPhotoFiles(files);
  };

  // ---------- 사진 크게 보기 (전체 화면) ----------
  var viewerId = '';
  function openPhotoViewer(id) {
    var p = Store.getPhoto(id);
    if (!p) { back(); return; }
    viewerId = id;
    $('photoViewer').hidden = false;
    $('pvBox').classList.remove('zoom');
    $('pvMeta').textContent = p.w + '×' + p.h + ' · ' + Share.fmtBytes(p.bytes) + ' · 탭하면 확대';
    var nameInput = $('pvName');
    nameInput.value = p.name || '';
    var img = $('pvImg');
    img.removeAttribute('src');
    var small = p.thumb || p.dataUrl;
    if (Share.isImageDataUrl(small)) img.src = small;   // 먼저 작은 그림, 원본은 읽는 대로 교체
    Store.photoData(id).then(function (url) {
      if (viewerId === id && Share.isImageDataUrl(url)) img.src = url;
    });
  }
  function closePhotoViewer() {
    viewerId = '';
    $('photoViewer').hidden = true;
    $('pvBox').classList.remove('zoom');
    $('pvImg').removeAttribute('src');
  }
  $('pvClose').onclick = function () { back(); };
  $('pvName').addEventListener('input', function () {
    if (!viewerId) return;
    Store.updatePhoto(viewerId, { name: $('pvName').value });
    renderPhotos(Store.getClient(currentClientId));
  });
  // 앱 전체가 핀치줌을 막아놨으므로, 탭하면 원본 크기로 바꿔 스크롤해서 보게 한다 (단가표 숫자 확인용)
  $('pvImg').onclick = function () {
    var box = $('pvBox');
    if (!box.classList.toggle('zoom')) return;
    box.scrollLeft = (box.scrollWidth - box.clientWidth) / 2;
    box.scrollTop = (box.scrollHeight - box.clientHeight) / 2;
  };
  $('pvDelete').onclick = function () {
    var id = viewerId, p = Store.getPhoto(id); if (!p) return;
    modalConfirm('사진 삭제', '"' + (p.name || '설명 없음') + '" 사진을 삭제합니다.', '삭제', true).then(function (ok) {
      if (!ok) return;
      Store.deletePhoto(id);
      back(); toast('삭제됨');
    });
  };

  $('btnRenameClient').onclick = function () { renameClient(currentClientId); };
  $('btnDeleteClient').onclick = function () { deleteClient(currentClientId); };

  // ---------- 메인: 현장 카드 ----------
  function cardSummary(s) {
    var lines = [];
    if (s.date) lines.push('📅 ' + Share.shortDate(s.date));
    if (s.address && s.address.trim()) lines.push('📍 ' + s.address.trim());
    var films = (s.films || []).filter(function (r) { return r && (r.code || '').trim(); })
      .map(function (r) { return [r.place, r.code].filter(Boolean).join(' '); });
    if (films.length) lines.push('필름: ' + films.join(', '));
    if (!lines.length && s.memo && s.memo.trim()) lines.push(s.memo.trim().split('\n')[0]);
    return lines;
  }
  function renderCards() {
    var wrap = $('cards'); wrap.innerHTML = '';
    var empty = $('emptyState');
    if (!currentClientId) {
      empty.hidden = false; empty.innerHTML = '위의 <b>＋</b> 버튼으로 첫 거래처를 추가하세요.';
      $('btnAddSite').hidden = true; return;
    }
    $('btnAddSite').hidden = false;
    var sites = Store.sitesOf(currentClientId);
    empty.hidden = sites.length > 0;
    if (!sites.length) empty.innerHTML = '아래 <b>＋ 현장</b> 버튼으로 첫 현장을 추가하세요.';
    sites.forEach(function (s) {
      var card = document.createElement('div');
      card.className = 'card color-' + (s.color || 0);
      card.innerHTML = '<h3 class="card-title">' + esc(Share.titleLine(s)) + '</h3>' +
        cardSummary(s).map(function (l) { return '<div class="card-line">' + esc(l) + '</div>'; }).join('');
      card.onclick = function () { go('#site/' + s.id); };
      wrap.appendChild(card);
    });
  }
  $('btnAddSite').onclick = function () {
    if (!currentClientId) return;
    var s = Store.addSite(currentClientId);
    go('#site/' + s.id);
  };
  $('btnSettings').onclick = function () { go('#settings'); };

  function renderMain() {
    ensureCurrentClient();
    renderTabs(); renderFixed(); renderCards(); renderSyncBadge();
  }

  // ---------- 백업 상태 배지 ----------
  function renderSyncBadge() {
    var b = $('syncBadge');
    var n = Store.pendingCount();
    if (!state.settings.backupKey) { b.hidden = false; b.textContent = '백업키 없음'; b.className = 'sync-badge'; }
    else if (state.lastSyncError && n) { b.hidden = false; b.textContent = '⚠ 백업 대기 ' + n + '건'; b.className = 'sync-badge err'; }
    else if (n) { b.hidden = false; b.textContent = '백업 대기 ' + n + '건'; b.className = 'sync-badge'; }
    else b.hidden = true;
  }
  $('syncBadge').onclick = function () { go('#settings'); };
  Store.onChange(function () { renderSyncBadge(); if (!$('viewSettings').hidden) renderSyncStatus(); });

  // ---------- 현장 상세 ----------
  $('btnBack').onclick = back;
  $('btnSettingsBack').onclick = back;

  function renderSite() {
    var s = Store.getSite(currentSiteId); if (!s) { go(''); return; }
    // 체크박스 초기값: 현장명 빼고 전부 체크 (질문/공유 버튼이 빈/채움으로 자동 분리)
    checked = {};
    Share.FIELDS.forEach(function (f) { checked[f.key] = f.key !== 'name'; });
    $('siteTitle').textContent = Share.titleLine(s);
    $('colorPicker').hidden = true;
    renderColorPicker(s);
    var wrap = $('siteFields'); wrap.innerHTML = '';
    Share.FIELDS.forEach(function (f) { wrap.appendChild(fieldRow(s, f)); });
  }
  function renderColorPicker(s) {
    var wrap = $('colorPicker'); wrap.innerHTML = '';
    for (var i = 0; i < Share.COLOR_COUNT; i++) {
      (function (i) {
        var d = document.createElement('button');
        d.className = 'color-dot color-' + i + (s.color === i ? ' active' : '');
        d.onclick = function () { Store.updateSite(s.id, { color: i }); renderColorPicker(Store.getSite(s.id)); $('colorPicker').hidden = true; };
        wrap.appendChild(d);
      })(i);
    }
  }
  $('btnColor').onclick = function () { $('colorPicker').hidden = !$('colorPicker').hidden; };
  $('btnDeleteSite').onclick = function () {
    var s = Store.getSite(currentSiteId); if (!s) return;
    modalConfirm('현장 삭제', '"' + Share.titleLine(s) + '" 현장을 삭제합니다.', '삭제', true).then(function (ok) {
      if (!ok) return;
      Store.deleteSite(s.id); toast('삭제됨'); back();
    });
  };

  function refreshRowState(row, s, key) {
    row.classList.toggle('is-empty', Share.isEmpty(s, key));
    if (key === 'name' || key === 'unit' || key === 'size') $('siteTitle').textContent = Share.titleLine(s);
  }
  // 라벨 오른쪽 좁은 칸으로는 부족한 항목들 - 입력칸을 아래 줄로 내려 가로 폭을 꽉 채운다
  var WIDE_TYPES = { multiline: 1, films: 1, link: 1 };

  function fieldRow(s, f) {
    var row = document.createElement('div');
    // 긴 글·여러 칸이 들어가는 항목(메모, 필름/시공위치, 사진 링크)은 입력칸을
    // 라벨 아래 줄로 내려서 화면 가로 폭을 꽉 채운다 (frow-wide)
    row.className = 'frow' + (f.key === 'name' ? ' frow-name' : '') + (WIDE_TYPES[f.type] ? ' frow-wide' : '');
    var cb = document.createElement('input'); cb.type = 'checkbox'; cb.className = 'fcheck';
    cb.checked = !!checked[f.key]; cb.onchange = function () { checked[f.key] = cb.checked; };
    if (f.key === 'name') cb.style.visibility = 'hidden';
    var label = document.createElement('div'); label.className = 'flabel'; label.textContent = f.label;
    var ctl = document.createElement('div'); ctl.className = 'fctl';
    row.appendChild(cb); row.appendChild(label); row.appendChild(ctl);

    var save = function (patch) { s = Store.updateSite(s.id, patch) || s; refreshRowState(row, s, f.key); };

    if (f.type === 'text' || f.type === 'date') {
      var inp = document.createElement('input');
      inp.type = f.type === 'date' ? 'date' : 'text';
      inp.value = s[f.key] || '';
      inp.placeholder = f.key === 'name' ? '현장명 (예: 인천 청학동 시대아파트)' : '';
      inp.addEventListener('input', function () { var p = {}; p[f.key] = inp.value; save(p); });
      if (f.key === 'address') {
        var box = document.createElement('div'); box.className = 'with-btn';
        var nav = document.createElement('button'); nav.className = 'mini'; nav.textContent = '네비'; nav.type = 'button';
        nav.onclick = function () { openNavi(inp.value); };
        box.appendChild(inp); box.appendChild(nav); ctl.appendChild(box);
      } else ctl.appendChild(inp);
    } else if (f.type === 'select') {
      var box2 = document.createElement('div'); box2.className = 'sel-row';
      var sel = document.createElement('select');
      f.options.forEach(function (o) { var op = document.createElement('option'); op.value = o; op.textContent = o; sel.appendChild(op); });
      sel.value = (s[f.key] && s[f.key].v) || '미확인';
      var memo = document.createElement('input'); memo.type = 'text'; memo.placeholder = '메모'; memo.value = (s[f.key] && s[f.key].memo) || '';
      var saveSel = function () { var p = {}; p[f.key] = { v: sel.value, memo: memo.value }; save(p); };
      sel.onchange = saveSel; memo.addEventListener('input', saveSel);
      box2.appendChild(sel); box2.appendChild(memo); ctl.appendChild(box2);
    } else if (f.type === 'link') {
      // 현장사진 갤러리 주소를 붙여넣는 칸. 옆의 '열기' 로 바로 확인할 수 있게 한다.
      var box3 = document.createElement('div'); box3.className = 'with-btn';
      var link = document.createElement('input');
      link.type = 'text'; link.inputMode = 'url'; link.autocapitalize = 'off'; link.spellcheck = false;
      link.placeholder = '사진 링크 붙여넣기';
      link.value = s[f.key] || '';
      link.addEventListener('input', function () { var p = {}; p[f.key] = link.value; save(p); });
      var open = document.createElement('button'); open.className = 'mini'; open.type = 'button'; open.textContent = '열기';
      open.onclick = function () { openLink(link.value); };
      box3.appendChild(link); box3.appendChild(open); ctl.appendChild(box3);
    } else if (f.type === 'films') {
      renderFilms(ctl, s, save);
    } else { // multiline
      var ta = document.createElement('textarea'); ta.rows = 4; ta.value = s[f.key] || '';
      ta.placeholder = '카톡 대화 복붙, 기타 메모';
      ta.addEventListener('input', function () { var p = {}; p[f.key] = ta.value; save(p); });
      ctl.appendChild(ta);
    }
    refreshRowState(row, s, f.key);
    return row;
  }
  function renderFilms(ctl, s, save) {
    ctl.innerHTML = '';
    var films = (s.films || []).slice();
    if (!films.length) films.push({ place: '', code: '' });
    films.forEach(function (r, i) {
      var line = document.createElement('div'); line.className = 'film-row';
      line.innerHTML = '<input type="text" class="place" placeholder="시공위치 (현관문 뒷면)" value="' + esc(r.place) + '">' +
        '<input type="text" class="code" placeholder="필름번호 (PS035)" value="' + esc(r.code) + '">' +
        '<button type="button" class="x" title="줄 삭제">×</button>';
      var upd = function () {
        films[i] = { place: line.querySelector('.place').value, code: line.querySelector('.code').value };
        save({ films: films.slice() });
      };
      line.querySelector('.place').addEventListener('input', upd);
      line.querySelector('.code').addEventListener('input', upd);
      line.querySelector('.x').onclick = function () {
        films.splice(i, 1); save({ films: films.slice() }); renderFilms(ctl, Store.getSite(s.id), save);
      };
      ctl.appendChild(line);
    });
    var add = document.createElement('button'); add.type = 'button'; add.className = 'film-add'; add.textContent = '＋ 줄 추가';
    add.onclick = function () {
      films.push({ place: '', code: '' }); save({ films: films.slice() });
      renderFilms(ctl, Store.getSite(s.id), save);
      var ps = ctl.querySelectorAll('.place'); if (ps.length) ps[ps.length - 1].focus();
    };
    ctl.appendChild(add);
  }
  // 주소 복사 + 카카오맵 검색 열기 (폰에 카카오맵 앱이 있으면 앱으로 넘어감)
  // 붙여넣은 주소 열기 (공유 문구와 같은 방식으로 https:// 를 보정 - Share.linkUrl)
  function openLink(url) {
    var u = Share.linkUrl(url);
    if (!u) { toast('링크가 비어있습니다'); return; }
    window.open(u, '_blank');
  }
  function openNavi(addr) {
    addr = (addr || '').trim();
    if (!addr) { toast('주소가 비어있습니다'); return; }
    var url = 'https://map.kakao.com/link/search/' + encodeURIComponent(addr);
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(addr).catch(function () {});
    window.open(url, '_blank');
  }

  // ---------- 복사 버튼 ----------
  function checkedKeys() { return Object.keys(checked).filter(function (k) { return checked[k]; }); }
  // 저장 버튼 - 칸마다 이미 자동저장되고 있지만, 눌러서 확인할 수 있게 둔 버튼.
  // 실제로 하는 일: 키보드 내리기(마지막 입력 확정) + 백업 대기분을 3초 기다리지 않고 바로 전송.
  $('btnSaveSite').onclick = function () {
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    if (!state.settings.backupKey) { toast('저장됨 (백업키가 없어 폰에만 저장)'); return; }
    if (!Store.pendingCount()) { toast('저장됨 — 백업까지 완료'); return; }
    toast('저장 중...');
    Store.flush().then(function (ok) {
      toast(ok ? '저장됨 — 백업까지 완료' : '폰에 저장됨 — 백업은 잠시 뒤 다시 보냅니다');
    });
  };

  $('btnCopyQuestion').onclick = function () {
    var s = Store.getSite(currentSiteId); if (!s) return;
    var text = Share.buildQuestion(s, checkedKeys(), state.settings.questions);
    if (!text) { toast('질문할 항목이 없습니다 (비어있는 항목이 체크돼야 함)'); return; }
    copyText(text, '질문 복사됨 — 업자에게 붙여넣기 하세요');
  };
  $('btnCopyShare').onclick = function () {
    var s = Store.getSite(currentSiteId); if (!s) return;
    var keys = checkedKeys().filter(function (k) { return !Share.isEmpty(s, k); });
    if (!keys.length) { toast('공유할 항목이 없습니다 (채워진 항목이 체크돼야 함)'); return; }
    copyText(Share.buildShare(s, keys), '공유 문구 복사됨 — 팀원에게 붙여넣기 하세요');
  };

  // ---------- 설정 ----------
  function renderSettings() {
    $('backupKey').value = state.settings.backupKey || '';
    renderSyncStatus();
    var wrap = $('questionList'); wrap.innerHTML = '';
    Share.FIELDS.filter(function (f) { return f.question; }).forEach(function (f) {
      var row = document.createElement('div'); row.className = 'qrow';
      row.innerHTML = '<label class="field-label">' + esc(f.label) + '</label><input type="text" data-q="' + f.key + '">';
      var inp = row.querySelector('input'); inp.value = state.settings.questions[f.key] || f.question;
      inp.addEventListener('change', function () {
        var q = Object.assign({}, state.settings.questions); q[f.key] = inp.value.trim() || f.question;
        Store.setSettings({ questions: q });
      });
      wrap.appendChild(row);
    });
  }
  function fmtTime(ts) {
    if (!ts) return '없음';
    var d = new Date(ts);
    return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
  }
  function renderSyncStatus() {
    var el = $('syncStatus');
    var n = Store.pendingCount();
    var html = '백업 대기: <b>' + n + '건</b> · 마지막 성공: ' + fmtTime(state.lastSyncAt);
    if (!state.settings.backupKey) html += '<br><span class="err">백업키가 없어 백업이 꺼져 있습니다.</span>';
    else if (state.lastSyncError) html += '<br><span class="err">오류: ' + esc(state.lastSyncError) + '</span>';
    el.innerHTML = html;
  }
  $('btnSaveKey').onclick = function () {
    var k = $('backupKey').value.trim();
    var wasEmpty = !state.clients.length && !state.sites.length;
    Store.setSettings({ backupKey: k });
    toast(k ? '백업키 저장됨' : '백업키 지움');
    renderSyncStatus();
    // 새 폰: 키를 넣었는데 데이터가 비어있으면 자동 복원 시도
    if (k && wasEmpty) {
      Store.restore(false).then(function (r) {
        if (r) { toast('복원됨: 거래처 ' + r.clients + ', 현장 ' + r.sites + ', 사진 ' + r.photos); }
      }).catch(function (e) { toast('복원 실패: ' + e.message); });
    }
  };
  $('btnFlushNow').onclick = function () {
    if (!state.settings.backupKey) { toast('백업키를 먼저 저장하세요'); return; }
    if (!Store.pendingCount()) { toast('백업할 변경이 없습니다'); return; }
    Store.flush().then(function (ok) { toast(ok ? '백업 완료' : '백업 실패 — 나중에 다시 시도됩니다'); renderSyncStatus(); });
  };
  $('btnRestore').onclick = function () {
    if (!state.settings.backupKey) { toast('백업키를 먼저 저장하세요'); return; }
    modalConfirm('Airtable에서 복원', '이 폰의 거래처/현장 데이터를 모두 지우고 Airtable 백업으로 바꿉니다. 아직 백업 안 된 변경(' + Store.pendingCount() + '건)은 사라집니다.', '복원', true)
      .then(function (ok) {
        if (!ok) return;
        return modalConfirm('정말 복원할까요?', '되돌릴 수 없습니다.', '네, 복원', true).then(function (ok2) {
          if (!ok2) return;
          Store.restore(true).then(function (r) { toast('복원됨: 거래처 ' + r.clients + ', 현장 ' + r.sites + ', 사진 ' + r.photos); currentClientId = ''; renderSyncStatus(); })
            .catch(function (e) { toast('복원 실패: ' + e.message); });
        });
      });
  };
  $('btnResetQuestions').onclick = function () {
    modalConfirm('문구 초기화', '질문 문구를 모두 기본값으로 되돌립니다.', '초기화').then(function (ok) {
      if (!ok) return;
      Store.setSettings({ questions: Object.assign({}, Share.DEFAULT_QUESTIONS) }); renderSettings(); toast('초기화됨');
    });
  };

  // ---------- 시작 ----------
  if (state.settings.backupKey && Store.pendingCount()) Store.flush();
  route();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(function () { /* PWA 미지원 환경 */ });
  }
})();
