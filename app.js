// app.js — 화면 렌더·이벤트 (메인 / 현장 상세 / 설정)
// 라우팅은 해시로: ''(메인) | '#site/<id>' | '#settings' | '#schedule'  → 폰 뒤로가기 버튼이 그대로 동작
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
    if (h === '#schedule') { rememberView('schedule'); showView('viewSchedule'); renderSchedule(); return; }
    if (h && h !== '#') { history.replaceState(null, '', location.pathname); }
    currentSiteId = '';
    rememberView('main');
    showView('viewMain'); renderMain();
  }
  function showView(id) {
    ['viewMain', 'viewSite', 'viewSettings', 'viewSchedule'].forEach(function (v) { $(v).hidden = v !== id; });
    window.scrollTo(0, 0);
  }
  // 앱을 다시 열 때 마지막에 본 화면(거래처/일정)으로 시작한다
  function rememberView(v) { if (state.settings.lastView !== v) Store.setSettings({ lastView: v }); }
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
  $('btnSchedule').onclick = function () { go('#schedule'); };
  $('btnScheduleBack').onclick = function () { go(''); };
  $('btnScheduleSettings').onclick = function () { go('#settings'); };

  // ---------- 일정 화면 ----------
  // 오늘·내일은 펼쳐서(인원 칩 + 필름/부자재 체크) 보여주고, 그 뒤는 한 줄 요약. 탭하면 펼침/접힘.
  var SCHEDULE_DAYS = 14;
  var expandedIds = {};   // '현장id@날짜' → true/false (세션 동안만 기억)
  var showLater = false;  // '이후 일정 N건' 펼침 여부
  var showPast = false;   // '지난 일정 N건' 펼침 여부 (최근 날짜가 위)
  var WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];
  function dayHeading(iso, today) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    var d = new Date(+m[1], +m[2] - 1, +m[3]);
    var text = Share.shortDate(iso) + ' (' + WEEKDAY[d.getDay()] + ')';
    var tag = iso === today ? '오늘' : (iso === Share.addDays(today, 1) ? '내일' : '');
    return { text: text, tag: tag };
  }
  function isExpanded(entry, date, today) {
    var k = entry.site.id + '@' + date;
    if (Object.prototype.hasOwnProperty.call(expandedIds, k)) return expandedIds[k];
    return date === today || date === Share.addDays(today, 1);
  }
  function renderSchedule() {
    var body = $('scheduleBody'); body.innerHTML = '';
    var today = Share.todayIso();
    var g = Share.groupByDate(state.sites, today, SCHEDULE_DAYS);
    var dup = Share.findOverlaps(state.sites);
    var any = g.days.some(function (d) { return d.entries.length; }) || g.laterCount;
    var noDate = state.sites.filter(function (s) { return !Share.isIsoDate(s.date); }).length;
    var renderDay = function (d) {
      var h = dayHeading(d.date, today);
      var head = document.createElement('div'); head.className = 'sch-day' + (h.tag ? ' sch-day-near' : '');
      head.innerHTML = (h.tag ? '<span class="sch-tag' + (h.tag === '내일' ? ' tm' : '') + '">' + h.tag + '</span>' : '') + esc(h.text) +
        (d.entries.length ? '' : '<span class="sch-none">현장 없음</span>');
      body.appendChild(head);
      d.entries.forEach(function (entry) {
        body.appendChild(isExpanded(entry, d.date, today)
          ? renderScheduleCard(entry, d.date, dup[d.date] || {})
          : renderScheduleRow(entry, d.date));
      });
    };
    // 지난 일정: 맨 위에 접어두고, 펼치면 최근 날짜부터 거꾸로
    if (g.pastCount) {
      var pastBtn = document.createElement('button'); pastBtn.type = 'button'; pastBtn.className = 'sch-more';
      var pFirst = g.past[g.past.length - 1].date, pLast = g.past[0].date;
      pastBtn.textContent = (showPast ? '▾' : '▸') + ' 지난 일정 ' + g.pastCount + '건 (' + Share.shortDate(pFirst) + ' ~ ' + Share.shortDate(pLast) + ')';
      pastBtn.onclick = function () { showPast = !showPast; renderSchedule(); };
      body.appendChild(pastBtn);
      if (showPast) { g.past.forEach(renderDay); var sep = document.createElement('div'); sep.className = 'sch-sep'; body.appendChild(sep); }
    }
    if (!any) {
      var e = document.createElement('div'); e.className = 'empty-state';
      e.textContent = '오늘 이후 일정이 없습니다. 현장에 시공날짜를 넣으면 여기에 날짜순으로 나옵니다.' +
        (noDate ? ' (시공날짜가 없는 현장 ' + noDate + '건은 거래처 탭에 있습니다)' : '');
      body.appendChild(e);
      return;
    }
    g.days.forEach(renderDay);
    if (g.laterCount) {
      var more = document.createElement('button'); more.type = 'button'; more.className = 'sch-more';
      var first = g.later[0].date, last = g.later[g.later.length - 1].date;
      more.textContent = (showLater ? '▾' : '▸') + ' 이후 일정 ' + g.laterCount + '건 (' + Share.shortDate(first) + ' ~ ' + Share.shortDate(last) + ')';
      more.onclick = function () { showLater = !showLater; renderSchedule(); };
      body.appendChild(more);
      if (showLater) g.later.forEach(renderDay);
    }
  }
  function entryTitle(entry) {
    var t = Share.titleLine(entry.site);
    if (entry.dayCount > 1) t += ' · ' + (entry.dayIndex + 1) + '일차';
    return t;
  }
  function clientName(site) { var c = Store.getClient(site.clientId); return c ? c.name : ''; }
  // 업체명 조각: 탭하면 그 업체 탭이 열린 거래처 화면으로 간다
  function clientLink(site) {
    var el = document.createElement('button'); el.type = 'button'; el.className = 'sch-client';
    el.textContent = clientName(site) || '(거래처 없음)';
    el.title = '이 업체의 현장 목록 보기';
    el.onclick = function (e) {
      e.stopPropagation();
      currentClientId = site.clientId;
      if (state.settings.lastTab !== site.clientId) Store.setSettings({ lastTab: site.clientId });
      go('');
    };
    return el;
  }
  // 펼침 카드: 제목(탭 → 현장 상세) + 👤 칩 + 🎞 체크 + 🧰 체크. 체크·인원은 그 자리에서 바뀌고 즉시 저장
  function renderScheduleCard(entry, date, dupNames) {
    var s = entry.site, id = s.id;
    var card = document.createElement('div'); card.className = 'sch-card color-' + (s.color || 0);
    var head = document.createElement('div'); head.className = 'sch-card-head';
    var title = document.createElement('button'); title.type = 'button'; title.className = 'sch-title'; title.textContent = entryTitle(entry);
    title.onclick = function () { go('#site/' + id); };
    var cl = clientLink(s);
    var fold = document.createElement('button'); fold.type = 'button'; fold.className = 'sch-fold'; fold.textContent = '︿'; fold.title = '접기';
    fold.onclick = function () { expandedIds[id + '@' + date] = false; renderSchedule(); };
    head.appendChild(title); head.appendChild(cl); head.appendChild(fold);
    card.appendChild(head);

    // 필름 단계 띠는 1일차에만 (필름은 1일차 전에 다 받아야 하니 2일차부터는 의미 없음)
    if (entry.dayIndex === 0) {
      var stageLine = document.createElement('div'); stageLine.className = 'stage-strip';
      renderStageStrip(stageLine, s, { short: true, date: date, onPick: function (k) { Store.setFilmStage(id, k); renderSchedule(); } });
      card.appendChild(stageLine);
    }

    var staffLine = document.createElement('div'); staffLine.className = 'sch-line';
    staffLine.innerHTML = '<span class="sch-ico">👤</span>';
    var chips = document.createElement('div'); chips.className = 'chips';
    renderChips(chips, (s.days[entry.dayIndex] || {}).staff || [], {
      dup: dupNames,
      onRemove: function (n) { Store.removeStaff(id, entry.dayIndex, n); renderSchedule(); },
      onAdd: function () { openStaffPicker(id, entry.dayIndex, renderSchedule); }
    });
    staffLine.appendChild(chips); card.appendChild(staffLine);

    var filmLine = document.createElement('div'); filmLine.className = 'sch-line';
    filmLine.innerHTML = '<span class="sch-ico">🎞</span>';
    var films = document.createElement('div'); films.className = 'sch-checks';
    var anyFilm = false;
    s.films.forEach(function (r, i) {
      if (!r || !String(r.code || '').trim()) return;
      anyFilm = true;
      films.appendChild(checkRow([r.place, r.code].filter(Boolean).join(' '), r.ready, function () {
        var u = Store.toggleFilm(id, i); return u && u.films[i] && u.films[i].ready;
      }));
    });
    if (!anyFilm) films.innerHTML = '<span class="sch-none">(없음)</span>';
    filmLine.appendChild(films); card.appendChild(filmLine);

    var supLine = document.createElement('div'); supLine.className = 'sch-line';
    supLine.innerHTML = '<span class="sch-ico">🧰</span>';
    var sups = document.createElement('div'); sups.className = 'sch-checks';
    s.supplies.forEach(function (r, i) {
      sups.appendChild(checkRow(r.name, r.ready, function () {
        var u = Store.toggleSupply(id, i); return u && u.supplies[i] && u.supplies[i].ready;
      }));
    });
    if (!s.supplies.length) sups.innerHTML = '<span class="sch-none">(없음)</span>';
    supLine.appendChild(sups); card.appendChild(supLine);
    return card;
  }
  // 라벨이 붙은 체크 항목 (일정 카드용). 탭하면 토글, 모양만 바꾼다
  function checkRow(label, ready, onToggle) {
    var w = document.createElement('button'); w.type = 'button'; w.className = 'sch-chk' + (ready ? ' on' : '');
    w.innerHTML = '<span class="box"></span>' + esc(label);
    w.onclick = function () { var r = onToggle(); w.classList.toggle('on', !!r); };
    return w;
  }
  // 접힌 줄: 제목 · 👤이름 · 🎞 r/t · 🧰 r/t · 점(빨강=미준비/인원없음, 초록=준비 완료)
  function renderScheduleRow(entry, date) {
    var s = entry.site;
    // 줄 전체가 탭 대상이지만 안에 업체명 버튼이 있어서 <button> 대신 div[role=button]
    var row = document.createElement('div'); row.className = 'sch-row color-b-' + (s.color || 0);
    row.setAttribute('role', 'button'); row.tabIndex = 0;
    var c = Share.readyCount(s);
    var staff = ((s.days[entry.dayIndex] || {}).staff || []);
    var meta = '👤' + (staff.length ? staff.join(',') : '미배정') + ' · 🎞 ' + c.films[0] + '/' + c.films[1] + ' · 🧰 ' + c.supplies[0] + '/' + c.supplies[1];
    var head = document.createElement('span'); head.className = 'sch-row-head';
    var t = document.createElement('span'); t.className = 'sch-row-title'; t.textContent = entryTitle(entry);
    head.appendChild(t); head.appendChild(clientLink(s));
    row.appendChild(head);
    var m = document.createElement('span'); m.className = 'sch-row-meta'; m.textContent = meta; row.appendChild(m);
    var dot = document.createElement('span'); dot.className = 'dot' + (Share.isReady(s) ? ' ok' : ''); row.appendChild(dot);
    if (entry.dayIndex === 0) { // 필름 단계 띠는 1일차에만
      var strip = document.createElement('span'); strip.className = 'stage-strip stage-strip-sm';
      renderStageStrip(strip, s, { short: true, date: date });
      row.appendChild(strip);
    }
    row.onclick = function () { expandedIds[s.id + '@' + date] = true; renderSchedule(); };
    return row;
  }

  function renderSite() {
    var s = Store.getSite(currentSiteId); if (!s) { go(''); return; }
    // 체크박스 초기값: 현장명 빼고 전부 체크 (질문/공유 버튼이 빈/채움으로 자동 분리)
    checked = {};
    Share.FIELDS.forEach(function (f) { checked[f.key] = f.key !== 'name'; });
    $('siteTitle').textContent = Share.titleLine(s);
    $('colorPicker').hidden = true;
    renderColorPicker(s);
    var wrap = $('siteFields'); wrap.innerHTML = '';
    Share.FIELDS.forEach(function (f) {
      // 필름준비과정알림: 필름/시공위치 바로 위. 4단계 중 하나를 탭해서 고른다 (2026-09-20)
      if (f.key === 'films') {
        var stageBox = document.createElement('div'); stageBox.className = 'sec'; stageBox.id = 'stageSec'; wrap.appendChild(stageBox);
        renderStageSection(stageBox, s.id);
      }
      wrap.appendChild(fieldRow(s, f));
      // 일정·인원 / 부자재 구역은 필름 줄 다음, 현장사진 앞에 둔다 (2026-09-19 일정관리)
      if (f.key === 'films') {
        var daysBox = document.createElement('div'); daysBox.className = 'sec'; daysBox.id = 'daysSec'; wrap.appendChild(daysBox);
        renderDaysSection(daysBox, s.id);
        var supBox = document.createElement('div'); supBox.className = 'sec'; wrap.appendChild(supBox);
        renderSuppliesSection(supBox, s.id);
      }
    });
  }

  // ---------- 필름 준비 단계 (현장 상세 + 일정 화면 공용) ----------
  // 4칸 띠: 지난 단계·현재 단계는 파랑, 아직 안 온 단계는 빨강. 미확정(0)이면 네 칸 다 빨강.
  // 깜빡임은 눈이 아프니 시공일 3일 전부터만 (opts.date 기준, 없으면 site.date).
  // opts.onPick(k) 를 주면 탭해서 단계를 바꿀 수 있다
  function renderStageStrip(container, site, opts) {
    container.innerHTML = '';
    var k = Share.filmStageOf(site), last = Share.FILM_STAGES.length - 1;
    var urgent = Share.isUrgent((opts && opts.date) || site.date);
    Share.FILM_STAGES.forEach(function (label, i) {
      var el = document.createElement(opts && opts.onPick ? 'button' : 'span');
      if (el.tagName === 'BUTTON') el.type = 'button';
      var cls = 'stage';
      if (k === 0) cls += ' todo';                    // 아무것도 안 됨 - 전부 경고
      else if (i < k) cls += ' done';
      else if (i === k) cls += ' now';
      else cls += ' todo';
      if (cls.indexOf('todo') !== -1 && urgent) cls += ' blink';
      if (i === last && k === last) cls += ' final';
      el.className = cls;
      el.textContent = (opts && opts.short) ? label.replace('필름 ', '') : label;
      if (opts && opts.onPick) el.onclick = function (e) { e.stopPropagation(); opts.onPick(i); };
      container.appendChild(el);
    });
  }
  function renderStageSection(box, siteId) {
    var s = Store.getSite(siteId); if (!s) return;
    box.innerHTML = '<h3 class="sec-title">필름준비과정알림 <span class="sec-hint">— 지금 단계를 탭하세요</span></h3>';
    var strip = document.createElement('div'); strip.className = 'stage-strip stage-strip-lg';
    renderStageStrip(strip, s, { onPick: function (k) { Store.setFilmStage(siteId, k); renderStageSection(box, siteId); } });
    box.appendChild(strip);
  }

  // ---------- 일정·인원 / 부자재 (현장 상세 + 일정 화면 공용 조각) ----------
  // 체크 버튼: 탭하면 onToggle → 새 ready 값을 돌려받아 모양만 바꾼다 (입력 포커스를 잃지 않게 전체 재렌더 안 함)
  function checkBtn(ready, onToggle) {
    var b = document.createElement('button'); b.type = 'button'; b.className = 'chk' + (ready ? ' on' : '');
    b.setAttribute('aria-label', '준비됨');
    b.onclick = function (e) { e.stopPropagation(); var r = onToggle(); b.classList.toggle('on', !!r); };
    return b;
  }
  // 이름 칩 목록. opts.dup: {정규화이름: true} 이면 빨간 겹침 표시, opts.onRemove(name), opts.onAdd()
  function renderChips(container, names, opts) {
    container.innerHTML = '';
    var dup = (opts && opts.dup) || {};
    (names || []).forEach(function (n) {
      var c = document.createElement('button'); c.type = 'button';
      var isDup = !!dup[String(n).replace(/\s+/g, '')];
      c.className = 'chip' + (isDup ? ' dup' : '');
      c.textContent = n + (isDup ? ' ⚠' : '');
      c.title = isDup ? '같은 날 다른 현장에도 들어가 있음 — 탭하면 뺌' : '탭하면 뺌';
      c.onclick = function (e) { e.stopPropagation(); opts && opts.onRemove && opts.onRemove(n); };
      container.appendChild(c);
    });
    if (opts && opts.onAdd) {
      var add = document.createElement('button'); add.type = 'button'; add.className = 'chip add'; add.textContent = '＋';
      add.title = '인원 추가';
      add.onclick = function (e) { e.stopPropagation(); opts.onAdd(); };
      container.appendChild(add);
    }
  }
  function dayLabel(i, date) {
    return (i + 1) + '일차' + (date ? ' ' + Share.shortDate(date) : '');
  }
  // 현장 상세: 일차별 인원 구역. 날짜 자체는 시공날짜 칸(달력)에서 고른다 — 여기서는 인원만
  function renderDaysSection(box, siteId) {
    var s = Store.getSite(siteId); if (!s) return;
    box.innerHTML = '<h3 class="sec-title">날짜별 인원</h3>';
    var rerender = function () { renderDaysSection(box, siteId); };
    s.days.forEach(function (d, i) {
      var row = document.createElement('div'); row.className = 'sec-row';
      var lb = document.createElement('div'); lb.className = 'day-label';
      lb.textContent = d.date ? dayLabel(i, d.date) : '날짜 없음';
      var chips = document.createElement('div'); chips.className = 'chips';
      renderChips(chips, d.staff, {
        onRemove: function (n) { Store.removeStaff(siteId, i, n); rerender(); },
        onAdd: function () { openStaffPicker(siteId, i, rerender); }
      });
      row.appendChild(lb); row.appendChild(chips);
      box.appendChild(row);
    });
    if (!Share.isIsoDate(s.days[0].date)) {
      var hint = document.createElement('div'); hint.className = 'sec-empty';
      hint.textContent = '위 시공날짜 칸에서 날짜를 고르면 날마다 인원을 넣을 수 있습니다.';
      box.appendChild(hint);
    }
  }
  // ---------- 달력 시트 (시공날짜 여러 날 고르기) ----------
  // 탭 = 넣기/빼기, 고른 날엔 1·2·3 번호(날짜순). [초기화] 전부 지움, [확인] 저장, 바깥/✕ = 취소
  var cal = { siteId: '', picked: {}, year: 0, month: 0, onDone: null };
  function openCalendar(siteId, onDone) {
    var s = Store.getSite(siteId); if (!s) return;
    cal = { siteId: siteId, picked: {}, year: 0, month: 0, onDone: onDone };
    s.days.forEach(function (d) { if (Share.isIsoDate(d.date)) cal.picked[d.date] = true; });
    var base = Object.keys(cal.picked).sort()[0] || Share.todayIso();
    cal.year = +base.slice(0, 4); cal.month = +base.slice(5, 7);
    renderCalendar();
    $('calSheet').hidden = false;
  }
  function closeCalendar(apply) {
    if ($('calSheet').hidden) return;
    $('calSheet').hidden = true;
    if (apply) Store.setDays(cal.siteId, Object.keys(cal.picked));
    var cb = cal.onDone; cal.onDone = null;
    if (cb) cb();
  }
  function renderCalendar() {
    $('calTitle').textContent = cal.year + '년 ' + cal.month + '월';
    var picked = Object.keys(cal.picked).sort();
    var order = {}; picked.forEach(function (d, i) { order[d] = i + 1; });
    var today = Share.todayIso();
    var grid = $('calGrid'); grid.innerHTML = '';
    ['일', '월', '화', '수', '목', '금', '토'].forEach(function (w, i) {
      var h = document.createElement('div'); h.className = 'cal-w' + (i === 0 ? ' sun' : i === 6 ? ' sat' : ''); h.textContent = w; grid.appendChild(h);
    });
    Share.monthGrid(cal.year, cal.month).forEach(function (week) {
      week.forEach(function (iso, i) {
        var c = document.createElement('button'); c.type = 'button'; c.className = 'cal-d';
        if (!iso) { c.disabled = true; c.className += ' blank'; grid.appendChild(c); return; }
        c.textContent = String(+iso.slice(8, 10));
        if (i === 0) c.className += ' sun'; if (i === 6) c.className += ' sat';
        if (iso === today) c.className += ' today';
        if (order[iso]) { c.className += ' on'; c.innerHTML += '<span class="cal-n">' + order[iso] + '</span>'; }
        c.onclick = function () { if (cal.picked[iso]) delete cal.picked[iso]; else cal.picked[iso] = true; renderCalendar(); };
        grid.appendChild(c);
      });
    });
    $('calSummary').textContent = picked.length ? picked.map(Share.shortDate).join(', ') + ' (' + picked.length + '일)' : '날짜를 탭해서 고르세요. 다시 탭하면 빠집니다.';
  }
  $('calPrev').onclick = function () { if (--cal.month < 1) { cal.month = 12; cal.year--; } renderCalendar(); };
  $('calNext').onclick = function () { if (++cal.month > 12) { cal.month = 1; cal.year++; } renderCalendar(); };
  $('calToday').onclick = function () { var t = Share.todayIso(); cal.year = +t.slice(0, 4); cal.month = +t.slice(5, 7); renderCalendar(); };
  $('calClear').onclick = function () { cal.picked = {}; renderCalendar(); };
  $('calOk').onclick = function () { closeCalendar(true); };
  $('calClose').onclick = function () { closeCalendar(false); };
  $('calSheet').addEventListener('click', function (e) { if (e.target === $('calSheet')) closeCalendar(false); });
  // 현장 상세: 부자재 체크리스트
  function renderSuppliesSection(box, siteId) {
    var s = Store.getSite(siteId); if (!s) return;
    box.innerHTML = '<h3 class="sec-title">부자재</h3>';
    var rerender = function () { renderSuppliesSection(box, siteId); };
    if (!s.supplies.length) {
      var empty = document.createElement('div'); empty.className = 'sec-empty'; empty.textContent = '항목이 없습니다. 설정에서 기본 항목을 정해두면 새 현장에 자동으로 깔립니다.';
      box.appendChild(empty);
    }
    s.supplies.forEach(function (r, i) {
      var row = document.createElement('div'); row.className = 'sec-row';
      row.appendChild(checkBtn(r.ready, function () { var u = Store.toggleSupply(siteId, i); return u && u.supplies[i] && u.supplies[i].ready; }));
      var name = document.createElement('div'); name.className = 'sec-name'; name.textContent = r.name;
      var x = document.createElement('button'); x.type = 'button'; x.className = 'x'; x.textContent = '×'; x.title = '삭제';
      x.onclick = function () { Store.removeSupply(siteId, i); rerender(); };
      row.appendChild(name); row.appendChild(x);
      box.appendChild(row);
    });
    var add = document.createElement('button'); add.type = 'button'; add.className = 'sec-add'; add.textContent = '＋ 항목 추가';
    add.onclick = function () {
      modalPrompt('부자재 항목', '', '예: 칼날, 스퀴지').then(function (v) {
        if (v == null) return;
        Store.addSupply(siteId, v); rerender();
      });
    };
    box.appendChild(add);
  }
  // 인원 선택창(바텀시트): 설정의 팀원 명단은 칩으로(들어간 사람은 강조), 명단에 없는 사람은 아래 칸에 직접 입력
  var staffPicker = { siteId: '', dayIndex: 0, onDone: null };
  function openStaffPicker(siteId, dayIndex, onDone) {
    staffPicker = { siteId: siteId, dayIndex: dayIndex, onDone: onDone };
    renderStaffPicker();
    $('staffSheet').hidden = false;
    $('staffInput').value = '';
  }
  function closeStaffPicker() {
    if ($('staffSheet').hidden) return;
    $('staffSheet').hidden = true;
    var cb = staffPicker.onDone; staffPicker.onDone = null;
    if (cb) cb();
  }
  function renderStaffPicker() {
    var s = Store.getSite(staffPicker.siteId); if (!s) { closeStaffPicker(); return; }
    var d = s.days[staffPicker.dayIndex] || { date: '', staff: [] };
    $('staffSheetTitle').textContent = '👤 인원 — ' + dayLabel(staffPicker.dayIndex, d.date);
    var wrap = $('staffChips'); wrap.innerHTML = '';
    var team = state.settings.team || [];
    // 명단 + (명단에 없지만 이미 들어간 즉석 인력)
    var names = team.slice();
    d.staff.forEach(function (n) { if (names.indexOf(n) === -1) names.push(n); });
    if (!names.length) {
      var hint = document.createElement('div'); hint.className = 'sec-empty';
      hint.textContent = '설정에서 팀원을 등록해두면 여기서 탭으로 넣을 수 있습니다. 지금은 아래에 이름을 입력하세요.';
      wrap.appendChild(hint);
    }
    names.forEach(function (n) {
      var on = d.staff.indexOf(n) !== -1;
      var c = document.createElement('button'); c.type = 'button'; c.className = 'chip pick' + (on ? ' on' : '');
      c.textContent = n + (on ? ' ✓' : '');
      c.onclick = function () {
        if (on) Store.removeStaff(staffPicker.siteId, staffPicker.dayIndex, n);
        else Store.addStaff(staffPicker.siteId, staffPicker.dayIndex, n);
        renderStaffPicker();
      };
      wrap.appendChild(c);
    });
  }
  function addStaffFromInput() {
    var v = $('staffInput').value.trim();
    if (!v) return;
    Store.addStaff(staffPicker.siteId, staffPicker.dayIndex, v);
    $('staffInput').value = '';
    renderStaffPicker();
  }
  $('staffAdd').onclick = addStaffFromInput;
  $('staffInput').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); addStaffFromInput(); } });
  $('staffClose').onclick = closeStaffPicker;
  $('staffSave').onclick = closeStaffPicker;
  $('staffSheet').addEventListener('click', function (e) { if (e.target === $('staffSheet')) closeStaffPicker(); });
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
    // 현장명은 '군포 우륵아파트 704동 606호 30평' 처럼 길어지므로 같이 내린다.
    row.className = 'frow' + (f.key === 'name' ? ' frow-name frow-wide' : '') + (WIDE_TYPES[f.type] ? ' frow-wide' : '');
    var cb = document.createElement('input'); cb.type = 'checkbox'; cb.className = 'fcheck';
    cb.checked = !!checked[f.key]; cb.onchange = function () { checked[f.key] = cb.checked; };
    if (f.key === 'name') cb.style.visibility = 'hidden';
    var label = document.createElement('div'); label.className = 'flabel'; label.textContent = f.label;
    var ctl = document.createElement('div'); ctl.className = 'fctl';
    row.appendChild(cb); row.appendChild(label); row.appendChild(ctl);

    var save = function (patch) { s = Store.updateSite(s.id, patch) || s; refreshRowState(row, s, f.key); };

    if (f.type === 'date') {
      // 시공날짜: 달력 시트에서 여러 날을 고른다 (탭 = 넣기/빼기, 초기화). 칸에는 요약만 보여준다
      var db = document.createElement('button'); db.type = 'button'; db.className = 'date-btn';
      var paint = function () {
        var cur = Store.getSite(s.id) || s;
        var line = Share.datesLine(cur);
        var n = cur.days.filter(function (d) { return Share.isIsoDate(d.date); }).length;
        db.textContent = n ? line + (n > 1 ? ' (' + n + '일)' : '') : '날짜 선택';
        db.classList.toggle('empty', !n);
        refreshRowState(row, cur, f.key);
      };
      db.onclick = function () {
        openCalendar(s.id, function () { s = Store.getSite(s.id) || s; paint(); if ($('daysSec')) renderDaysSection($('daysSec'), s.id); });
      };
      paint();
      ctl.appendChild(db);
    } else if (f.type === 'text') {
      var inp = document.createElement('input');
      inp.type = 'text';
      inp.value = s[f.key] || '';
      inp.placeholder = f.key === 'name' ? '현장명 (예: 군포 우륵아파트 704동 606호 30평)' : '';
      inp.addEventListener('input', function () { var p = {}; p[f.key] = inp.value; save(p); });
      ctl.appendChild(inp);
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
      ta.placeholder = f.placeholder || '카톡 대화 복붙, 기타 메모';
      ta.addEventListener('input', function () { var p = {}; p[f.key] = ta.value; save(p); });
      ctl.appendChild(ta);
    }
    refreshRowState(row, s, f.key);
    return row;
  }
  function renderFilms(ctl, s, save) {
    ctl.innerHTML = '';
    var films = (s.films || []).map(function (r) { return Object.assign({ place: '', code: '', ready: false }, r); });
    if (!films.length) films.push({ place: '', code: '', ready: false });
    films.forEach(function (r, i) {
      var line = document.createElement('div'); line.className = 'film-row';
      line.innerHTML = '<input type="text" class="place" placeholder="시공위치 (현관문 뒷면)" value="' + esc(r.place) + '">' +
        '<input type="text" class="code" placeholder="필름번호 (PS035)" value="' + esc(r.code) + '">' +
        '<button type="button" class="x" title="줄 삭제">×</button>';
      // 준비됨 ☑ — 줄 맨 앞. 아직 저장 안 된 빈 첫 줄이면 먼저 저장하고 토글한다
      line.insertBefore(checkBtn(r.ready, function () {
        if (!Store.getSite(s.id).films[i]) save({ films: films.slice() });
        var u = Store.toggleFilm(s.id, i);
        films[i].ready = !!(u && u.films[i] && u.films[i].ready);
        return films[i].ready;
      }), line.firstChild);
      var upd = function () {
        films[i] = { place: line.querySelector('.place').value, code: line.querySelector('.code').value, ready: !!films[i].ready };
        save({ films: films.slice() });
      };
      line.querySelector('.place').addEventListener('input', upd);
      line.querySelector('.code').addEventListener('input', upd);
      line.querySelector('.x').onclick = function () {
        films.splice(i, 1); save({ films: films.slice() }); renderFilms(ctl, Store.getSite(s.id), save);
      };
      ctl.appendChild(line);
    });
    // 줄 추가 | 필름명 복사. 복사는 필름 번호만 한 줄에 하나씩 - 대리점 주문용이라
    // 시공위치는 빼고 준다. 방금 친 값(films 배열)을 그대로 읽는다.
    var acts = document.createElement('div'); acts.className = 'film-actions';
    var add = document.createElement('button'); add.type = 'button'; add.className = 'film-add'; add.textContent = '＋ 줄 추가';
    add.onclick = function () {
      films.push({ place: '', code: '', ready: false }); save({ films: films.slice() });
      renderFilms(ctl, Store.getSite(s.id), save);
      var ps = ctl.querySelectorAll('.place'); if (ps.length) ps[ps.length - 1].focus();
    };
    var cp = document.createElement('button'); cp.type = 'button'; cp.className = 'film-copy'; cp.textContent = '필름명 복사';
    cp.onclick = function () {
      var text = Share.filmOrderText({ films: films });
      if (!text) { toast('적힌 필름 번호가 없습니다'); return; }
      copyText(text, '필름명 복사됨 — 대리점 주문에 붙여넣기 하세요');
    };
    acts.appendChild(add);
    acts.appendChild(cp);
    ctl.appendChild(acts);
  }
  // 주소 복사 + 카카오맵 검색 열기 (폰에 카카오맵 앱이 있으면 앱으로 넘어감)
  // 붙여넣은 주소 열기 (공유 문구와 같은 방식으로 https:// 를 보정 - Share.linkUrl)
  function openLink(url) {
    var u = Share.linkUrl(url);
    if (!u) { toast('링크가 비어있습니다'); return; }
    window.open(u, '_blank');
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
  // 이름 목록(팀원 명단 / 부자재 기본 항목): 행마다 ✕, 아래 입력칸 + 추가. 빈 값·중복은 무시
  function renderStringList(container, items, onChange) {
    container.innerHTML = '';
    if (!items.length) {
      var e = document.createElement('div'); e.className = 'sec-empty'; e.textContent = '아직 없음';
      container.appendChild(e);
    }
    items.forEach(function (name, i) {
      var row = document.createElement('div'); row.className = 'slist-row';
      var t = document.createElement('div'); t.className = 'slist-name'; t.textContent = name;
      var x = document.createElement('button'); x.type = 'button'; x.className = 'x'; x.textContent = '×'; x.title = '삭제';
      x.onclick = function () { var next = items.slice(); next.splice(i, 1); onChange(next); };
      row.appendChild(t); row.appendChild(x);
      container.appendChild(row);
    });
  }
  function bindListAdder(inputId, btnId, getItems, onChange) {
    var add = function () {
      var v = $(inputId).value.trim();
      if (!v) return;
      var items = getItems();
      if (items.indexOf(v) !== -1) { toast('이미 있습니다'); return; }
      onChange(items.concat([v]));
      $(inputId).value = '';
    };
    $(btnId).onclick = add;
    $(inputId).addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); add(); } });
  }
  function renderTeamList() {
    renderStringList($('teamList'), state.settings.team || [], function (next) { Store.setSettings({ team: next }); renderTeamList(); });
  }
  function renderSupplyDefaultList() {
    renderStringList($('supplyDefaultList'), state.settings.supplyDefaults || [], function (next) { Store.setSettings({ supplyDefaults: next }); renderSupplyDefaultList(); });
  }
  bindListAdder('teamInput', 'btnAddTeam', function () { return state.settings.team || []; }, function (next) { Store.setSettings({ team: next }); renderTeamList(); });
  bindListAdder('supplyInput', 'btnAddSupplyDefault', function () { return state.settings.supplyDefaults || []; }, function (next) { Store.setSettings({ supplyDefaults: next }); renderSupplyDefaultList(); });

  function renderSettings() {
    $('backupKey').value = state.settings.backupKey || '';
    renderSyncStatus();
    renderTeamList();
    renderSupplyDefaultList();
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
  // 첫 진입: 해시가 없고 마지막에 일정 화면을 봤으면 일정으로 시작
  if ((!location.hash || location.hash === '#') && state.settings.lastView === 'schedule') location.replace('#schedule');
  route();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(function () { /* PWA 미지원 환경 */ });
  }
})();
