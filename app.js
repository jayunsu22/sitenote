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
    if (h === '#schedule') { rememberView('schedule'); showView('viewSchedule'); schDelKey = ''; renderSchedule(); return; }
    if (h === '#reviews') { showView('viewReviews'); renderReviews(); return; }
    if (h && h !== '#') { history.replaceState(null, '', location.pathname); }
    currentSiteId = '';
    rememberView('main');
    showView('viewMain'); renderMain();
  }
  function showView(id) {
    ['viewMain', 'viewSite', 'viewSettings', 'viewSchedule', 'viewReviews'].forEach(function (v) { $(v).hidden = v !== id; });
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
      var tc = Share.tabColorOf(c);
      b.className = 'tab' + (tc >= 0 ? ' tabc-' + tc : '') + (c.id === currentClientId ? ' active' : '');
      b.textContent = c.name; b.dataset.id = c.id;
      b.onclick = function () { selectClient(c.id); };
      attachLongPress(b, function () { clientMenu(c.id); });
      wrap.appendChild(b);
    });
    var active = wrap.querySelector('.tab.active');
    if (active && active.scrollIntoView) active.scrollIntoView({ inline: 'nearest', block: 'nearest' });
    renderTabsAll();
  }
  /* 거래처 한눈에 보기 (2026-10-18)
     탭이 옆으로 길어지면 가려진 업체를 찾느라 밀어야 한다. [▾] 를 누르면 전부 펼쳐
     한 번에 고른다. 고르면 다시 접힌다. 길게 누르면 탭과 같은 메뉴(이름·순서·삭제) */
  var tabsAllOpen = false;
  function renderTabsAll() {
    var box = $('tabsAll');
    var clients = Store.clients();
    $('btnAllTabs').textContent = tabsAllOpen ? '▴' : '▾';
    $('btnAllTabs').hidden = clients.length < 2;   // 한 곳뿐이면 펼칠 것도 없다
    box.hidden = !tabsAllOpen || clients.length < 2;
    if (box.hidden) return;
    box.innerHTML = '';
    var head = document.createElement('div'); head.className = 'tabs-all-head';
    head.textContent = '거래처 ' + clients.length + '곳 — 눌러서 바로 가기';
    box.appendChild(head);
    var grid = document.createElement('div'); grid.className = 'tabs-all-grid';
    clients.forEach(function (c) {
      var b = document.createElement('button'); b.type = 'button';
      var tc2 = Share.tabColorOf(c);
      b.className = 'tab-chip' + (tc2 >= 0 ? ' tabc-' + tc2 : '') + (c.id === currentClientId ? ' on' : '');
      b.textContent = c.name;
      b.onclick = function () { tabsAllOpen = false; selectClient(c.id); };
      attachLongPress(b, function () { clientMenu(c.id); });
      grid.appendChild(b);
    });
    box.appendChild(grid);
  }
  $('btnAllTabs').onclick = function () { tabsAllOpen = !tabsAllOpen; renderTabsAll(); };
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
    var items = [{ label: '✏️ 이름 변경', value: 'rename' }, { label: '🎨 탭 색상', value: 'color' }];
    if (i > 0) items.push({ label: '◀ 왼쪽으로 이동', value: 'left' });
    if (i < ids.length - 1) items.push({ label: '▶ 오른쪽으로 이동', value: 'right' });
    items.push({ label: '🗑 거래처 삭제', value: 'delete', cls: 'danger' });
    modalSheet(c.name, items).then(function (v) {
      if (v === 'rename') return renameClient(id);
      if (v === 'color') return clientColorPicker(id);
      if (v === 'delete') return deleteClient(id);
      if (v === 'left' || v === 'right') {
        var j = v === 'left' ? i - 1 : i + 1;
        ids.splice(i, 1); ids.splice(j, 0, id);
        Store.reorderClients(ids); renderMain();
      }
    });
  }
  // 거래처 탭 색 고르기 (2026-10-18) — 탭을 길게 눌러 나오는 메뉴에서 연다
  function clientColorPicker(id) {
    var c = Store.getClient(id); if (!c) return;
    var cur = Share.tabColorOf(c);
    var dots = '';
    for (var i = 0; i < Share.TAB_COLORS; i++) {
      dots += '<button type="button" class="tabcolor tabc-' + i + (cur === i ? ' on' : '') + '" data-i="' + i + '" aria-label="색 ' + (i + 1) + '"></button>';
    }
    var html = '<p class="hint">탭과 펼친 목록에 이 색이 들어갑니다.</p>' +
      '<div class="tabcolor-grid">' + dots +
      '<button type="button" class="tabcolor none' + (cur < 0 ? ' on' : '') + '" data-i="-1">기본</button></div>';
    openModal('탭 색상 · ' + c.name, html, [{ label: '닫기', cls: 'primary', onClick: closeModal }]);
    $('modalBody').querySelectorAll('[data-i]').forEach(function (b) {
      b.onclick = function () {
        Store.updateClient(id, { tabColor: parseInt(b.dataset.i, 10) });
        closeModal(); renderMain();
        toast(parseInt(b.dataset.i, 10) < 0 ? '기본 색으로 되돌렸습니다' : '탭 색을 바꿨습니다');
      };
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
        '<button class="cp" title="이름·연락처 복사">📋</button>' +
        '<a class="tel' + (tel ? '' : ' disabled') + '" href="' + esc(Share.telHref(tel)) + '" title="전화걸기">📞</a>' +
        '<a class="sms' + (tel ? '' : ' disabled') + '" href="' + esc(smsHref(tel)) + '" title="문자 보내기">💬</a>' +
        '<button class="x" title="삭제">×</button>';
      var save = function () {
        var contacts = c.contacts.slice();
        contacts[i] = { name: row.querySelector('.name').value, phone: row.querySelector('.phone').value };
        Store.updateClient(c.id, { contacts: contacts });
        var t = (contacts[i].phone || '').replace(/[^0-9+]/g, '');
        var a = row.querySelector('a.tel'); a.href = Share.telHref(t); a.classList.toggle('disabled', !t);
        var m = row.querySelector('a.sms'); m.href = smsHref(t); m.classList.toggle('disabled', !t);
      };
      row.querySelector('.name').addEventListener('input', save);
      row.querySelector('.phone').addEventListener('input', save);
      /* 담당자를 다른 사람에게 알려줄 때 쓴다 — '룩스디자인 실장 010-7132-3491'.
         칸에 적힌 값을 그대로 읽는다. 저장을 안 눌렀어도 방금 고친 게 복사돼야 한다. */
      row.querySelector('.cp').onclick = function () {
        var 이름 = row.querySelector('.name').value.trim();
        var 번호 = row.querySelector('.phone').value.trim();
        var t = [이름, 번호].filter(Boolean).join(' ');
        if (!t) { toast('이름과 연락처가 비어 있습니다'); return; }
        copyText(t, '복사됨 — ' + t);
      };
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

  // 고정값(단가·주의사항) 저장 - 현장 상세의 저장과 같은 동작.
  // 견적앱이 이 주의사항을 백업에서 읽어가므로, 적고 바로 눌러 올릴 수 있어야 한다.
  $('btnSaveFixed').onclick = saveNow;
  $('btnRenameClient').onclick = function () { renameClient(currentClientId); };
  $('btnDeleteClient').onclick = function () { deleteClient(currentClientId); };

  // ---------- 메인: 현장 카드 ----------
  function cardSummary(s) {
    var lines = [];
    var 시공 = Share.workSummary(s); // '9/18 (3일) 👤 2명'
    if (시공) lines.push('📅 ' + 시공);
    var as = Share.openServiceCount(s);   // 끝난 현장에 걸린 AS 를 잊지 않게
    if (as) lines.push('🔧 AS·추가작업 ' + as + '건 남음');
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
    var all = Store.sitesOf(currentClientId);
    var sites = all.filter(function (s) { return !s.hide; });
    var hid = all.filter(function (s) { return s.hide; });
    empty.hidden = sites.length > 0;
    if (!sites.length) empty.innerHTML = hid.length ? '보이는 현장이 없습니다 — 아래 숨긴 현장을 펼쳐 보세요.' : '아래 <b>＋ 현장</b> 버튼으로 첫 현장을 추가하세요.';
    var list = sites.concat(showHidden ? hid : []);
    list.forEach(function (s) {
      var card = document.createElement('div');
      card.className = 'card color-' + (s.color || 0) + (s.hide ? ' is-hidden' : '');
      card.innerHTML = '<h3 class="card-title">' + esc(Share.titleLine(s)) + '</h3>' +
        cardSummary(s).map(function (l) { return '<div class="card-line">' + esc(l) + '</div>'; }).join('');
      card.onclick = function () { go('#site/' + s.id); };
      wrap.appendChild(card);
    });
    if (hid.length) {   // 숨긴 현장은 맨 아래 접어 둔다
      var tg = document.createElement('button'); tg.type = 'button'; tg.className = 'hidden-toggle';
      tg.textContent = (showHidden ? '▲ 숨긴 현장 접기' : '🙈 숨긴 현장 ' + hid.length + '곳 보기');
      tg.onclick = function () { showHidden = !showHidden; renderCards(); };
      if (showHidden) wrap.insertBefore(tg, wrap.children[sites.length] || null); else wrap.appendChild(tg);
    }
    var tr = document.createElement('button'); tr.type = 'button'; tr.className = 'hidden-toggle trash-toggle';
    var tn = Store.trashList().length;
    tr.textContent = '🗑 지운 현장' + (tn ? ' ' + tn + '곳' : '') + ' · 되살리기';
    tr.onclick = openTrash;
    wrap.appendChild(tr);
  }
  /* 🗑 지운 현장 되살리기 (2026-10-28) — 이 폰에 보관한 것 + 백업(Airtable)에는 있는데 폰에 없는 것.
     되살리면 숨김도 풀리고 서버 백업도 다시 살아난다 */
  function openTrash() {
    var paint = function (serverList, msg) {
      var t = Store.trashList();
      var rows = t.map(function (x) {
        return '<div class="tr-row"><div><b>' + esc(Share.titleLine(x.site)) + '</b><small>' + esc(new Date(x.at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })) + ' 지움</small></div>' +
          '<button type="button" class="btn-sm primary" data-tr="' + esc(x.site.id) + '">되살리기</button></div>';
      }).join('');
      var srows = (serverList || []).map(function (x) {
        return '<div class="tr-row"><div><b>' + esc(Share.titleLine(x)) + '</b><small>백업에 있음' + (x.date ? ' · ' + esc(Share.shortDate(x.date)) : '') + '</small></div>' +
          '<button type="button" class="btn-sm primary" data-srv="' + esc(x.id) + '">가져오기</button></div>';
      }).join('');
      openModal('🗑 지운 현장 되살리기',
        '<div class="tr-box">' + (rows || '<p class="hint">이 폰에 보관된 지운 현장이 없습니다.</p>') +
        '<div class="tr-srv"><button type="button" class="btn-sm" id="trScan">☁️ 백업에서 빠진 현장 찾기</button>' +
        '<p class="hint">폰의 다른 기록은 그대로 두고, 백업에는 있는데 폰에 없는 현장만 가져옵니다.</p>' + (msg ? '<p class="hint"><b>' + esc(msg) + '</b></p>' : '') + srows + '</div></div>',
        [{ label: '닫기', onClick: function () { closeModal(); renderCards(); } }]);
      $('modalBody').querySelectorAll('[data-tr]').forEach(function (b) {
        b.onclick = function () { var st = Store.restoreSite(b.getAttribute('data-tr')); toast(st ? '✅ "' + Share.titleLine(st) + '" 되살렸습니다' : '되살리지 못했습니다'); paint(serverList); };
      });
      $('modalBody').querySelectorAll('[data-srv]').forEach(function (b) {
        b.onclick = function () {
          var id = b.getAttribute('data-srv');
          var x = (serverList || []).find(function (y) { return y.id === id; });
          var st = x && Store.restoreSite(id, x);
          toast(st ? '✅ "' + Share.titleLine(st) + '" 가져왔습니다' : '가져오지 못했습니다');
          paint((serverList || []).filter(function (y) { return y.id !== id; }));
        };
      });
      $('trScan').onclick = function () {
        $('trScan').disabled = true; $('trScan').textContent = '찾는 중…';
        Store.missingFromServer().then(function (list) { paint(list, list.length ? '백업에만 있는 현장 ' + list.length + '곳' : '빠진 현장이 없습니다'); })
          .catch(function (e) { paint(serverList, '찾기 실패: ' + e.message); });
      };
    };
    paint(null);
  }
  var showHidden = false;
  $('btnAddSite').onclick = function () {
    if (!currentClientId) return;
    var s = Store.addSite(currentClientId);
    go('#site/' + s.id);
  };
  $('btnSettings').onclick = function () { go('#settings'); };

  function renderMain() {
    ensureCurrentClient();
    renderTabs(); renderFixed(); TaskUI.renderClientNotes($('notesWrap'), currentClientId); QuoteRequests.render($('qreqWrap'), currentClientId); renderCards(); renderSyncBadge();
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
  // 위에는 날짜 띠(주간) 또는 달력(월간). 날짜마다 그날 현장 수가 숫자로 뜨고,
  // 현장이 없는 날은 점선 동그라미다 — 비어 있는 날을 찾아 배정하는 게 이 화면의 주된 쓰임이라
  // '몇 건인가'가 날짜 옆에 바로 붙어 있어야 한다.
  // 아래에는 현장 카드. 이어진 날(9/28·9/29)은 한 장으로 묶는다 — 두 줄로 따로 두면
  // 같은 현장인 줄 모르고 인원을 두 번 부른다.
  // 목록에 카드로 펼쳐 보여줄 기간. 이 뒤는 '이후 일정' 으로 접힌다.
  // 일정이 띄엄띄엄 잡히는 일이라 2주로는 다음 건이 접힘 뒤로 숨는 때가 많다.
  var SCHEDULE_DAYS = 30;
  var showLater = false;  // '이후 일정 N건' 펼침 여부
  var showPast = false;   // '지난 일정 N건' 펼침 여부 (최근 날짜가 위)
  var calShow = 'count';   // 달력 칸에 건수 / 시공지역 / 인원 중 뭘 볼까 (설정에 기억해 둔다)
  // 필름 보기는 뺐다(2026-10-22) — 달력 칸에 번호가 몰리면 구분이 안 된다. 대신 '필름 모아보기' 의 날짜별 주문 내역
  var CAL_SHOWS = ['count', 'region', 'staff', 'income'];
  var calMode = 'week';   // 'week' | 'month'
  var calMonth = '';      // 월간에서 보고 있는 달 'YYYY-MM' (비면 이번 달)
  // 주간에서 보고 있는 주의 일요일. 오늘부터 7일을 세면 요일 칸이 돌아가서
  // 월간과 세로줄이 안 맞는다. 달력처럼 일~토 한 주를 그대로 보여준다.
  var calWeek = '';
  var pickedDate = '';    // 달력에서 고른 날 (목록 맨 위에 '일정 넣기' 줄이 뜬다)
  var WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];

  function weekdayOf(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (!m) return '';
    return WEEKDAY[new Date(+m[1], +m[2] - 1, +m[3]).getDay()];
  }
  function ymOf(iso) { return String(iso || '').slice(0, 7); }
  function sundayOf(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (!m) return iso;
    return Share.addDays(iso, -new Date(+m[1], +m[2] - 1, +m[3]).getDay());
  }
  // 'YYYY-MM' 에 n 달을 더한다. 달력 넘기기에 쓴다
  function addMonths(ym, n) {
    var p = String(ym || '').split('-');
    var d = new Date(+p[0], (+p[1] - 1) + n, 1);
    return d.getFullYear() + '-' + (d.getMonth() + 1 < 10 ? '0' : '') + (d.getMonth() + 1);
  }
  function dateLabel(iso) { return Share.shortDate(iso) + ' (' + weekdayOf(iso) + ')'; }

  // 일정 화면에서 '빼기 모드'인 카드 ('현장id@일차', '' = 없음). 화면에 들어오면 풀린다
  var schDelKey = '';
  function renderSchedule() {
    // 폰에 기억해 둔 보기 방식을 그린다 (다른 기기에서 바꾼 게 restore 로 들어와도 맞춘다)
    calShow = CAL_SHOWS.indexOf(state.settings.calShow) !== -1 ? state.settings.calShow : 'count';
    taskDays = TaskUI.openTaskDays();
    filmDays = calShow === 'film' ? Share.dateFilms(state.sites) : {};
    holdDays = {};
    Object.keys(state.settings.holds || {}).forEach(function (iso) {
      var open = Share.heldOpen(state.settings.holds, state.sites, iso);
      if (open.length) holdDays[iso] = open;
    });
    renderScheduleCal();
    renderScheduleList();
  }

  /* ---------- 위쪽 달력 ---------- */
  // 한 칸: 날짜 + 건수 배지. 건수가 0이면 점선 동그라미(= 넣을 수 있는 날).
  // 지난 날은 점선을 안 그린다 — 지나간 날에 새로 배정할 일은 없다.
  var filmDays = {};   // 필름 보기: 시공 첫날 칸의 필름 번호 { iso: [{ code, dup }] } (2026-10-22)
  var holdDays = {};   // 대기 인원이 남은 날 { iso: [이름] } — 인원 보기에 주황 '대기' (2026-10-14)
  var taskDays = {};   // 안 끝난 할 일이 있는 날 { iso: 건수 } — 달력 칸에 주황 점 (2026-10-14)
  function calCell(iso, opts) {
    var o = opts || {};
    var today = Share.todayIso();
    var n = o.count || 0;
    var past = iso < today;
    var isToday = iso === today;
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'schcal-cell' +
      (o.out ? ' out' : '') +    // 앞뒤 달 날짜 — 날짜만 흐리게, 일정 표시는 그대로 보여준다
      (n ? ' has' : '') +
      (isToday ? ' today' : '') +
      (past ? ' past' : '') +
      (iso === pickedDate && !isToday ? ' picked' : '');
    if (o.weekday) {
      var w = document.createElement('span');
      w.className = 'schcal-wd' + (Share.isRedDay(iso) ? ' sun' : (weekdayOf(iso) === '토' ? ' sat' : ''));
      w.textContent = weekdayOf(iso);
      b.appendChild(w);
    }
    var d = document.createElement('span');
    d.className = 'schcal-day' + (!o.weekday && Share.isRedDay(iso) ? ' sun' : '');
    var dd = +iso.slice(8, 10);
    // 띠가 달을 넘어가면 '1' 이 이번 달 1일인지 다음 달 1일인지 모른다. 1일에만 달을 붙인다
    d.textContent = (o.weekday && dd === 1) ? (+iso.slice(5, 7)) + '/1' : String(dd);
    // AS 가 잡힌 날은 날짜 옆에 빨간 ! — 건수·동네만으로는 AS 날인지 모른다 (🔧 는 작아서 잘 안 보였다)
    if (o.svc) { var w = document.createElement('span'); w.className = 'schcal-svc'; w.textContent = '!'; d.appendChild(w); }
    b.appendChild(d);
    var mark = document.createElement('span');
    var rgs = o.regions || [];
    // 지역 보기: 건수 자리에 동네 이름. 일은 있는데 현장명에 지역이 없으면
    // 건수를 그대로 보여준다 — 빈 동그라미를 띄우면 '일 없는 날' 로 읽힌다
    /* 인원 보기: 그날 나가는 사람 이름을 한 줄에 하나씩. 세 명이면 세 줄이다 —
       '누가 가 있나' 를 세지 않고 바로 읽으려고 이름을 그대로 편다 (칸은 늘어난다).
       아무도 안 붙은 날이 제일 급하다 — 빨간 '미배정'.
       몇 명 모자란지는 칸에 안 적는다 — 이름만 보려는 화면이라 숫자가 끼면 읽기 나쁘다
       (모자란 수는 칸을 길게 눌렀을 때 뜨는 설명과 현장 카드에 있다) */
    var st = o.staff;
    var held = holdDays[iso] || [];
    // 수익 보기 (2026-10-14): 그날 적어 둔 남은 돈 합계를 만원 단위로. 적은 게 없으면 비워 둔다
    var inc = calShow === 'income' ? Share.incomeOfDay(state.settings.income, iso) : 0;
    if (calShow === 'income') {
      // 첫 줄 = 그날 수익, 둘째 줄 = 그 달 1일부터 그날까지 쌓인 합계
      if (inc) {
        mark.className = 'schcal-incbox';
        var l1 = document.createElement('span'); l1.className = 'schcal-inc' + (inc < 0 ? ' minus' : ''); l1.textContent = Share.manwon(inc);
        var run = Share.incomeRunning(state.settings.income, iso);
        var l2 = document.createElement('span'); l2.className = 'schcal-incsum' + (run < 0 ? ' minus' : ''); l2.textContent = '합' + (Share.manwon(run) || '0');
        mark.appendChild(l1); mark.appendChild(l2);
      }
      else mark.className = 'schcal-blank';
    }
    else if (calShow === 'film' && (filmDays[iso] || []).length) {
      // 필름 보기: 그날 시작하는 현장의 필름 번호. 앞뒤 7일 안 다른 현장에도 있으면 빨간 ⚠
      mark.className = 'schcal-nm' + (past ? ' past' : '');
      filmDays[iso].forEach(function (f) {
        var l = document.createElement('span');
        l.className = 'schcal-nml film' + (f.dup ? ' dup' : ''); l.textContent = f.code + (f.dup ? '⚠' : '');
        mark.appendChild(l);
      });
    }
    else if (calShow === 'staff' && (n || held.length)) {
      mark.className = 'schcal-nm' + (past ? ' past' : '');
      if (n && (!st || !st.have)) {
        var none = document.createElement('span');
        none.className = 'schcal-nml none'; none.textContent = '미배정';
        mark.appendChild(none);
      } else if (st) {
        st.names.forEach(function (nm) {
          var l = document.createElement('span');
          l.className = 'schcal-nml'; l.textContent = nm;
          mark.appendChild(l);
        });
      }
      // 대기 인원 — 그날로 잡아 뒀지만 아직 현장에 안 넣은 사람
      held.forEach(function (nm) {
        var l = document.createElement('span');
        l.className = 'schcal-nml hold'; l.textContent = nm;
        mark.appendChild(l);
      });
    }
    else if (calShow === 'region' && rgs.length) {
      // 동네 이름은 두 줄까지 넣는다 (칸이 52×48, 한 줄 10px 이라 둘은 들어간다).
      // 셋 이상이면 둘째 줄에 '+N' - 전체 이름은 칸을 길게 누르면 뜬다.
      // 동네가 갈리는 날은 빨갛게: 한 번 나가서 두 곳을 도는 날이라 눈에 띄어야 한다
      // 동네가 하나면 두 줄을 다 써도 된다 — 직접 적은 이름('송도 아이파크')이
      // 한 줄에 안 들어가는 일이 많다. 둘이면 각자 한 줄씩이라 못 늘린다
      mark.className = 'schcal-rg' + (rgs.length > 1 ? ' many' : ' one') + (past ? ' past' : '');
      var 줄 = rgs.slice(0, 2);
      if (rgs.length > 2) 줄[1] = 줄[1] + '+' + (rgs.length - 2);
      줄.forEach(function (t) {
        var l = document.createElement('span');
        l.className = 'schcal-rgl'; l.textContent = t;
        mark.appendChild(l);
      });
    }
    // 하루에 두 건 이상이면 빨강 — 특별히 챙겨야 하는 날이라 눈에 띄어야 한다.
    // 지난 날은 끝난 일이라 그대로 회색 (아래 .past 가 .many 를 덮는다)
    else if (n) { mark.className = 'schcal-n' + (n >= 2 ? ' many' : '') + (past ? ' past' : ''); mark.textContent = n; }
    else if (past) mark.className = 'schcal-blank';
    else mark.className = 'schcal-free';
    b.appendChild(mark);
    if (taskDays[iso]) { var tdot = document.createElement('span'); tdot.className = 'schcal-task'; b.appendChild(tdot); }
    b.title = dateLabel(iso) + (Share.holidayName(iso) ? ' ' + Share.holidayName(iso) : '') + (o.svc ? ' · AS ' + o.svc + '건' : '') + ' · ' +
      (n ? '현장 ' + n + '건' + (n >= 2 && !past ? ' (겹침)' : '') + (rgs.length ? ' — ' + rgs.join(', ') : '')
         : '현장 없음') +
      (n && st && st.have ? ' · 인원 ' + st.have + '명' + (st.slots > st.have ? ' (같은 사람 겹침)' : '') : '');
    // 밀고 손을 뗄 때 손가락이 얹힌 칸이 눌리면 엉뚱한 날이 골라진다
    if (calShow === 'income') b.title = dateLabel(iso) + ' · 수익 ' + (inc ? Share.wonText(inc) + ' · 이달 합계 ' + Share.wonText(Share.incomeRunning(state.settings.income, iso)) : '없음');
    // 수익 보기에서는 날짜를 누르면 그날 수익 적는 창이 뜬다
    b.onclick = function () { if (민직후) return; if (calShow === 'income') { openIncomeSheet(iso); return; } pickDate(iso); };
    return b;
  }

  // 날짜를 고르면 목록 맨 위에 그 날 줄('보기 ↓' · '일정 넣기')이 뜬다.
  // 예전엔 현장이 있는 날은 그 카드로 바로 데려갔는데, 그러면 일정이 있는 날엔 넣을 길이
  // 화면 밖으로 밀려나서 '보기 ↓' 를 눌러야 카드로 가게 바꿨다 (2026-10-02)
  function pickDate(iso) {
    pickedDate = (pickedDate === iso) ? '' : iso;
    // 고른 날의 현장이 '지난'·'이후' 접힘 속에 있으면 펼쳐 준다.
    // 안 그러면 달력에는 건수가 찍혀 있는데 목록엔 안 보여서 없는 줄 안다.
    if (pickedDate) {
      var g = Share.scheduleSites(state.sites, Share.todayIso(), SCHEDULE_DAYS);
      var has = function (list) {
        return list.some(function (r) { return r.dates.indexOf(pickedDate) !== -1; });
      };
      if (has(g.past)) showPast = true;
      if (has(g.later)) showLater = true;
      var end = Share.addDays(Share.todayIso(), SCHEDULE_DAYS - 1);
      if (Share.upcomingServices(state.sites, Share.todayIso()).some(function (x) {
        return x.service.date === pickedDate && x.service.date > end;
      })) showLater = true;
    }
    renderSchedule();
  }
  function scrollToPicked() {
    if (calMode === 'month') foldToWeek(false);
    var card = document.querySelector('[data-run-start="' + pickedDate + '"], [data-run-has="' + pickedDate + '"]');
    if (card && card.scrollIntoView) card.scrollIntoView({ block: 'center' });
  }

  /* 좌우로 밀어서 주·달을 넘긴다. 현장에서 장갑 낀 손으로 작은 화살표를
     정확히 누르기 어렵다. 화살표는 그대로 두고 미는 길을 하나 더 낸다.

     세로로 긋는 건 화면 스크롤이다. 방향이 가로라고 확실해진 뒤에만 가로채고,
     세로면 그 손짓은 아예 놓아준다 — 안 그러면 목록이 안 스크롤된다. */
  // 민 직후에 손가락이 얹힌 날짜 칸이 눌리는 것을 막는다.
  // 시계를 견주지 않고 타이머로 끈다 — Date.now() 차이로 재면 기기 시계가
  // 어긋나거나 멈춘 환경에서 탭이 영영 안 먹는다.
  var 민직후 = false, 민타이머 = null;
  function bindSwipe(wrap, inner, onPrev, onNext) {
    var x0 = 0, y0 = 0, dx = 0, 가로 = null, 끄는중 = false;
    var 넘김 = 45;   // 이만큼 밀어야 넘어간다 (톡 누른 건 안 넘긴다)
    var 최대 = 26;   // 끌리는 느낌만 조금. 많이 따라오면 칸이 잘려 보인다
    wrap.addEventListener('touchstart', function (e) {
      if (e.touches.length !== 1) { 끄는중 = false; return; }
      끄는중 = true; 가로 = null; dx = 0;
      x0 = e.touches[0].clientX; y0 = e.touches[0].clientY;
      inner.style.transition = '';
    }, { passive: true });
    wrap.addEventListener('touchmove', function (e) {
      if (!끄는중) return;
      var ax = e.touches[0].clientX - x0, ay = e.touches[0].clientY - y0;
      if (가로 === null) {
        if (Math.abs(ax) < 8 && Math.abs(ay) < 8) return;   // 아직 방향을 모른다
        가로 = Math.abs(ax) > Math.abs(ay);
        if (!가로) { 끄는중 = false; return; }               // 세로 = 화면 스크롤. 손 뗀다
      }
      dx = ax;
      e.preventDefault();   // 가로일 때만. 안 막으면 화면이 같이 움직인다
      inner.style.transform = 'translateX(' + Math.max(-최대, Math.min(최대, dx * 0.35)) + 'px)';
    }, { passive: false });
    var 놓음 = function () {
      if (!끄는중) return;
      끄는중 = false;
      inner.style.transition = 'transform .16s ease-out';
      inner.style.transform = '';
      if (가로 && Math.abs(dx) > 8) {
        민직후 = true;
        clearTimeout(민타이머);
        민타이머 = setTimeout(function () { 민직후 = false; }, 400);
      }
      if (가로 && Math.abs(dx) >= 넘김) (dx > 0 ? onPrev : onNext)();
      가로 = null; dx = 0;
    };
    wrap.addEventListener('touchend', 놓음);
    wrap.addEventListener('touchcancel', 놓음);
  }
  // 미는 칸을 감싸 준다. 넘어가는 동안 칸이 밖으로 삐져나가면 안 된다
  function swipeBox(inner, onPrev, onNext) {
    var wrap = document.createElement('div'); wrap.className = 'schcal-swipe';
    wrap.appendChild(inner);
    bindSwipe(wrap, inner, onPrev, onNext);
    return wrap;
  }

  /* 월간 달력은 화면 위에 붙어 있어서 아래로 내리면 목록이 아주 조금만 보인다.
     월간에서 목록 쪽으로 내리면 고른 날(없으면 오늘)의 주로 접는다.
     막 펼친 자리에서 조금(40px) 더 내려갔을 때만 접는다 — 펼치자마자 접히면 안 된다 */
  var monthBase = 0;
  function foldToWeek(keepView) {
    var box = $('scheduleCal');
    var before = box.offsetHeight;
    calWeek = sundayOf(pickedDate || Share.todayIso());
    calMode = 'week';
    renderScheduleCal();
    // 달력이 줄어든 만큼 목록이 위로 딸려 올라간다. 보던 카드가 그 자리에 있게 되돌린다
    var d = before - box.offsetHeight;
    if (keepView && d > 0) window.scrollBy(0, -d);
  }
  window.addEventListener('scroll', function () {
    if (calMode !== 'month' || $('viewSchedule').hidden) return;
    var y = Math.max(0, window.scrollY || 0);   // 아이폰은 맨 위에서 더 당기면 음수가 된다
    if (y < monthBase) monthBase = y;
    else if (y > monthBase + 40) foldToWeek(true);
  }, { passive: true });

  function calToggleBtn() {
    var t = document.createElement('button');
    t.type = 'button'; t.className = 'schcal-toggle';
    t.textContent = calMode === 'week' ? '월간으로 보기 ⌄' : '주간으로 접기 ⌃';
    t.onclick = function () {
      // 보고 있던 날을 놓치지 않게 서로 이어 준다 (월간에서 고른 날 → 그 주로 접힘)
      if (calMode === 'week') {
        // 이번 주가 달 경계에 걸쳐 있으면(9/27~10/3) 일요일 쪽 달이 아니라 오늘이 든 달을 편다
        var 이번주 = !calWeek || calWeek === sundayOf(Share.todayIso());
        calMonth = ymOf(pickedDate || (이번주 ? Share.todayIso() : calWeek));
        calMode = 'month';
        monthBase = window.scrollY || 0;
      } else {
        calWeek = sundayOf(pickedDate || Share.todayIso());
        calMode = 'week';
      }
      renderSchedule();
    };
    return t;
  }

  /* 건수 · 지역 · 인원 — 셋을 나란히 두고 보고 있는 것에 불을 켠다.
     돌려 가며 누르는 버튼 하나로는 지금 뭘 보고 있는지, 뭘 더 볼 수 있는지 모른다.
     어느 쪽을 보고 있었는지는 폰에 기억해 둔다 */
  var CAL_SHOW_LABEL = { count: '건수 🔢', region: '지역 📍', staff: '인원 👤', film: '필름 🎞', income: '수익 💰' };
  function calShowRow() {
    var row = document.createElement('div'); row.className = 'schcal-segs';
    CAL_SHOWS.forEach(function (k) {
      var t = document.createElement('button');
      t.type = 'button'; t.className = 'schcal-seg' + (calShow === k ? ' on' : '');
      t.textContent = CAL_SHOW_LABEL[k];
      t.onclick = function () {
        if (calShow === k) return;
        calShow = k;
        Store.setSettings({ calShow: k });
        renderSchedule();
      };
      row.appendChild(t);
    });
    return row;
  }
  function calFoot() {
    var box = document.createElement('div'); box.className = 'schcal-footbox';
    box.appendChild(calShowRow());
    var row = document.createElement('div'); row.className = 'schcal-foot';
    row.appendChild(calToggleBtn());
    // 필름 모아보기 (2026-10-22) — 앞으로 2주 쓸 필름을 번호별로, 겹친 번호 먼저
    var fb = document.createElement('button'); fb.type = 'button'; fb.className = 'schcal-toggle';
    fb.textContent = '🎞 필름 모아보기';
    fb.onclick = function () { TaskUI.openFilmBoard(); };
    row.appendChild(fb);
    box.appendChild(row);
    return box;
  }

  function renderScheduleCal() {
    var box = $('scheduleCal'); box.innerHTML = '';
    var counts = Share.dateCounts(state.sites);
    var regions = Share.dateRegions(state.sites);
    var svcs = Share.dateServices(state.sites);   // AS 가 잡힌 날 — 날짜 옆에 빨간 !
    var staffs = Share.dateStaff(state.sites);   // 인원 보기 — 그날 나가는 사람 / 필요 인원
    if (calMode === 'week') {
      if (!calWeek) calWeek = sundayOf(Share.todayIso());
      var wEnd = Share.addDays(calWeek, 6);

      var wnav = document.createElement('div'); wnav.className = 'schcal-nav';
      var wp = document.createElement('button');
      wp.type = 'button'; wp.className = 'schcal-arrow'; wp.textContent = '‹';
      wp.setAttribute('aria-label', '지난 주');
      wp.onclick = function () { calWeek = Share.addDays(calWeek, -7); renderSchedule(); };
      var wlab = document.createElement('span'); wlab.className = 'schcal-month';
      wlab.textContent = Share.shortDate(calWeek) + ' – ' + Share.shortDate(wEnd);
      var wn = document.createElement('button');
      wn.type = 'button'; wn.className = 'schcal-arrow'; wn.textContent = '›';
      wn.setAttribute('aria-label', '다음 주');
      wn.onclick = function () { calWeek = Share.addDays(calWeek, 7); renderSchedule(); };
      wnav.appendChild(wp); wnav.appendChild(wlab); wnav.appendChild(wn);
      // 앞뒤로 넘기다 보면 어디까지 갔는지 모른다. 이번 주가 아닐 때만 돌아가는 길을 둔다
      if (calWeek !== sundayOf(Share.todayIso())) {
        var back = document.createElement('button');
        back.type = 'button'; back.className = 'schcal-today'; back.textContent = '오늘';
        back.onclick = function () { calWeek = sundayOf(Share.todayIso()); renderSchedule(); };
        wnav.appendChild(back);
      } else {
        var wsum = document.createElement('span'); wsum.className = 'schcal-sum';
        var weekTotal = 0;
        for (var wi = 0; wi < 7; wi++) weekTotal += counts[Share.addDays(calWeek, wi)] || 0;
        wsum.innerHTML = '이번 주 <b>' + weekTotal + '건</b>';
        if (calShow === 'income') {
          var wInc = 0;
          for (var wj = 0; wj < 7; wj++) wInc += Share.incomeOfDay(state.settings.income, Share.addDays(calWeek, wj));
          wsum.innerHTML = '이번 주 수익 <b class="inc">' + (wInc ? Share.manwon(wInc) + '원' : '0원') + '</b>';
        }
        wnav.appendChild(wsum);
      }
      box.appendChild(wnav);

      var strip = document.createElement('div'); strip.className = 'schcal-week';
      for (var i = 0; i < 7; i++) {
        var iso = Share.addDays(calWeek, i);
        strip.appendChild(calCell(iso, { count: counts[iso] || 0, regions: regions[iso], svc: svcs[iso] || 0, staff: staffs[iso], weekday: true }));
      }
      box.appendChild(swipeBox(strip,
        function () { calWeek = Share.addDays(calWeek, -7); renderSchedule(); },
        function () { calWeek = Share.addDays(calWeek, 7); renderSchedule(); }));
    } else {
      if (!calMonth) calMonth = ymOf(Share.todayIso());
      var y = +calMonth.slice(0, 4), mo = +calMonth.slice(5, 7);

      var nav = document.createElement('div'); nav.className = 'schcal-nav';
      var prev = document.createElement('button');
      prev.type = 'button'; prev.className = 'schcal-arrow'; prev.textContent = '‹';
      prev.setAttribute('aria-label', '이전 달');
      prev.onclick = function () { calMonth = addMonths(calMonth, -1); renderSchedule(); };
      var label = document.createElement('span'); label.className = 'schcal-month';
      label.textContent = y + '년 ' + mo + '월';
      var next = document.createElement('button');
      next.type = 'button'; next.className = 'schcal-arrow'; next.textContent = '›';
      next.setAttribute('aria-label', '다음 달');
      next.onclick = function () { calMonth = addMonths(calMonth, 1); renderSchedule(); };
      var sum = document.createElement('span'); sum.className = 'schcal-sum';
      var monthTotal = Object.keys(counts).reduce(function (a, k) {
        return ymOf(k) === calMonth ? a + counts[k] : a;
      }, 0);
      sum.innerHTML = '이번 달 <b>' + monthTotal + '건</b>';
      if (calShow === 'income') {
        var mInc = Share.incomeOfMonth(state.settings.income, calMonth);
        sum.innerHTML = '수익 <b class="inc">' + Share.wonText(mInc.total) + '</b>';
      }
      nav.appendChild(prev); nav.appendChild(label); nav.appendChild(next); nav.appendChild(sum);
      box.appendChild(nav);

      var head = document.createElement('div'); head.className = 'schcal-wds';
      WEEKDAY.forEach(function (w) {
        var e = document.createElement('span');
        e.className = 'schcal-wd' + (w === '일' ? ' sun' : (w === '토' ? ' sat' : ''));
        e.textContent = w;
        head.appendChild(e);
      });
      box.appendChild(head);

      var grid = document.createElement('div'); grid.className = 'schcal-grid';
      // 줄 끝을 비워 두지 않는다 — 9/30 다음 칸에 10/1·2·3 이 그대로 이어진다
      Share.monthGridFull(y, mo).forEach(function (week) {
        week.forEach(function (iso) {
          grid.appendChild(calCell(iso, {
            count: counts[iso] || 0, regions: regions[iso], svc: svcs[iso] || 0, staff: staffs[iso], out: ymOf(iso) !== calMonth
          }));
        });
      });
      box.appendChild(swipeBox(grid,
        function () { calMonth = addMonths(calMonth, -1); renderSchedule(); },
        function () { calMonth = addMonths(calMonth, 1); renderSchedule(); }));
    }
    box.appendChild(calFoot());
  }

  /* ---------- 아래쪽 목록 ---------- */
  function renderScheduleList() {
    var body = $('scheduleBody'); body.innerHTML = '';
    var 차례 = 0;   // 지난·앞으로·이후를 통틀어 이어 센다 — 접힘 경계에서 색이 겹치면 안 된다
    var today = Share.todayIso();
    var g = Share.scheduleSites(state.sites, today, SCHEDULE_DAYS);
    var dup = Share.findOverlaps(state.sites);
    var counts = Share.dateCounts(state.sites);
    var regions = Share.dateRegions(state.sites);
    var noDate = state.sites.filter(function (s) { return !Share.isIsoDate(s.date); }).length;

    // 고른 날에 바로 일정을 넣을 수 있게 한다 — 이 화면을 여는 큰 이유다.
    // 일정이 이미 있는 날도 같다 (같은 날 AS 나 다른 현장을 더 잡는 일이 많다)
    if (pickedDate) {
      var n = counts[pickedDate] || 0;
      var bar = document.createElement('div'); bar.className = 'sch-pick';
      var txt = document.createElement('div'); txt.className = 'sch-pick-txt';
      var hopen = holdDays[pickedDate] || [];
      txt.innerHTML = '<b>' + esc(dateLabel(pickedDate)) + ' 고름</b><span>' +
        (n ? '이 날 일정 ' + n + '건' : '이 날은 현장이 없습니다') + '</span>' +
        (hopen.length ? '<span class="sch-pick-hold">⏳ 대기 ' + hopen.length + '명: ' + esc(hopen.join('·')) + '</span>' : '');
      bar.appendChild(txt);
      if (n) {
        var view = document.createElement('button');
        view.type = 'button'; view.className = 'sch-pick-view'; view.textContent = '보기 ↓';
        view.onclick = scrollToPicked;
        bar.appendChild(view);
      }
      var add = document.createElement('button');
      add.type = 'button'; add.className = 'sch-pick-add'; add.textContent = '일정 넣기';
      add.onclick = function () { openAddSheet(pickedDate); };
      var hold = document.createElement('button');
      hold.type = 'button'; hold.className = 'sch-pick-view sch-pick-holdbtn'; hold.textContent = '👤 인원 잡기';
      hold.onclick = function () { openHoldPicker(pickedDate); };
      bar.appendChild(hold);
      bar.appendChild(add);
      body.appendChild(bar);
    }

    // AS 대기: 날짜가 없거나 지났는데 안 끝난 AS — 잊으면 안 되는 것이라 맨 위에 둔다
    var waiting = Share.waitingServices(state.sites, today);
    if (waiting.length) body.appendChild(renderWaitingBox(waiting));
    // 날짜 잡힌 AS 는 현장 카드 사이에 날짜순으로 끼운다 (창 밖이면 '이후 일정' 으로)
    var winEnd = Share.addDays(today, SCHEDULE_DAYS - 1);
    var upAs = Share.upcomingServices(state.sites, today);
    var asMain = upAs.filter(function (x) { return x.service.date <= winEnd; });
    var asLater = upAs.filter(function (x) { return x.service.date > winEnd; });
    // 할 일 (2026-10-14): 밀린 것·날짜 없는 것은 맨 위 상자, 나머지는 날짜별 묶음으로 현장 카드 사이에 끼운다
    var tg = TaskUI.scheduleGroups();
    var tDates = Object.keys(tg.byDate).filter(function (k) { return k >= today && (tg.byDate[k].open.length || tg.byDate[k].done.length); }).sort();
    var tMain = tDates.filter(function (k) { return k <= winEnd; });
    var tLater = tDates.filter(function (k) { return k > winEnd; });
    var tPast = Object.keys(tg.byDate).filter(function (k) { return k < today && tg.byDate[k].done.length; }).sort().reverse();
    if (tg.overdue.length) body.appendChild(TaskUI.renderOverdueBox(tg.overdue));
    if (tg.undated.length) body.appendChild(TaskUI.renderUndatedBox(tg.undated));

    // 지난 일정: 맨 위에 접어두고, 펼치면 앞으로 일정과 같은 방향(위 → 아래 = 옛날 → 최근)으로 이어진다.
    // 예전엔 펼치면 최근부터 거꾸로라 아래로 내리면 과거로 가서, 앞으로 일정과 방향이 반대라 헷갈렸다 (2026-10-27)
    if (g.pastCount || tPast.length) {
      var pastBtn = document.createElement('button');
      pastBtn.type = 'button'; pastBtn.className = 'sch-more';
      var pEnds = g.past.map(function (r) { return r.end; }).concat(tPast).sort();
      var pStarts = g.past.map(function (r) { return r.start; }).concat(tPast).sort();
      var pLast = pEnds[pEnds.length - 1], pFirst = pStarts[0];
      pastBtn.textContent = (showPast ? '▾' : '▸') + ' 지난 일정 ' + g.pastCount + '건' +
        (tPast.length ? ' · 끝낸 할 일 ' + tPast.length + '일' : '') + ' (' +
        Share.shortDate(pFirst) + ' ~ ' + Share.shortDate(pLast) + ')';
      pastBtn.onclick = function () {
        // 펼쳐도 지금 보던 자리(오늘 쪽)가 그대로 있게: 버튼 아래 경계선을 같은 화면 높이에 맞춘다
        var top = pastBtn.getBoundingClientRect().top;
        showPast = !showPast; renderScheduleList();
        var sepEl = document.querySelector('#scheduleBody .sch-sep');
        if (showPast && sepEl) window.scrollBy(0, sepEl.getBoundingClientRect().top - top - pastBtn.offsetHeight);
      };
      body.appendChild(pastBtn);
      if (showPast) {
        var pastItems = [];
        g.past.forEach(function (r) { pastItems.push({ d: r.start, o: 1, make: function () { return renderRunCard(r, dup, 차례++); } }); });
        tPast.forEach(function (k) { pastItems.push({ d: k, o: 0, make: function () { return TaskUI.renderTaskDay(k, tg.byDate[k]); } }); });
        pastItems.sort(function (a, b) { return a.d < b.d ? -1 : (a.d > b.d ? 1 : a.o - b.o); });
        pastItems.forEach(function (it) { body.appendChild(it.make()); });
        var sep = document.createElement('div'); sep.className = 'sch-sep'; body.appendChild(sep);
      }
    }

    if (!g.runs.length && !g.laterCount && !upAs.length && !tDates.length) {
      var e = document.createElement('div'); e.className = 'empty-state';
      e.textContent = '앞으로 한 달 안에 현장이 없습니다. 위 달력에서 날짜를 눌러 현장을 넣으세요.' +
        (noDate ? ' (시공날짜가 없는 현장 ' + noDate + '건은 거래처 탭에 있습니다)' : '');
      body.appendChild(e);
      return;
    }

    // 할 일 묶음·현장 카드·AS 카드를 날짜순으로 섞는다. 같은 날이면 할 일 → 현장 → AS
    var mix = function (runs, asList, taskDates) {
      var items = [];
      taskDates.forEach(function (k) { items.push({ d: k, o: 0, make: function () { return TaskUI.renderTaskDay(k, tg.byDate[k]); } }); });
      runs.forEach(function (r) { items.push({ d: r.next, o: 1, make: function () { return renderRunCard(r, dup, 차례++); } }); });
      asList.forEach(function (x) { items.push({ d: x.service.date, o: 2, make: function () { return renderServiceCard(x); } }); });
      items.forEach(function (it, i) { it.i = i; });
      items.sort(function (a, b) { return a.d < b.d ? -1 : (a.d > b.d ? 1 : (a.o - b.o) || (a.i - b.i)); });
      items.forEach(function (it) { body.appendChild(it.make()); });
    };
    mix(g.runs, asMain, tMain);

    if (g.laterCount || asLater.length || tLater.length) {
      var more = document.createElement('button');
      more.type = 'button'; more.className = 'sch-more';
      var lStarts = g.later.map(function (r) { return r.start; }).concat(asLater.map(function (x) { return x.service.date; })).concat(tLater).sort();
      var lEnds = g.later.map(function (r) { return r.end; }).concat(asLater.map(function (x) { return x.service.date; })).concat(tLater).sort();
      var tLaterN = tLater.reduce(function (n, k) { return n + tg.byDate[k].open.length; }, 0);
      more.textContent = (showLater ? '▾' : '▸') + ' 이후 일정 ' + (g.laterCount + asLater.length) + '건' +
        (tLaterN ? ' · 할 일 ' + tLaterN + '건' : '') + ' (' +
        Share.shortDate(lStarts[0]) + ' ~ ' + Share.shortDate(lEnds[lEnds.length - 1]) + ')';
      more.onclick = function () { showLater = !showLater; renderScheduleList(); };
      body.appendChild(more);
      if (showLater) mix(g.later, asLater, tLater);
    }
  }

  /* AS 대기 상자. 달력에서 날을 골라 두면 줄마다 '→ 9/30' 이 떠서 그날로 바로 잡힌다 —
     같은 동네 일이 있는 날을 지역 보기로 찾고, 거기에 AS 를 붙이는 흐름 */
  function renderWaitingBox(list) {
    var box = document.createElement('div'); box.className = 'svc-wait';
    var h = document.createElement('div'); h.className = 'svc-wait-head';
    h.innerHTML = '<b>🔧 AS 대기 ' + list.length + '건</b><span>' +
      (pickedDate ? esc(dateLabel(pickedDate)) + ' 로 잡으려면 → 를 누르세요'
                  : '달력에서 날을 고르면 그날로 바로 잡을 수 있습니다') + '</span>';
    box.appendChild(h);
    list.forEach(function (x) {
      var s = x.site, v = x.service;
      var row = document.createElement('div'); row.className = 'svc-wait-row';
      var main = document.createElement('button'); main.type = 'button'; main.className = 'svc-wait-main';
      main.innerHTML = '<div class="svc-row-top"><span class="svc-badge' + (v.kind === '추가' ? ' add' : '') + '">' +
        esc(Share.serviceLabel(v)) + '</span>' +
        (x.overdue ? '<span class="svc-late">' + esc(Share.dayLabel(v.date)) + ' 지남</span>' : '<span class="svc-nodate">날짜 미정</span>') +
        '<span class="svc-client">' + esc(clientName(s)) + '</span></div>' +
        '<b class="svc-site">' + esc(Share.titleLine(s)) + '</b>' +
        '<div class="svc-req">' + esc(v.request || '(요청 내용 없음)') + '</div>';
      main.onclick = function () { openServiceSheet(s.id, v.id, renderSchedule); };
      row.appendChild(main);
      if (pickedDate) {
        var go_ = document.createElement('button'); go_.type = 'button'; go_.className = 'svc-wait-go';
        go_.textContent = '→ ' + Share.shortDate(pickedDate);
        go_.onclick = function () {
          Store.updateService(s.id, v.id, { date: pickedDate });
          toast(Share.serviceLabel(v) + ' → ' + Share.dayLabel(pickedDate) + ' 로 잡음');
          renderSchedule();
        };
        row.appendChild(go_);
      }
      box.appendChild(row);
    });
    return box;
  }
  // 날짜 잡힌 AS 카드 — 현장 카드와 같은 틀, 머리띠는 주황
  function renderServiceCard(x) {
    var s = x.site, v = x.service;
    var card = document.createElement('div'); card.className = 'sch-card svc-card';
    card.setAttribute('data-run-has', v.date);
    var head = document.createElement('div'); head.className = 'sch-head svc-head';
    var when = document.createElement('span'); when.className = 'sch-when';
    when.textContent = '🔧 ' + Share.serviceLabel(v) + ' · ' + Share.shortDate(v.date) + ' ' + weekdayOf(v.date);
    head.appendChild(when);
    head.appendChild(clientLink(s, 'sch-client'));
    card.appendChild(head);
    var body = document.createElement('div'); body.className = 'sch-body';
    var title = document.createElement('button'); title.type = 'button'; title.className = 'sch-title svc-title';
    title.textContent = Share.titleLine(s);
    title.onclick = function (e) { e.stopPropagation(); go('#site/' + s.id); };
    body.appendChild(title);
    var req = document.createElement('div'); req.className = 'svc-req-big';
    req.textContent = v.request || '(요청 내용 없음)';
    body.appendChild(req);
    var who = document.createElement('div'); who.className = 'svc-who-line' + (v.staff.length ? '' : ' none');
    who.textContent = v.staff.length ? '👤 ' + v.staff.join('·') : '👤 담당 미정';
    body.appendChild(who);
    card.appendChild(body);
    card.onclick = function () { openServiceSheet(s.id, v.id, renderSchedule); };
    return card;
  }

  function clientName(site) { var c = Store.getClient(site.clientId); return c ? c.name : ''; }
  // 업체명 조각: 탭하면 그 업체 탭이 열린 거래처 화면으로 간다
  function clientLink(site, cls) {
    var el = document.createElement('button');
    el.type = 'button'; el.className = cls || 'sch-client';
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

  /* 이어진 날 한 묶음 = 카드 한 장.
     머리줄 색은 준비 상태다 — 초록이면 필름·부자재·인원이 다 됐다는 뜻이라
     목록을 훑으면서 손볼 곳만 골라낼 수 있다. */
  function renderRunCard(run, dupAll, 차례) {
    var s = run.site, id = s.id;
    var multi = run.dates.length > 1;
    // 머리줄·제목 색은 목록 차례대로 두 색을 번갈아 쓴다.
    // 현장색(s.color)을 쓰면 거래처마다 0번부터 매겨지는 탓에(Share.nextColor)
    // 거래처가 다른 첫 현장끼리 같은 색이 되어 앞뒤 카드가 같은 색으로 붙는다.
    var ci = (차례 || 0) % 2;
    var card = document.createElement('div');
    card.className = 'sch-card';
    card.setAttribute('data-run-start', run.start);
    run.dates.forEach(function (d) { card.setAttribute('data-run-has', d); });

    var head = document.createElement('div'); head.className = 'sch-head h' + ci;
    var when = document.createElement('span'); when.className = 'sch-when';
    // 머리줄 날짜는 '다음에 일하는 날' 이다. 목록도 그 순서로 세우므로 둘이 맞아야 한다 —
    // 1·2일차가 끝난 현장에 시작일(9/28)을 걸어두면 이미 지난 날짜가 목록 아래쪽에 앉아 헷갈린다.
    // 떨어진 날에 '9/28 – 10/7' 이라고 쓰면 열흘 내내 하는 일로도 읽힌다.
    // 아직 하루도 안 지났고 날이 이어진 때만 기간으로 적는다 (날짜는 아래 일차 칸이 다 보여준다).
    var lead = run.next || run.end;
    when.textContent = (multi && run.이어짐 && run.next === run.start)
      ? Share.shortDate(run.start) + ' ' + weekdayOf(run.start) + ' – ' + Share.shortDate(run.end) + ' ' + weekdayOf(run.end)
      : Share.shortDate(lead) + ' ' + weekdayOf(lead);
    var span = document.createElement('span'); span.className = 'sch-span';
    span.textContent = !multi ? '하루' : (run.이어짐 ? run.dates.length + '일 연속' : '총 ' + run.dates.length + '일');
    head.appendChild(when); head.appendChild(span);
    // 준비 완료는 머리줄 색으로 알리던 것을 배지로 옮겼다 (색은 현장 구분에 썼다)
    if (Share.isReady(s)) {
      var done = document.createElement('span'); done.className = 'sch-done';
      done.textContent = '✓ 준비됨';
      done.title = '필름·부자재·인원이 다 됐습니다';
      head.appendChild(done);
    }
    head.appendChild(clientLink(s, 'sch-client'));
    card.appendChild(head);

    var body = document.createElement('div'); body.className = 'sch-body';

    var title = document.createElement('button');
    title.type = 'button'; title.className = 'sch-title t' + ci;
    title.textContent = Share.titleLine(s);
    title.onclick = function () { go('#site/' + id); };
    body.appendChild(title);

    // 인원 줄: 묶음 첫날 기준. 날마다 다르면 아래 일차 칸의 숫자로 갈린다
    // 인원 줄은 '남은 첫 날' 기준. 이미 끝난 날 인원을 맨 위에 두면 다음에 부를 사람과 헷갈린다
    var firstAt = run.dates.indexOf(run.next);
    var first = run.dayIndexes[firstAt >= 0 ? firstAt : 0];
    var names = (Share.daysOf(s)[first] || {}).staff || [];
    var dupNames = dupAll[run.dates[firstAt >= 0 ? firstAt : 0]] || {};
    var line = document.createElement('div'); line.className = 'sch-people';
    var lab = document.createElement('span'); lab.className = 'sch-lab'; lab.textContent = '인원';
    line.appendChild(lab);
    // 이름은 이 칸 안에서만 줄바꿈한다. 배치 수는 바깥에 둬야 오른쪽 위에 남는다
    var namesBox = document.createElement('div'); namesBox.className = 'sch-names';
    line.appendChild(namesBox);
    // 이름을 탭하면 전화 (현장 상세와 같다). 빼기는 [−] 로 빼기 모드에 들어간 뒤 ✕ 로 (2026-10-18)
    var delKey = id + '@' + first, inDel = schDelKey === delKey;
    names.forEach(function (n) {
      var isDup = !!dupNames[String(n).replace(/\s+/g, '')];
      var phone = Share.personOf(state.settings.people, n).phone;
      var a;
      if (inDel) {
        a = document.createElement('button'); a.type = 'button';
        a.className = 'sch-name del' + (isDup ? ' dup' : '');
        a.textContent = n + ' ✕';
        a.title = n + ' — 탭하면 이 날에서 뺍니다';
        a.onclick = function (e) { e.stopPropagation(); Store.removeStaff(id, first, n); renderSchedule(); };
      } else if (phone) {
        /* 이름=전화 · 💬=문자 (2026-10-19). 알약 하나를 둘로 나눠서 줄이 더 길어지지 않게 한다 */
        a = document.createElement('span');
        a.className = 'sch-name call' + (isDup ? ' dup' : '');
        var nm = document.createElement('a');
        nm.className = 'sch-nm'; nm.href = telHref(phone);
        nm.textContent = n + (isDup ? ' ⚠' : '');
        nm.title = (isDup ? n + ' — 같은 날 다른 현장에도 들어가 있음 · ' : '') + phone + ' 로 전화';
        nm.onclick = function (e) { e.stopPropagation(); };
        var sm = document.createElement('a');
        sm.className = 'sch-sms'; sm.href = smsHref(phone);
        sm.textContent = '💬'; sm.title = n + ' 에게 문자 (' + phone + ')';
        sm.onclick = function (e) { e.stopPropagation(); };
        a.appendChild(nm); a.appendChild(sm);
      } else {
        a = document.createElement('button'); a.type = 'button';
        a.className = 'sch-name nophone' + (isDup ? ' dup' : '');
        a.textContent = n + (isDup ? ' ⚠' : '');
        a.title = n + ' — 연락처 없음';
        a.onclick = function (e) { e.stopPropagation(); toast(n + ' 연락처가 없습니다 — 설정 › 팀원에서 번호를 넣으세요'); };
      }
      namesBox.appendChild(a);
    });
    var addName = document.createElement('button');
    addName.type = 'button'; addName.className = 'sch-name add'; addName.textContent = '＋';
    addName.setAttribute('aria-label', '인원 넣기');
    addName.onclick = function (e) { e.stopPropagation(); schDelKey = ''; openStaffPicker(id, first, renderSchedule); };
    namesBox.appendChild(addName);
    if (names.length) {
      var delName = document.createElement('button');
      delName.type = 'button'; delName.className = 'sch-name del-toggle' + (inDel ? ' on' : '');
      delName.textContent = inDel ? '완료' : '−';
      delName.title = inDel ? '빼기 끝내기' : '인원 빼기 — 누르면 이름에 ✕ 가 생깁니다';
      delName.onclick = function (e) { e.stopPropagation(); schDelKey = inDel ? '' : delKey; renderSchedule(); };
      namesBox.appendChild(delName);
    }
    if (!multi) line.appendChild(staffCountBadge(s, first, true));
    body.appendChild(line);

    // 여러 날이면 날마다 배치 현황을 따로 — 1일차는 찼는데 2일차가 빈 경우가 흔하다
    if (multi) {
      var oneToday = Share.todayIso();
      var daysRow = document.createElement('div'); daysRow.className = 'sch-days';
      run.dates.forEach(function (d, k) {
        var di = run.dayIndexes[k];
        var cell = document.createElement('button');
        cell.type = 'button';
        // 지난 날은 흐리게 — 며칠까지 했고 어디부터 남았는지가 바로 보여야 한다
        cell.className = 'sch-dcell' + (d < oneToday ? ' done' : '');
        var dl = document.createElement('span'); dl.className = 'sch-dlab';
        fillDayLabel(dl, di, d);
        cell.appendChild(dl);
        cell.appendChild(staffCountBadge(s, di, false));
        cell.title = '탭하면 그날 인원을 고칩니다';
        cell.onclick = function (e) { e.stopPropagation(); openStaffPicker(id, di, renderSchedule); };
        daysRow.appendChild(cell);
      });
      body.appendChild(daysRow);
    }

    {
      var filmRow = document.createElement('div'); filmRow.className = 'sch-film';
      var flab = document.createElement('span'); flab.className = 'sch-lab'; flab.textContent = '필름';
      filmRow.appendChild(flab);
      var strip = document.createElement('div'); strip.className = 'stage-strip';
      renderStageStrip(strip, s, {
        short: true, date: run.start,
        onPick: function (k) { Store.setFilmStage(id, k); renderSchedule(); }
      });
      filmRow.appendChild(strip);
      body.appendChild(filmRow);
      if (Share.filmOrderLate(s)) {
        filmRow.classList.add('late');
        var dd = Share.dayDiff(Share.todayIso(), s.date);
        var late = document.createElement('div'); late.className = 'film-late-msg';
        late.textContent = '⚠ 필름 주문! ' + (dd > 0 ? '시공 ' + dd + '일 전' : dd === 0 ? '오늘 시공' : '시공 시작했는데') + ' — 아직 주문 안 됨';
        body.appendChild(late);
      }
      if (Share.siliconeLate(s)) {
        var sl = document.createElement('div'); sl.className = 'film-late-msg'; sl.textContent = siliconeLateText(s);
        body.appendChild(sl);
      }
    }

    card.appendChild(body);
    return card;
  }

  /* ---------- 고른 날에 일정 넣기 ----------
     ① 신규 현장인지 AS·추가작업인지 → ② 거래처 → ③ (AS 면) 그 거래처의 현장.
     현장·AS 는 거래처 밑에 달리므로 거래처부터 고른다. 거래처가 하나뿐이면 묻지 않는다 */
  var newSiteDate = '';
  function addSheetStep(title, hint, build) {
    $('newSiteTitle').textContent = dateLabel(newSiteDate) + ' ' + title;
    $('newSiteHint').textContent = hint;
    var wrap = $('newSiteClients'); wrap.innerHTML = '';
    build(wrap);
    $('newSiteSheet').hidden = false;
  }
  function addSheetBack(wrap, fn) {
    var b = document.createElement('button'); b.type = 'button'; b.className = 'add-back'; b.textContent = '← 뒤로';
    b.onclick = fn; wrap.appendChild(b);
  }
  function openAddSheet(iso) {
    if (!Store.clients().length) { TaskUI.openTaskSheet({ date: iso }); return; }   // 거래처가 없으면 할 일만 넣을 수 있다
    newSiteDate = iso;
    addSheetStep('일정 넣기', '어떤 일정인가요?', function (wrap) {
      [['➕ 신규 현장', '새 현장을 이 날짜로 만듭니다', 'site'],
       ['🔧 AS·추가작업', '이미 한 현장에 AS·추가작업을 이 날짜로 잡습니다', 'svc'],
       ['📝 할 일', '통화·필름 주문·인원 모집·챙길 것 — 이 날짜로 적습니다', 'task']].forEach(function (k) {
        var b = document.createElement('button'); b.type = 'button'; b.className = 'add-kind add-kind-' + k[2];
        b.innerHTML = '<b>' + esc(k[0]) + '</b><span>' + esc(k[1]) + '</span>';
        b.onclick = function () {
          if (k[2] === 'task') { closeNewSiteSheet(); TaskUI.openTaskSheet({ date: newSiteDate }); return; }
          pickClientStep(k[2]);
        };
        wrap.appendChild(b);
      });
    });
  }
  function pickClientStep(kind) {
    var cs = Store.clients();
    var next = function (clientId) {
      if (kind === 'site') { closeNewSiteSheet(); createSiteOn(clientId, newSiteDate); }
      else pickSiteStep(clientId, cs.length > 1);
    };
    if (cs.length === 1) { next(cs[0].id); return; }
    addSheetStep(kind === 'site' ? '현장 넣기' : 'AS·추가작업', '어느 거래처인가요?', function (wrap) {
      cs.forEach(function (c) {
        var b = document.createElement('button'); b.type = 'button'; b.className = 'chip pick';
        b.textContent = c.name;
        b.onclick = function () { next(c.id); };
        wrap.appendChild(b);
      });
      addSheetBack(wrap, function () { openAddSheet(newSiteDate); });
    });
  }
  // AS 는 이미 한 현장 안에 쌓는다 — 그 거래처 현장을 최근 작업일 순으로 보여준다
  function pickSiteStep(clientId, fromClients) {
    var lastOf = function (s) {
      var ds = Share.daysOf(s).map(function (d) { return d && d.date; }).filter(Share.isIsoDate).sort();
      return ds.length ? ds[ds.length - 1] : (Share.isIsoDate(s.date) ? s.date : '');
    };
    var sites = state.sites.filter(function (s) { return s.clientId === clientId; })
      .sort(function (a, b) { return lastOf(b).localeCompare(lastOf(a)) || (b.createdAt || 0) - (a.createdAt || 0); });
    var c = Store.getClient(clientId);
    addSheetStep('AS·추가작업', (c ? c.name + ' — ' : '') + '어느 현장인가요?', function (wrap) {
      if (!sites.length) {
        var e = document.createElement('div'); e.className = 'sec-empty'; e.textContent = '이 거래처에는 현장이 없습니다.';
        wrap.appendChild(e);
      }
      sites.forEach(function (s) {
        var b = document.createElement('button'); b.type = 'button'; b.className = 'add-site';
        var last = lastOf(s);
        b.innerHTML = '<b>' + esc(Share.titleLine(s)) + '</b>' + (last ? '<span>' + esc(Share.dayLabel(last)) + '</span>' : '');
        b.onclick = function () {
          closeNewSiteSheet();
          var v = Store.addService(s.id, { date: newSiteDate });
          openServiceSheet(s.id, v.id, renderSchedule, true, true);
        };
        wrap.appendChild(b);
      });
      addSheetBack(wrap, function () { fromClients ? pickClientStep('svc') : openAddSheet(newSiteDate); });
    });
  }
  function closeNewSiteSheet() { $('newSiteSheet').hidden = true; }
  function createSiteOn(clientId, iso) {
    var s = Store.addSite(clientId);
    Store.updateSite(s.id, { date: iso });
    pickedDate = '';
    go('#site/' + s.id);
  }
  $('newSiteClose').onclick = closeNewSiteSheet;
  $('newSiteSheet').onclick = function (e) { if (e.target === $('newSiteSheet')) closeNewSiteSheet(); };

  function renderSite() {
    var s = Store.getSite(currentSiteId); if (!s) { go(''); return; }
    staffDelDay = -1;   // 현장을 새로 열면 '빼기 모드'는 풀고 시작한다
    /* 체크박스 초기값: 전부 꺼짐 (2026-09-26).
       탭으로 나뉜 뒤로는 안 보이는 탭의 칸까지 켜져 있어서, 두어 개만 고른 줄 알고
       복사하면 전부 따라 나왔다. 이제 고른 것만 나간다 — 늘 쓰는 묶음은 [전체 선택] 한 번 */
    checked = {};
    Share.FIELDS.forEach(function (f) { checked[f.key] = false; });
    $('siteTitle').textContent = Share.titleLine(s);
    $('colorPicker').hidden = true;
    renderColorPicker(s);
    var wrap = $('siteFields'); wrap.innerHTML = '';
    paintHideState(s);
    paintPhotoBtn(s);
    // 탭으로 나눈 현장 화면 (2026-09-24 B안). 칸이 한 줄로 길게 이어져 한눈에 안 들어와서
    // 위에 요약(날짜·D-day·상태 알약)을 두고, 구역을 탭 다섯 개로 나눈다.
    // 탭은 보이기만 바꾼다 — 모든 칸은 늘 화면(DOM)에 있어서 질문/공유 복사·체크박스는 예전 그대로다
    if (siteTabFor !== s.id) { siteTab = 'info'; siteTabFor = s.id; }
    var head = document.createElement('div'); head.className = 'site-head'; head.id = 'siteHead';
    wrap.appendChild(head);
    var bar = document.createElement('div'); bar.className = 'site-tabs'; bar.id = 'siteTabs';
    SITE_TABS.forEach(function (t) {
      var b = document.createElement('button'); b.type = 'button';
      b.className = 'site-tab tab-' + t.key; b.dataset.tab = t.key;
      b.innerHTML = '<span>' + t.label + '</span><i class="tab-dot"></i>';
      b.onclick = function () { pickSiteTab(t.key, true); };
      bar.appendChild(b);
    });
    wrap.appendChild(bar);
    var panes = {};
    SITE_TABS.forEach(function (t) {
      var pn = document.createElement('div'); pn.className = 'site-pane pane-' + t.key; pn.dataset.tab = t.key;
      panes[t.key] = pn; wrap.appendChild(pn);
    });
    var sec = function (pane, id, render) {
      var box = document.createElement('div'); box.className = 'sec'; if (id) box.id = id;
      panes[pane].appendChild(box); render(box, s.id);
    };
    Share.FIELDS.forEach(function (f) {
      var pane = TAB_OF_FIELD[f.key] || 'info';
      if (f.key === 'films') sec('film', 'stageSec', renderStageSection);   // 필름 단계 띠는 필름 줄 바로 위
      if (f.key === 'memo') sec('review', 'settleSec', renderSettleSection);   // 정산 내역은 메모 바로 위 (2026-10-26)
      panes[pane].appendChild(fieldRow(s, f));
      if (f.key === 'date') {                                                // 시공날짜 바로 아래 날짜별 인원
        sec('staff', 'daysSec', renderDaysSection);
        sec('staff', 'extraSec', renderExtraSection);   // 추가작업 → 인원 (2026-10-26)
        sec('staff', '', renderContactSection);
      }
    });
    sec('film', 'extraFilmSec', renderExtraSection);   // 추가작업 → 필름 (같은 내용, 필름 탭에서도)
    sec('film', '', renderSuppliesSection);     // 필름 바로 아래 부자재 (2026-10-05 한 탭으로 묶음)
    sec('film', 'silSec', renderSiliconeSection);   // 부자재 바로 아래 실리콘 (2026-10-24)
    sec('etc', 'svcSec', renderServiceSection);
    sec('review', 'reviewSec', renderReviewSection);
    pickSiteTab(siteTab, false);
    paintSiteStatus();
    paintCopyPick();
  }

  var SITE_TABS = [
    { key: 'info', label: '기본·출입' },
    { key: 'staff', label: '일정·인원' },
    // 2026-10-05: 필름·부자재를 한 탭으로, 링크·AS → AS·추가 (AS 만), 견적서·현장사진·메모는 메모·후기로
    { key: 'film', label: '필름·부자재' },
    { key: 'etc', label: 'AS·추가' },
    { key: 'review', label: '메모·후기' }
  ];
  var TAB_OF_FIELD = { date: 'staff', films: 'film', quoteUrl: 'review', photoUrl: 'review', memo: 'review' };
  var INFO_ASK = ['pwLobby', 'pwUnit', 'barrier', 'gate', 'carReg', 'parking', 'cargoEv', 'toilet'];   // 업자에게 물어볼 출입 칸
  var siteTab = 'info', siteTabFor = '';
  function pickSiteTab(key, scroll) {
    siteTab = key;
    document.querySelectorAll('#siteTabs .site-tab').forEach(function (b) { b.classList.toggle('on', b.dataset.tab === key); });
    document.querySelectorAll('#siteFields .site-pane').forEach(function (p) { p.hidden = p.dataset.tab !== key; });
    // 탭을 바꾸면 그 구역 맨 위부터 보이게 (탭 줄이 상단바 밑에 붙어 있는 자리까지만 올린다)
    if (scroll) {
      var bar = $('siteTabs'), head = $('siteHead');
      if (bar && head && window.scrollY > head.offsetTop + head.offsetHeight) window.scrollTo(0, head.offsetTop + head.offsetHeight);
    }
  }
  // 탭 이름 옆 빨간 점·위쪽 알약 — 칸을 고칠 때마다(Store.onChange) 다시 칠한다
  function siteStatus(s) {
    var today = Share.todayIso();
    var st = {};
    // 기본·출입: 업자에게 물어볼 칸 중 빈 것
    var empty = INFO_ASK.filter(function (k) { return Share.isEmpty(s, k); });
    st.info = { warn: empty.length > 0, pill: empty.length ? '🚪 ' + empty.length + '칸 빔' : '🚪 출입 ✓', tone: empty.length ? 'amber' : 'green' };
    // 일정·인원
    var dated = s.days.filter(function (d) { return Share.isIsoDate(d.date); });
    var ss = Share.staffStatus(s);
    if (!dated.length) st.staff = { warn: true, pill: '📅 날짜 미정', tone: 'red' };
    else if (ss.need) st.staff = { warn: ss.short > 0, pill: '👤 ' + ss.have + '/' + ss.need + (ss.short ? '' : ' ✓'), tone: ss.short ? 'red' : 'green' };
    else st.staff = { warn: ss.have === 0, pill: ss.have ? '👤 ' + ss.have + '명' : '👤 미배정', tone: ss.have ? 'gray' : 'red' };
    // 필름
    var k = Share.filmStageOf(s), last = Share.FILM_STAGES.length - 1;
    st.film = { warn: k < last, pill: '🎞 ' + Share.FILM_STAGES[k].replace('필름 ', ''), tone: k === last ? 'green' : (k === 0 ? 'red' : 'amber') };
    // 부자재 — 필름과 한 탭이라 둘 중 하나라도 덜 됐으면 그 탭에 점
    var sup = s.supplies || [], ready = sup.filter(function (r) { return r.ready; }).length;
    st.supply = sup.length ? { warn: ready < sup.length, pill: '🧰 ' + ready + '/' + sup.length, tone: ready < sup.length ? 'amber' : 'green' }
      : { warn: false, pill: '', tone: 'gray' };
    st.film.warn = st.film.warn || st.supply.warn;
    // AS·추가: 남은 AS 가 있으면 점
    var as = Share.openServiceCount(s);
    st.etc = { warn: as > 0, pill: as ? '🔧 AS ' + as + '건' : '', tone: 'amber' };
    st.quote = !!String(s.quoteUrl || '').trim();
    // 후기: 시공 날짜가 다 지났는데 비어 있으면 점
    st.review = { warn: Share.reviewNeeded(s, today), pill: '', tone: 'gray' };
    // 날짜 줄: '9/28 월 – 9/29 화 · 2일 · D-4'
    var line = '', dd = '';
    if (dated.length) {
      var ds = dated.map(function (d) { return d.date; }).sort();
      var a = ds[0], z = ds[ds.length - 1];
      line = Share.shortDate(a) + ' ' + weekdayOf(a) + (a !== z ? ' – ' + Share.shortDate(z) + ' ' + weekdayOf(z) : '') + (ds.length > 1 ? ' · ' + ds.length + '일' : '');
      var next = ds.filter(function (d) { return d >= today; })[0];
      if (!next) dd = '끝남';
      else {
        var n = Math.round((new Date(next + 'T00:00:00') - new Date(today + 'T00:00:00')) / 86400000);
        dd = n === 0 ? '오늘' : n === 1 ? '내일' : 'D-' + n;
      }
    }
    st.when = line; st.dday = dd;
    return st;
  }
  function paintSiteStatus() {
    var s = Store.getSite(currentSiteId), head = $('siteHead');
    if (!s || !head) return;
    var st = siteStatus(s);
    var client = Store.getClient(s.clientId);
    head.innerHTML = '';
    var nm = document.createElement('div'); nm.className = 'sh-name'; nm.textContent = Share.titleLine(s);
    var sub = document.createElement('div'); sub.className = 'sh-sub';
    sub.innerHTML = '<span class="sh-when">📅 ' + (st.when ? esc(st.when) : '날짜 미정') + '</span>' +
      (st.dday ? '<span class="sh-dday' + (st.dday === '끝남' ? ' done' : '') + '">' + st.dday + '</span>' : '');
    // 견적서 버튼 (2026-10-18) — 현장업무 왼쪽. 이어 붙인 견적서의 내역을 보고 인원을 가늠한다
    var qb = document.createElement('button'); qb.type = 'button';
    qb.className = 'sh-quote' + (s.quoteCode ? ' on' : '');
    qb.textContent = s.quoteCode ? '📄 견적서 ✓' : '📄 견적서 연결';
    qb.title = s.quoteCode ? '견적 내역 보기 · /q/' + s.quoteCode : '발행한 견적서를 이 현장에 이어 붙입니다';
    qb.onclick = function () { openQuoteSheet(s.id); };
    sub.appendChild(qb);
    // 현장업무(관리자 앱) 연결 버튼 — 연결 전엔 '연결', 후엔 맞춤 상태와 함께 시트를 연다
    var ab = document.createElement('button'); ab.type = 'button';
    ab.className = 'sh-admin' + (s.adminId ? ' on' : '');
    ab.textContent = s.adminId ? '🛠 현장업무 ' + adminBadge(s) : '🛠 현장업무 연결';
    ab.onclick = function () { openAdminSheet(s.id); };
    sub.appendChild(ab);
    // 거래처명을 누르면 그 업체 탭이 열린 거래처 화면으로 (같은 업체의 다른 현장을 바로 본다)
    if (client) {
      var cb = document.createElement('button'); cb.type = 'button'; cb.className = 'sh-client';
      cb.textContent = client.name; cb.title = '이 업체의 현장 목록 보기';
      cb.onclick = function () {
        currentClientId = client.id;
        if (state.settings.lastTab !== client.id) Store.setSettings({ lastTab: client.id });
        go('');
      };
      sub.appendChild(cb);
    }
    // 상태 알약 줄은 뺐다 (2026-09-26) — 탭 이름 옆 빨간 점이면 '여기 볼 게 있다' 는 걸 알기에 넉넉하고,
    // 알약이 두 줄로 늘어나 정작 봐야 할 칸이 아래로 밀렸다. 판정(siteStatus)은 그 점에 그대로 쓴다
    head.appendChild(nm); head.appendChild(sub);
    SITE_TABS.forEach(function (t) {
      var b = document.querySelector('#siteTabs .tab-' + t.key);
      if (b) b.classList.toggle('warn', !!st[t.key].warn);
    });
  }
  Store.onChange(function () { if (!$('viewSite').hidden) paintSiteStatus(); });

  /* ---------- 견적서 연결 (2026-10-18) ----------
     현장에 발행된 견적서 한 장을 이어 붙인다. 내역(구역별 품목·금액)을 그 자리에서 보고
     인원을 몇 명 넣을지 가늠하고, 현장업무를 연결할 때 그 견적대로 시공품목을 자동으로 켠다.
     계산·통신은 quote_link.js */
  var quoteDeps = { fetchFn: function (u, o) { return window.fetch(u, o); } };
  var 견적캐시 = {};   // 견적코드 → 받아 둔 견적서 (화면용, 저장하지 않음)

  function 원화(n) { return Math.round(n || 0).toLocaleString('ko-KR') + '원'; }

  function openQuoteSheet(siteId) {
    var s = Store.getSite(siteId); if (!s) return;
    if (!s.quoteCode) { openQuotePicker(siteId); return; }
    var code = s.quoteCode;
    var btn = function (k, label) { return '<button type="button" data-k="' + k + '">' + label + '</button>'; };
    var 그리기 = function (내용) {
      openModal('📄 견적서 · /q/' + code,
        내용 + '<div class="sheet-list">' +
          btn('items', '🛠 현장업무에 시공품목 자동 선택<small>' + (s.adminId ? '견적서에 있는 품목을 현장업무에서 켭니다' : '먼저 현장업무를 연결해야 합니다') + '</small>') +
          btn('open', '🔗 견적서 열기<small>발행된 견적서를 새 창으로</small>') +
          btn('change', '🔁 다른 견적서로 바꾸기') +
          btn('unlink', '✕ 견적서 연결 해제') +
        '</div>', [{ label: '닫기', cls: 'primary', onClick: closeModal }]);
      $('modalBody').querySelectorAll('button[data-k]').forEach(function (b) {
        b.onclick = function () {
          var k = b.dataset.k;
          if (k === 'open') { window.open(QuoteLink.보기주소(code), '_blank'); return; }
          if (k === 'change') { openQuotePicker(siteId); return; }
          if (k === 'items') { applyQuoteItems(siteId); return; }
          if (k === 'unlink') {
            modalConfirm('견적서 연결 해제', '이 현장에서 견적서 연결만 끊습니다. 견적서 자체는 그대로 있습니다.', '연결 해제', true).then(function (ok) {
              if (!ok) { openQuoteSheet(siteId); return; }
              Store.updateSite(siteId, { quoteCode: '' });
              closeModal(); paintSiteStatus(); toast('견적서 연결을 끊었습니다');
            });
          }
        };
      });
    };
    그리기('<p class="hint">견적 내역을 불러오는 중…</p>');
    var 이미 = 견적캐시[code];
    var p = 이미 ? Promise.resolve(이미) : QuoteLink.견적받기(code, quoteDeps).then(function (q) { 견적캐시[code] = q; return q; });
    p.then(function (q) {
      var sum = QuoteLink.요약(q);
      var html = '<div class="qv-head"><b>' + esc(sum.현장명 || '(이름 없음)') + '</b>' +
        '<span>' + esc([sum.평형, sum.줄수 ? '품목 ' + sum.줄수 + '개' : '', sum.총액 ? 원화(sum.총액) : ''].filter(Boolean).join(' · ')) + '</span></div>';
      QuoteLink.구역별(q.라인들).forEach(function (z) {
        html += '<div class="qv-zone"><span>' + esc(z.구역) + '</span><em>' + esc(원화(z.합)) + '</em></div>';
        z.줄.forEach(function (x) {
          html += '<div class="qv-line"><span>' + esc(x.품목명) + (x.수량 ? ' <i>' + esc(x.수량 + (x.단위 || '')) + '</i>' : '') +
            '</span><em>' + esc(원화(x.금액)) + '</em></div>';
        });
      });
      그리기('<div class="qv-box">' + html + '</div>');
    }, function (e) {
      그리기('<p class="hint admin-err">⚠ 견적 내역을 못 받았습니다 (' + esc(e.message) + ')</p>');
    });
  }

  // 이 현장에 이어 붙일 견적서 고르기 — 거래처에 이어 둔 견적서·발행 목록에서 고르거나 코드를 직접 넣는다
  function openQuotePicker(siteId) {
    var s = Store.getSite(siteId); if (!s) return;
    openModal('견적서 연결', '<p class="hint">불러오는 중…</p>', [{ label: '닫기', onClick: closeModal }]);
    QuoteRequests.발행목록(quoteDeps).then(function (list) {
      var c = Store.getClient(s.clientId) || {};
      var 이은코드 = Array.isArray(c.quoteCodes) ? c.quoteCodes : [];
      var 쓴코드 = ((Store.state && Store.state.sites) || []).reduce(function (m, x) {
        if (x.quoteCode && x.id !== siteId) m[x.quoteCode] = Share.titleLine(x);
        return m;
      }, {});
      // 이 거래처 것(또는 거래처에 이어 둔 것)을 위로, 나머지는 발행 최신순
      var rank = function (p) { return (p.현장관리_거래처ID === s.clientId || 이은코드.indexOf(p.견적코드) >= 0) ? 0 : 1; };
      var ranked = (list || []).filter(function (p) { return p && p.견적코드; })
        .sort(function (a, b) { return (rank(a) - rank(b)) || String(b.발행일시 || '').localeCompare(String(a.발행일시 || '')); })
        .slice(0, 50);
      var html = '<div class="qreq-linkrow"><input type="text" id="qlCode" placeholder="견적코드 또는 /q/… 주소" autocomplete="off">' +
        '<button type="button" class="btn-sm primary" id="qlGo">연결</button></div><p class="hint admin-err" id="qlMsg" hidden></p>';
      html += ranked.length
        ? '<div class="sheet-list">' + ranked.map(function (p, k) {
            var 남 = 쓴코드[p.견적코드];
            return '<button type="button" data-k="' + k + '">' + esc(p.현장명 || '(이름 없음)') +
              (rank(p) === 0 ? ' <em class="sim">이 거래처</em>' : '') +
              '<small>' + esc([p.발행일시 ? Share.shortDate(String(p.발행일시).slice(0, 10)) : '', p.총액 ? 원화(p.총액) : '', '/q/' + p.견적코드,
                남 ? '이미 ' + 남 + ' 에 연결됨' : ''].filter(Boolean).join(' · ')) + '</small></button>';
          }).join('') + '</div>'
        : '<p class="hint">발행된 견적서를 못 받았습니다. 위 칸에 견적코드를 넣어 연결하세요.</p>';
      $('modalBody').innerHTML = html;
      var 붙이기 = function (code) {
        var c2 = QuoteLink.코드뽑기(code);
        if (!c2) { $('qlMsg').textContent = '견적코드를 알아보지 못했어요'; $('qlMsg').hidden = false; return; }
        Store.updateSite(siteId, { quoteCode: c2 });
        paintSiteStatus();
        toast('견적서를 이 현장에 이어 붙였습니다');
        openQuoteSheet(siteId);
      };
      $('qlGo').onclick = function () { 붙이기($('qlCode').value); };
      $('qlCode').addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); 붙이기($('qlCode').value); }
      });
      $('modalBody').querySelectorAll('button[data-k]').forEach(function (b) {
        b.onclick = function () { 붙이기(ranked[+b.dataset.k].견적코드); };
      });
    }, function (e) {
      $('modalBody').innerHTML = '<p class="hint admin-err">⚠ 목록을 못 받았습니다 (' + esc(e.message) + ')</p>' +
        '<div class="qreq-linkrow"><input type="text" id="qlCode" placeholder="견적코드 또는 /q/… 주소" autocomplete="off">' +
        '<button type="button" class="btn-sm primary" id="qlGo">연결</button></div>';
      $('qlGo').onclick = function () {
        var c2 = QuoteLink.코드뽑기($('qlCode').value);
        if (!c2) { toast('견적코드를 알아보지 못했어요'); return; }
        Store.updateSite(siteId, { quoteCode: c2 }); paintSiteStatus(); openQuoteSheet(siteId);
      };
    });
  }

  /* 견적서대로 현장업무의 시공품목을 켠다.
     현장업무를 새로 연결한 직후에도 자동으로 불린다 (조용히: 결과만 토스트) */
  function applyQuoteItems(siteId, 조용히) {
    var s = Store.getSite(siteId); if (!s) return Promise.resolve(null);
    if (!s.quoteCode || !s.adminId) {
      if (!조용히) toast(s.adminId ? '먼저 견적서를 연결하세요' : '먼저 현장업무를 연결하세요');
      return Promise.resolve(null);
    }
    if (!조용히) openModal('시공품목 맞추는 중…', '<p class="hint">견적서를 보고 현장업무 품목을 켜는 중입니다…</p>', []);
    return QuoteLink.품목맞추기(s.adminId, s.quoteCode, quoteDeps).then(function (r) {
      var 말 = r.켠것.length ? '시공품목 ' + r.켠것.length + '개를 켰습니다' : '새로 켤 품목이 없습니다';
      if (r.이미.length) 말 += ' · 이미 ' + r.이미.length + '개';
      if (r.실패.length) 말 += ' · 실패 ' + r.실패.length + '개';
      if (조용히) { toast('견적서대로 ' + 말); return r; }
      var html = '<p class="hint">' + esc(말) + '</p>';
      if (r.켠것.length) html += '<div class="qv-box">' + r.켠것.map(function (n) { return '<div class="qv-line"><span>☑ ' + esc(n) + '</span></div>'; }).join('') + '</div>';
      if (r.짝없음.length) {
        html += '<p class="hint admin-err">⚠ 현장업무에 짝이 없는 품목입니다 — 관리자 앱에서 직접 골라주세요<br>' +
          esc(r.짝없음.map(function (x) { return x.구역 + ' ' + x.견적품목; }).join(', ')) + '</p>';
      }
      openModal('시공품목 자동 선택', html, [{ label: '닫기', cls: 'primary', onClick: closeModal }]);
      return r;
    }, function (e) {
      if (조용히) toast('시공품목 자동 선택 실패 (' + e.message + ')');
      else openModal('시공품목 자동 선택', '<p class="hint admin-err">⚠ 실패했습니다 (' + esc(e.message) + ')</p>',
        [{ label: '닫기', cls: 'primary', onClick: closeModal }]);
      return null;
    });
  }

  // ---------- 현장업무 연결 (관리자 앱 현장과 이어 붙이기 · 이름/날짜/인원 자동 맞춤) ----------
  // 설계: docs/superpowers/specs/2026-10-05-현장연결-design.md · 로직은 adminlink.js
  var adminDeps = { fetchFn: function (u, o) { return window.fetch(u, o); }, Store: Store };
  var adminInfo = {};     // 현장 id → { busy, fail, failStamp, error, kept, adminOnly } (화면용, 저장하지 않음)
  var adminTimers = {};   // 현장 id → 디바운스 타이머
  var ADMIN_DEBOUNCE_MS = 3000;

  function adminBadge(s) {
    var i = adminInfo[s.id] || {};
    if (i.busy) return '맞추는 중…';
    if (i.fail) return '⚠ 맞춤 실패';
    return AdminLink.needsSync(s).any ? '맞춤 대기' : '✓';
  }
  function adminRepaint() { if (!$('viewSite').hidden) paintSiteStatus(); }

  function runAdminSync(siteId) {
    var i = adminInfo[siteId] = Object.assign(adminInfo[siteId] || {}, { busy: true });
    adminRepaint();
    return AdminLink.syncSite(siteId, adminDeps).then(function (r) {
      var cur = Store.getSite(siteId);
      adminInfo[siteId] = { busy: false, fail: !r.ok, failStamp: cur ? cur.updatedAt : 0, error: r.error || '',
        kept: r.kept || [], adminOnly: r.adminOnly || [] };
      adminRepaint();
      return r;
    }, function (e) {
      var cur = Store.getSite(siteId);
      adminInfo[siteId] = { busy: false, fail: true, failStamp: cur ? cur.updatedAt : 0, error: e.message, kept: [], adminOnly: [] };
      adminRepaint();
    });
  }
  // 연결된 현장 중 맞출 게 있으면 3초 뒤 맞춘다. 실패한 뒤에는 그 현장이 바뀌기 전까지 자동으로 다시 하지 않는다(무한 재시도 방지)
  function scheduleAdminSync() {
    ((Store.state && Store.state.sites) || []).forEach(function (s) {
      if (!s.adminId || !AdminLink.needsSync(s).any) return;
      var id = s.id;
      clearTimeout(adminTimers[id]);
      adminTimers[id] = setTimeout(function () {
        var cur = Store.getSite(id), i = adminInfo[id] || {};
        if (!cur || !cur.adminId || !AdminLink.needsSync(cur).any || i.busy) return;
        if (i.fail && i.failStamp === cur.updatedAt) return;
        runAdminSync(id);
      }, ADMIN_DEBOUNCE_MS);
    });
  }
  Store.onChange(scheduleAdminSync);

  function adminSheetError(siteId, msg) { openAdminSheet(siteId, msg); }

  function openAdminSheet(siteId, errorMsg) {
    var s = Store.getSite(siteId); if (!s) return;
    var err = errorMsg ? '<p class="hint admin-err">⚠ ' + esc(errorMsg) + '</p>' : '';
    var btn = function (act, label) { return '<button type="button" data-act="' + act + '">' + label + '</button>'; };
    if (!s.adminId) {
      var n = AdminLink.rosterOf(s).length, d = AdminLink.firstDate(s);
      openModal('현장업무 연결',
        '<p class="hint">이 현장의 현장명·시공일·인원이 현장업무(관리자 앱)와 한 번에 이어집니다. 이어진 뒤에는 여기서 고치면 현장업무에도 자동으로 반영됩니다.</p>' + err +
        '<div class="sheet-list">' +
          btn('create', '➕ 새 현장업무 만들기<small>' + esc(AdminLink.adminTitle(s) || '(현장명 없음)') + ' · ' + (d ? esc(Share.shortDate(d)) : '시공일 미정') + ' · 인원 ' + n + '명</small>') +
          btn('pick', '📋 기존 현장업무에서 고르기<small>이미 관리자 앱에 만들어 둔 현장과 묶습니다</small>') +
        '</div>',
        [{ label: '닫기', onClick: closeModal }]);
      $('modalBody').querySelectorAll('button[data-act]').forEach(function (b) {
        b.onclick = function () { b.dataset.act === 'create' ? createAdminProject(siteId) : openAdminPicker(siteId); };
      });
      return;
    }
    var i = adminInfo[siteId] || {};
    var notes = '';
    if (i.kept && i.kept.length) notes += '<p class="hint">배정이 있어 남겨둠: ' + esc(i.kept.join(', ')) + '</p>';
    if (i.adminOnly && i.adminOnly.length) notes += '<p class="hint">관리자 앱에만 있는 기사: ' + esc(i.adminOnly.join(', ')) + '</p>';
    openModal('현장업무',
      '<p class="hint">맞춤 상태: <b>' + esc(adminBadge(s)) + '</b>' + (i.fail && i.error ? ' (' + esc(i.error) + ')' : '') + '</p>' + err + notes +
      '<div class="sheet-list">' +
        btn('open', '🛠 현장업무 열기<small>관리자 앱의 이 현장으로 이동</small>') +
        btn('sync', '🔄 지금 맞추기') +
        '<button type="button" data-act="unlink" class="danger">연결 해제<small>관리자 앱의 현장은 그대로 남습니다</small></button>' +
      '</div>',
      [{ label: '닫기', onClick: closeModal }]);
    $('modalBody').querySelectorAll('button[data-act]').forEach(function (b) {
      b.onclick = function () {
        var act = b.dataset.act;
        if (act === 'open') { window.open(AdminLink.adminOpenUrl(s.adminId, s.quoteCode), '_blank'); return; }   // 견적코드도 같이 넘긴다
        if (act === 'sync') { closeModal(); runAdminSync(siteId).then(function (r) { toast(r && r.ok ? '맞췄습니다' : '맞추지 못했습니다'); }); return; }
        if (act === 'unlink') {
          modalConfirm('연결 해제', '일정 앱과 현장업무의 연결만 끊습니다. 관리자 앱의 현장은 지워지지 않습니다.', '연결 해제', true).then(function (ok) {
            if (!ok) { openAdminSheet(siteId); return; }
            AdminLink.unlink(siteId, adminDeps); adminInfo[siteId] = {}; adminRepaint(); toast('연결을 해제했습니다');
          });
        }
      };
    });
  }

  function createAdminProject(siteId) {
    var s = Store.getSite(siteId);
    if (!AdminLink.adminTitle(s)) { adminSheetError(siteId, '현장명을 먼저 적어주세요.'); return; }
    openModal('현장업무 만들기', '<p class="hint">만드는 중…</p>', []);
    AdminLink.createProject(siteId, adminDeps).then(function () {
      closeModal(); adminRepaint(); toast('현장업무를 만들고 연결했습니다');
      applyQuoteItems(siteId, true);   // 견적서를 이어 뒀으면 그 견적대로 시공품목까지 켠다
    }, function (e) {
      adminSheetError(siteId, '만들지 못했습니다: ' + e.message + ' — 관리자 앱에 이미 생겼는지 확인한 뒤 다시 시도하세요.');
    });
  }

  function openAdminPicker(siteId) {
    var s = Store.getSite(siteId);
    openModal('기존 현장업무 고르기', '<p class="hint">불러오는 중…</p>', [{ label: '← 뒤로', onClick: function () { openAdminSheet(siteId); } }]);
    AdminLink.listProjects(adminDeps).then(function (list) {
      var linked = ((Store.state && Store.state.sites) || []).map(function (x) { return x.adminId; }).filter(Boolean);
      var ranked = AdminLink.rankProjects(list, AdminLink.adminTitle(s), linked);
      if (!ranked.length) { $('modalBody').innerHTML = '<p class="hint">고를 수 있는 현장업무가 없습니다.</p>'; return; }
      $('modalBody').innerHTML = '<p class="hint">비슷한 이름이 위에 나옵니다. 이미 다른 현장에 연결된 것은 고를 수 없습니다.</p><div class="sheet-list">' +
        ranked.map(function (p, k) {
          return '<button type="button" data-k="' + k + '"' + (p.linked ? ' disabled' : '') + '>' + esc(p.name || '(이름없음)') + (p.similar ? ' <em class="sim">비슷함</em>' : '') +
            '<small>' + (p.linked ? '이미 연결됨' : esc([p.date ? Share.shortDate(p.date) : '시공일 미정', p.workers.length ? '기사 ' + p.workers.length + '명' : ''].filter(Boolean).join(' · '))) + '</small></button>';
        }).join('') + '</div>';
      $('modalBody').querySelectorAll('button[data-k]').forEach(function (b) {
        b.onclick = function () {
          var p = ranked[+b.dataset.k];
          AdminLink.linkExisting(siteId, p.id, adminDeps);
          closeModal(); adminRepaint(); toast('연결했습니다 — 날짜·인원을 맞춥니다');
          applyQuoteItems(siteId, true);   // 견적서를 이어 뒀으면 그 견적대로 시공품목까지 켠다
        };
      });
    }, function (e) {
      $('modalBody').innerHTML = '<p class="hint admin-err">⚠ 목록을 불러오지 못했습니다 (' + esc(e.message) + ')</p>';
    });
  }

  // 견적 앱이 보낸 연결 주소(#adminlink=<현장 id>:<현장업무 id>)를 처리한다. route() 가 모르는 해시를 지우기 전에 먼저 본다
  function handleAdminLinkHash() {
    var al = AdminLink.parseAdminLinkHash(location.hash);
    if (!al) return;
    var ts = Store.getSite(al.siteId);
    if (!ts) toast('이 폰에 없는 현장입니다');
    else if (ts.adminId && ts.adminId !== al.adminId) toast('이미 다른 현장업무와 연결돼 있습니다');
    else if (ts.adminId) toast('이미 연결돼 있습니다');
    else if (((Store.state && Store.state.sites) || []).some(function (x) { return x.adminId === al.adminId; })) toast('그 현장업무는 다른 현장에 이미 연결돼 있습니다');
    else { AdminLink.linkExisting(al.siteId, al.adminId, adminDeps); toast('현장업무를 연결했습니다'); }
    history.replaceState(null, '', location.pathname + (ts ? '#site/' + al.siteId : ''));
  }

  // ---------- 필름 준비 단계 (현장 상세 + 일정 화면 공용) ----------
  // 4칸 띠: 지난 단계·현재 단계는 파랑, 아직 안 온 단계는 빨강. 미확정(0)이면 네 칸 다 빨강.
  // 깜빡임은 눈이 아프니 시공일 3일 전부터만 (opts.date 기준, 없으면 site.date).
  // opts.onPick(k) 를 주면 탭해서 단계를 바꿀 수 있다
  function renderStageStrip(container, site, opts) {
    container.innerHTML = '';
    var k = Share.filmStageOf(site), last = Share.FILM_STAGES.length - 1;
    var urgent = Share.isUrgent((opts && opts.date) || site.date);
    // 첫날 2일 전까지 주문을 안 넣었으면 띠 전체가 빨갛게 반짝인다 (2026-10-24)
    container.classList.toggle('film-late', Share.filmOrderLate(site));
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
  /* 이름 칩 (2026-10-18 바뀜)
     그냥 탭하면 그 사람에게 전화가 걸린다 (설정 › 팀원의 연락처). 번호가 없으면 알림만.
     빼기는 [−] 를 눌러 '빼기 모드'로 들어간 뒤, 이름에 생긴 ✕ 를 눌러야 지워진다
     — 전화하려다 사람이 빠지는 일이 없게 두 단계로 나눴다.
     opts: dup{정규화이름:true} 겹침 표시, del 빼기 모드, onRemove(name), onAdd(), onDelToggle() */
  function renderChips(container, names, opts) {
    container.innerHTML = '';
    var dup = (opts && opts.dup) || {};
    var del = !!(opts && opts.del);
    (names || []).forEach(function (n) {
      var isDup = !!dup[String(n).replace(/\s+/g, '')];
      var phone = Share.personOf(state.settings.people, n).phone;
      var c;
      if (del) {                                   // 빼기 모드 — 탭하면 뺀다
        c = document.createElement('button'); c.type = 'button';
        c.className = 'chip del' + (isDup ? ' dup' : '');
        c.textContent = n + ' ✕';
        c.title = '탭하면 이 날에서 뺍니다';
        c.onclick = function (e) { e.stopPropagation(); opts && opts.onRemove && opts.onRemove(n); };
      } else if (phone) {                          // 이름=전화 걸기 · 💬=문자 (2026-10-19)
        c = document.createElement('span');
        c.className = 'chip call' + (isDup ? ' dup' : '');
        var cnm = document.createElement('a');
        cnm.className = 'chip-nm'; cnm.href = telHref(phone);
        cnm.textContent = n + (isDup ? ' ⚠' : '');
        cnm.title = (isDup ? '같은 날 다른 현장에도 들어가 있음 · ' : '') + phone + ' 로 전화';
        cnm.onclick = function (e) { e.stopPropagation(); };
        var csm = document.createElement('a');
        csm.className = 'chip-sms'; csm.href = smsHref(phone);
        csm.textContent = '💬'; csm.title = n + ' 에게 문자 (' + phone + ')';
        csm.onclick = function (e) { e.stopPropagation(); };
        c.appendChild(cnm); c.appendChild(csm);
      } else {                                     // 번호가 없는 사람
        c = document.createElement('button'); c.type = 'button';
        c.className = 'chip nophone' + (isDup ? ' dup' : '');
        c.textContent = n + (isDup ? ' ⚠' : '');
        c.title = '연락처 없음 — 설정 › 팀원에서 번호를 넣으세요';
        c.onclick = function (e) { e.stopPropagation(); toast(n + ' 연락처가 없습니다 — 설정 › 팀원에서 번호를 넣으세요'); };
      }
      container.appendChild(c);
    });
    if (opts && opts.onAdd) {
      var add = document.createElement('button'); add.type = 'button'; add.className = 'chip add'; add.textContent = '＋';
      add.title = '인원 추가';
      add.onclick = function (e) { e.stopPropagation(); opts.onAdd(); };
      container.appendChild(add);
    }
    if (opts && opts.onDelToggle && (names || []).length) {
      var rm = document.createElement('button'); rm.type = 'button'; rm.className = 'chip del-toggle' + (del ? ' on' : '');
      rm.textContent = del ? '완료' : '−';
      rm.title = del ? '빼기 끝내기' : '인원 빼기 — 누르면 이름에 ✕ 가 생깁니다';
      rm.onclick = function (e) { e.stopPropagation(); opts.onDelToggle(); };
      container.appendChild(rm);
    }
  }
  function dayLabel(i, date) {
    return (i + 1) + '일차' + (date ? ' ' + Share.dayLabel(date) : '');
  }
  // '1일차 10/8(목)' 을 칸에 그린다. 일요일·공휴일은 날짜를 빨갛게, 공휴일은 이름도 붙인다
  function fillDayLabel(el, i, date) {
    el.textContent = (i + 1) + '일차 ';
    var dt = document.createElement('span');
    dt.className = 'dl-date' + (Share.isRedDay(date) ? ' red' : '');
    dt.textContent = Share.dayLabel(date) || date;
    el.appendChild(dt);
    var hn = Share.holidayName(date);
    if (hn) { var h = document.createElement('span'); h.className = 'dl-holi'; h.textContent = hn; el.appendChild(h); }
  }
  /* 그날 들어간 사람 수 뱃지 — '5명'. 필요 인원은 현장 전체를 두고 정하는 수라
     날짜 줄에서는 견주지 않는다 (합계는 아래 staffTotalBadge 가 보여 준다) */
  function staffCountBadge(site, dayIndex, big) {
    var n = Share.dayStaffCount(site, dayIndex);
    var el = document.createElement('span');
    el.className = 'cnt' + (big ? ' lg' : '') + (n ? ' day' : ' short');
    el.textContent = Share.staffCountLabel(site, dayIndex);
    el.title = '이 날 ' + n + '명';
    return el;
  }
  // 현장 전체 배치/필요 뱃지 — '10/10'(초록) '6/10'(빨강) '12/10'(파랑)
  function staffTotalBadge(site, big) {
    var st = Share.staffStatus(site);
    var cls = 'cnt' + (big ? ' lg' : '');
    if (st.need) cls += st.short ? ' short' : (st.over ? ' over' : ' ok');
    else if (!st.have) cls += ' short';
    var el = document.createElement('span'); el.className = cls;
    el.textContent = Share.staffTotalLabel(site);
    el.title = st.need ? '다 더해 ' + st.have + '명 / 필요 ' + st.need + '명' + (st.short ? ' — ' + st.short + '명 더 필요' : '') : '다 더해 ' + st.have + '명';
    return el;
  }
  // 현장 상세: 총 필요 인원 칸 (− ＋ 로 올리고 내린다). 0 이면 '미정'
  function needStaffRow(siteId, rerender) {
    var s = Store.getSite(siteId);
    var need = Share.needStaffOf(s);
    var row = document.createElement('div'); row.className = 'sec-row need-row';
    var lb = document.createElement('div'); lb.className = 'day-label'; lb.textContent = '필요 인원';
    var step = document.createElement('div'); step.className = 'stepper';
    var bump = function (label, delta, title) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'step-btn'; b.textContent = label; b.title = title;
      b.onclick = function () { Store.setNeedStaff(siteId, need + delta); rerender(); };
      return b;
    };
    var val = document.createElement('div'); val.className = 'step-val' + (need ? '' : ' none');
    val.textContent = need ? need + '명' : '미정';
    // 숫자를 탭하면 직접 입력 (10명 넘는 현장은 ＋ 를 여러 번 누르기 번거롭다)
    val.onclick = function () {
      modalPrompt('총 필요 인원', need ? String(need) : '', '숫자만 (0 = 미정)').then(function (v) {
        if (v == null) return;
        Store.setNeedStaff(siteId, parseInt(String(v).replace(/[^0-9]/g, ''), 10) || 0);
        rerender();
      });
    };
    step.appendChild(bump('−', -1, '한 명 줄이기'));
    step.appendChild(val);
    step.appendChild(bump('＋', 1, '한 명 늘리기'));
    row.appendChild(lb); row.appendChild(step);
    return row;
  }
  // 지금 '빼기 모드'인 날짜 줄 (-1 = 없음). 한 번에 한 줄만, 화면을 다시 그리면 풀린다
  var staffDelDay = -1;
  // 현장 상세: 일차별 인원 구역. 날짜 자체는 시공날짜 칸(달력)에서 고른다 — 여기서는 인원만
  // 맨 위에 총 필요 인원을 정해두면 날마다 배치/필요(3/3)가 옆에 뜨고, 모자란 날은 빨갛게 나온다
  function renderDaysSection(box, siteId) {
    var s = Store.getSite(siteId); if (!s) return;
    box.innerHTML = '<h3 class="sec-title">날짜별 인원</h3>';
    var rerender = function () { renderDaysSection(box, siteId); };
    box.appendChild(needStaffRow(siteId, rerender));
    var ss = Share.staffStatus(s);
    var nh = document.createElement('div'); nh.className = 'sec-empty' + (ss.short ? ' warn' : '');
    nh.textContent = !ss.need ? '이 현장에 다 더해 몇 명이 들어가야 하는지 정해두면, 날마다 채워 가며 견줄 수 있습니다.'
      : ss.short ? '⚠ 다 더해 ' + ss.have + '명 — ' + ss.short + '명 더 넣어야 합니다 (필요 ' + ss.need + '명)'
      : '✓ 다 더해 ' + ss.have + '명, 필요한 ' + ss.need + '명을 다 채웠습니다.';
    box.appendChild(nh);
    // 날짜 줄 — 날마다 테두리로 감싸서 누가 어느 날인지 섞이지 않게 한다 (2026-09-26)
    s.days.forEach(function (d, i) {
      // 날마다 테두리 색을 돌려 쓴다 — 이름이 여러 줄로 흐를 때 어느 날 사람인지 색으로 갈린다
      var row = document.createElement('div'); row.className = 'sec-row day-row day-c' + (i % 6);
      var head = document.createElement('div'); head.className = 'day-head';
      var lb = document.createElement('span'); lb.className = 'day-label';
      if (d.date) fillDayLabel(lb, i, d.date); else lb.textContent = '날짜 없음';
      head.appendChild(lb); head.appendChild(staffCountBadge(s, i, false));
      var chips = document.createElement('div'); chips.className = 'chips';
      renderChips(chips, d.staff, {
        del: staffDelDay === i,
        onRemove: function (n) { Store.removeStaff(siteId, i, n); rerender(); },
        onAdd: function () { staffDelDay = -1; openStaffPicker(siteId, i, rerender); },
        onDelToggle: function () { staffDelDay = (staffDelDay === i ? -1 : i); rerender(); }
      });
      row.appendChild(head); row.appendChild(chips);
      box.appendChild(row);
    });
    // 합계 줄 — 날짜 줄을 다 더한 수를 필요 인원과 견준다
    if (s.days.length > 1 || ss.need) {
      var sum = document.createElement('div'); sum.className = 'sec-row sum-row';
      var sl = document.createElement('div'); sl.className = 'day-label'; sl.textContent = '다 더해';
      sum.appendChild(sl); sum.appendChild(document.createElement('span'));
      sum.appendChild(staffTotalBadge(s, true));
      box.appendChild(sum);
    }
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
    // 빈 칸 없이 앞뒤 달 날짜까지 — 9/30 다음 날인 10/1 을 고르려고 달을 넘기지 않아도 된다.
    // 앞뒤 달 날짜도 그대로 골라진다 (달이 바뀌는 현장이 흔하다)
    var 이번달 = cal.year + '-' + String(cal.month).padStart(2, '0');
    Share.monthGridFull(cal.year, cal.month).forEach(function (week) {
      week.forEach(function (iso, i) {
        var c = document.createElement('button'); c.type = 'button'; c.className = 'cal-d';
        c.textContent = String(+iso.slice(8, 10));
        // 일요일·공휴일은 빨강 (공휴일은 누르기 전에 이름을 볼 수 있게 title 에 둔다)
        if (Share.isRedDay(iso)) c.className += ' sun'; else if (i === 6) c.className += ' sat';
        if (Share.holidayName(iso)) c.title = Share.holidayName(iso);
        if (iso.slice(0, 7) !== 이번달) c.className += ' out';
        if (iso === today) c.className += ' today';
        if (order[iso]) { c.className += ' on'; c.innerHTML += '<span class="cal-n">' + order[iso] + '</span>'; }
        c.onclick = function () { if (민직후) return; if (cal.picked[iso]) delete cal.picked[iso]; else cal.picked[iso] = true; renderCalendar(); };
        grid.appendChild(c);
      });
    });
    $('calSummary').textContent = picked.length ? picked.map(Share.shortDate).join(', ') + ' (' + picked.length + '일)' : '날짜를 탭해서 고르세요. 다시 탭하면 빠집니다.';
  }
  // 달 넘기기 — 위의 ‹ › 버튼과 좌우로 미는 손짓이 같은 길을 쓴다
  function calMonthPrev() { if (--cal.month < 1) { cal.month = 12; cal.year--; } renderCalendar(); }
  function calMonthNext() { if (++cal.month > 12) { cal.month = 1; cal.year++; } renderCalendar(); }
  $('calPrev').onclick = calMonthPrev;
  $('calNext').onclick = calMonthNext;
  // 일정 화면 달력과 같은 손짓: 오른쪽으로 밀면 지난 달, 왼쪽으로 밀면 다음 달.
  // 세로로 그으면 시트가 그대로 스크롤된다 (bindSwipe 가 세로면 손을 뗀다)
  bindSwipe($('calSwipe'), $('calGrid'), calMonthPrev, calMonthNext);
  $('calToday').onclick = function () { var t = Share.todayIso(); cal.year = +t.slice(0, 4); cal.month = +t.slice(5, 7); renderCalendar(); };
  $('calClear').onclick = function () { cal.picked = {}; renderCalendar(); };
  $('calOk').onclick = function () { closeCalendar(true); };
  $('calClose').onclick = function () { closeCalendar(false); };
  $('calSheet').addEventListener('click', function (e) { if (e.target === $('calSheet')) closeCalendar(false); });
  /* 현장 상세: 연락처 보내기 (2026-09-24).
     업자·작업자·관리실이 서로 연락처를 주고받을 때 카톡에 붙여넣을 문구를 만든다.
     작업자 연락처·차량은 설정의 팀원 명단에서, 업자 담당자는 이 거래처의 고정값에서 가져온다.
     누를 때 그 순간의 인원으로 만든다 (인원을 바꾸고 다시 그릴 필요가 없다) */
  function renderContactSection(box, siteId) {
    box.innerHTML = '<h3 class="sec-title">연락처 보내기 <span class="sec-hint">— 눌러서 복사 → 카톡에 붙여넣기</span></h3>';
    var row = document.createElement('div'); row.className = 'contact-btns';
    var btn = function (label, sub, make) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'contact-btn';
      b.innerHTML = '<b>' + esc(label) + '</b><span>' + esc(sub) + '</span>';
      b.onclick = function () {
        var s = Store.getSite(siteId); if (!s) return;
        make(s);
      };
      row.appendChild(b);
    };
    var people = function () { return state.settings.people || {}; };
    // 연락처가 없는 사람이 있으면 복사는 하되 알려 준다 — 설정에서 채우면 다음부터 들어간다
    var lack = function (missing, what) {
      return missing.length ? ' · ' + missing.join('·') + ' ' + what + ' 없음 (설정 → 팀원)' : '';
    };
    btn('업자에게', '작업자 연락처·차량', function (s) {
      var missing = [];
      var t = Share.buildWorkerContacts(s, people(), Share.todayIso(), missing);
      if (!t) { toast('아직 인원이 없습니다. 날짜별 인원을 먼저 넣어 주세요'); return; }
      copyText(t, '복사됨 — 업자에게 붙여넣기' + lack(missing, '연락처'));
    });
    btn('작업자에게', '업자 담당자 연락처', function (s) {
      var t = Share.buildClientContacts(s, Store.getClient(s.clientId));
      if (!t) { toast('이 거래처에 담당자 연락처가 없습니다. 거래처 고정값에 넣어 주세요'); return; }
      copyText(t, '복사됨 — 작업자에게 붙여넣기');
    });
    btn('관리실·차량등록', '차량번호·오는 날', function (s) {
      var missing = [];
      var t = Share.buildCarList(s, people(), Share.todayIso(), missing);
      if (!t) {
        toast(Share.visitsByPerson(s, Share.todayIso()).length
          ? '차량번호가 등록된 인원이 없습니다 (설정 → 팀원에 차량번호)'
          : '아직 인원이 없습니다. 날짜별 인원을 먼저 넣어 주세요');
        return;
      }
      copyText(t, '복사됨 — 관리실·업자에게 붙여넣기' + lack(missing, '차량'));
    });
    box.appendChild(row);
  }

  /* ---------- AS·추가작업 (2026-09-24) ----------
     끝난 현장에 AS 요청이나 추가작업이 오면 그 현장 안에 쌓는다 (Share.servicesOf 설명 참고).
     현장 화면에는 목록만, 고치는 건 시트에서. 시트는 적는 대로 바로 저장한다 */
  function svcWhen(v) { return Share.isIsoDate(v.date) ? Share.dayLabel(v.date) : '날짜 미정'; }
  function svcSorted(site) {
    // 안 끝난 것 먼저(날짜순, 날짜 없는 건 뒤), 끝난 건 아래로
    return Share.servicesOf(site).slice().sort(function (a, b) {
      if (a.done !== b.done) return a.done ? 1 : -1;
      var da = Share.isIsoDate(a.date) ? a.date : '9999', db = Share.isIsoDate(b.date) ? b.date : '9999';
      if (da !== db) return da < db ? -1 : 1;
      return (a.createdAt || 0) - (b.createdAt || 0);
    });
  }
  /* AS·추가 탭 (2026-10-05): 접수 입력칸이 탭 안에 바로 펼쳐져 있다 (예전엔 '+ 접수' → 새 창).
     입력칸은 일정 화면·목록에서 여는 접수 창과 같은 폼(svcPanel)을 탭 안으로 옮겨 붙인 것이다.
     빈 칸을 보기만 해서는 접수가 생기지 않는다 — 처음 무언가 적는 순간 접수가 만들어진다(svcSave).
     아래에 이미 접수된 목록. 목록을 누르면 예전처럼 접수 창으로 열어 고친다 */
  function renderServiceSection(box, siteId) {
    var s = Store.getSite(siteId); if (!s) return;
    box.innerHTML = '<h3 class="sec-title">🔧 AS·추가작업 접수 <span class="sec-hint">— 끝난 현장에 요청이 오면 여기에</span></h3>';
    var host = document.createElement('div'); host.className = 'svc-inline-host';
    var list = document.createElement('div'); list.className = 'svc-inline-list';
    box.appendChild(host); box.appendChild(list);
    mountInlineService(host, list, siteId);
    renderServiceList(list, siteId);
  }
  function renderServiceList(box, siteId) {
    var s = Store.getSite(siteId); if (!s) return;
    var all = svcSorted(s);
    box.innerHTML = all.length ? '<h3 class="sec-title">접수된 목록 <span class="sec-hint">— 눌러서 고치기</span></h3>' : '';
    all.forEach(function (v) {
      var row = document.createElement('button'); row.type = 'button';
      row.className = 'svc-row' + (v.done ? ' done' : '');
      var who = (v.staff || []).join('·');
      row.innerHTML = '<div class="svc-row-top"><span class="svc-badge' + (v.kind === '추가' ? ' add' : '') + '">' +
        esc(Share.serviceLabel(v)) + '</span><b>' + esc(svcWhen(v)) + '</b>' +
        (who ? '<span class="svc-who">👤 ' + esc(who) + '</span>' : '') +
        (v.done ? '<span class="svc-ok">✓ 완료</span>' : '') + '</div>' +
        '<div class="svc-req">' + esc(v.request || '(요청 내용 없음)') + '</div>' +
        ((v.tools || []).length ? '<div class="svc-tools-line">🧰 ' + esc(v.tools.join('·')) + '</div>' : '');
      // 접수 창을 닫으면 탭 전체(입력칸 + 목록)를 다시 그린다 — 폼이 창에서 탭으로 돌아와야 한다
      row.onclick = function () {
        var sec = box.parentNode;
        openServiceSheet(siteId, v.id, function () { if (sec && sec.isConnected) renderServiceSection(sec, siteId); });
      };
      box.appendChild(row);
    });
  }
  function blankServiceDraft() {
    return { id: '', kind: 'AS', request: '', date: '', staff: [], customer: '', phone: '', bizContact: '', tools: [], done: false };
  }
  function draftHasContent(d) {
    return !!(String(d.request || '').trim() || d.date || (d.staff || []).length || String(d.phone || '').trim() ||
      String(d.customer || '').trim() || (d.tools || []).length || d.done);
  }
  // 접수 폼을 탭 안(host)에 붙인다. 새 빈 접수(아직 저장 안 된 draft)로 시작한다
  function mountInlineService(host, listBox, siteId) {
    var s = Store.getSite(siteId); if (!s) return;
    svcSheet = { siteId: siteId, id: '', draft: blankServiceDraft(), onDone: null, inline: true, listBox: listBox };
    svcPanel.classList.add('inline');
    host.appendChild(svcPanel);
    fillServiceForm(true);
  }
  // 고객 연락처 칸 위: 이 현장 발주처 담당자를 눌러서 채우기 (2026-10-14)
  function renderSvcOwners(site) {
    var wrap = $('svcOwners'); if (!wrap) return;
    wrap.innerHTML = '';
    var list = Share.ownerRows(site && site.owners);
    wrap.hidden = !list.length;
    list.forEach(function (r) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'chip pick';
      b.textContent = '🏢 ' + (r.name || r.phone) + (r.role ? ' (' + r.role + ')' : '');
      b.onclick = function () {
        $('svcCustomer').value = r.name || r.role || '';
        $('svcPhone').value = r.phone || '';
        svcSave({ customer: $('svcCustomer').value, phone: $('svcPhone').value });
        syncSvcCall();
      };
      wrap.appendChild(b);
    });
  }
  // 폼 칸을 지금 접수(svcSheet) 값으로 채운다 — 창으로 열 때와 탭에 붙일 때 같이 쓴다
  function fillServiceForm(isNew) {
    var c = curService(); if (!c) return;
    $('svcTitle').textContent = isNew ? '🔧 AS·추가작업 접수' : '🔧 ' + Share.serviceLabel(c.v);
    $('svcSite').textContent = svcSheet.inline ? '' : Share.titleLine(c.site) + (clientName(c.site) ? ' · ' + clientName(c.site) : '');
    $('svcRequest').value = c.v.request;
    $('svcDate').value = Share.isIsoDate(c.v.date) ? c.v.date : '';
    $('svcCustomer').value = c.v.customer || '';
    $('svcPhone').value = c.v.phone || '';
    syncSvcCall();
    renderSvcOwners(c.site);
    $('svcDone').checked = !!c.v.done;
    $('svcOk').textContent = svcSheet.inline ? '✓ 접수 완료' : '확인';
    svcExtraRow = false;
    renderServiceSheet();
  }

  // ---------- 현장 후기 (2026-09-27) ----------
  // 설정의 질문마다 답 칸 + 태그 칩(최대 5개). 적는 대로 저장한다.
  // 후기는 '팀원에게 공유 복사' 에 안 들어간다 (Share.FIELDS 밖에 있다)
  function renderReviewSection(box, siteId) {
    var s = Store.getSite(siteId); if (!s) return;
    box.innerHTML = '<h3 class="sec-title">📝 현장 후기 <span class="sec-hint">— 다음 현장을 고치려고 남기는 기록</span></h3>';
    var answers = (s.review && s.review.answers) || {};
    Share.reviewQuestionsOf(s, state.settings.reviewQuestions || []).forEach(function (q) {
      var row = document.createElement('div'); row.className = 'rv-q';
      var lb = document.createElement('label'); lb.className = 'field-label'; lb.textContent = q;
      if ((state.settings.reviewQuestions || []).indexOf(q) === -1) lb.textContent += ' (지난 질문)';
      var ta = document.createElement('textarea'); ta.rows = 3; ta.value = answers[q] || '';
      ta.addEventListener('input', function () { Store.setReviewAnswer(siteId, q, ta.value); });
      row.appendChild(lb); row.appendChild(ta);
      box.appendChild(row);
    });
    if (!(state.settings.reviewQuestions || []).length && !Object.keys(answers).length) {
      var e = document.createElement('div'); e.className = 'sec-empty'; e.textContent = '설정 → 후기 질문에서 질문을 추가하세요.';
      box.appendChild(e);
    }
    var tagTitle = document.createElement('div'); tagTitle.className = 'field-label rv-tag-title';
    var mine = (s.review && s.review.tags) || [];
    tagTitle.textContent = '현장 태그 (' + mine.length + '/' + Share.REVIEW_TAG_MAX + ')';
    box.appendChild(tagTitle);
    var chips = document.createElement('div'); chips.className = 'chips rv-tags';
    // 설정 목록 + 설정엔 없어졌지만 이 현장에 달린 태그
    var all = (state.settings.reviewTags || []).slice();
    mine.forEach(function (t) { if (all.indexOf(t) === -1) all.push(t); });
    all.forEach(function (t) {
      var c = document.createElement('button'); c.type = 'button';
      c.className = 'chip pick' + (mine.indexOf(t) !== -1 ? ' on' : '');
      c.textContent = t;
      c.onclick = function () {
        if (!Store.toggleReviewTag(siteId, t)) { toast('태그는 ' + Share.REVIEW_TAG_MAX + '개까지 달 수 있습니다'); return; }
        renderReviewSection(box, siteId);
      };
      chips.appendChild(c);
    });
    var add = document.createElement('button'); add.type = 'button'; add.className = 'chip add'; add.textContent = '+ 태그';
    add.onclick = function () {
      modalPrompt('새 태그', '', '예: 거주중').then(function (v) {
        v = String(v || '').trim(); if (!v) return;
        var list = state.settings.reviewTags || [];
        if (list.indexOf(v) === -1) Store.setSettings({ reviewTags: list.concat([v]) });
        var cur = (Store.getSite(siteId).review || {}).tags || [];
        if (cur.indexOf(v) === -1 && !Store.toggleReviewTag(siteId, v)) toast('태그는 ' + Share.REVIEW_TAG_MAX + '개까지입니다 — 목록에만 추가했습니다');
        renderReviewSection(box, siteId);
      });
    };
    chips.appendChild(add);
    box.appendChild(chips);
  }

  // ---------- 후기 모아보기 (#reviews) ----------
  var rvFilter = { tag: '', question: '' };
  function renderReviews() {
    var body = $('reviewsBody'); body.innerHTML = '';
    var all = Share.collectReviews(state.sites, {});
    // 칩 목록: 설정 + 실제로 쓰인 것 (지운 태그·질문도 걸러 볼 수 있게)
    var tags = (state.settings.reviewTags || []).slice(), qs = (state.settings.reviewQuestions || []).slice();
    all.forEach(function (x) {
      x.tags.forEach(function (t) { if (tags.indexOf(t) === -1) tags.push(t); });
      x.items.forEach(function (it) { if (qs.indexOf(it.q) === -1) qs.push(it.q); });
    });
    if (rvFilter.tag && tags.indexOf(rvFilter.tag) === -1) rvFilter.tag = '';
    if (rvFilter.question && qs.indexOf(rvFilter.question) === -1) rvFilter.question = '';
    var filterRow = function (label, list, key) {
      var wrap = document.createElement('div'); wrap.className = 'rv-filter';
      wrap.innerHTML = '<div class="rv-filter-label">' + label + '</div>';
      var chips = document.createElement('div'); chips.className = 'chips';
      [''].concat(list).forEach(function (v) {
        var c = document.createElement('button'); c.type = 'button';
        c.className = 'chip pick' + (rvFilter[key] === v ? ' on' : '');
        c.textContent = v || '전체';
        c.onclick = function () { rvFilter[key] = v; renderReviews(); };
        chips.appendChild(c);
      });
      wrap.appendChild(chips);
      body.appendChild(wrap);
    };
    filterRow('태그', tags, 'tag');
    filterRow('질문', qs, 'question');

    var list = Share.collectReviews(state.sites, rvFilter);
    var count = document.createElement('div'); count.className = 'rv-count';
    count.textContent = all.length ? '현장 ' + list.length + '곳' : '';
    body.appendChild(count);
    if (!list.length) {
      var e = document.createElement('div'); e.className = 'empty-state';
      e.textContent = all.length ? '조건에 맞는 후기가 없습니다.' : '아직 적은 후기가 없습니다. 현장의 후기 탭에서 적어 주세요.';
      body.appendChild(e);
      return;
    }
    list.forEach(function (x) {
      var s = x.site;
      var card = document.createElement('button'); card.type = 'button'; card.className = 'rv-card';
      var when = x.lastDate ? Share.shortDate(x.lastDate) : '날짜 미정';
      card.innerHTML = '<div class="rv-card-top"><b>' + esc(Share.titleLine(s)) + '</b></div>' +
        '<div class="rv-card-sub">' + esc([clientName(s), when].filter(Boolean).join(' · ')) + '</div>' +
        (x.tags.length ? '<div class="rv-card-tags">' + x.tags.map(function (t) { return '<span>#' + esc(t) + '</span>'; }).join('') + '</div>' : '') +
        x.items.map(function (it) {
          return '<div class="rv-card-q">' + esc(it.q) + '</div><div class="rv-card-a">' + esc(it.a) + '</div>';
        }).join('');
      // 누르면 그 현장의 후기 탭으로
      card.onclick = function () { siteTab = 'review'; siteTabFor = s.id; go('#site/' + s.id); };
      body.appendChild(card);
    });
  }
  $('btnReviews').onclick = function () { go('#reviews'); };
  $('btnReviewsBack').onclick = function () { go(''); };

  var svcSheet = { siteId: '', id: '', onDone: null };
  var svcExtraRow = false; // '+ 한 명 더' 를 눌러 빈 드롭다운이 하나 더 열려 있는가
  // 접수 폼 본체. 평소엔 #svcSheet(창) 안에 있고, AS·추가 탭에선 탭 안으로 옮겨 붙는다 (2026-10-05)
  var svcPanel = document.querySelector('#svcSheet .svc-sheet');
  function curService() {
    var s = Store.getSite(svcSheet.siteId);
    if (!s) return null;
    if (!svcSheet.id && svcSheet.draft) return { site: s, v: svcSheet.draft };   // 탭의 아직 저장 안 된 새 접수
    var v = Share.servicesOf(s).find(function (x) { return x.id === svcSheet.id; });
    return v ? { site: s, v: v } : null;
  }
  // fromSchedule: 일정 화면에서 날짜를 미리 넣어 연 접수 — 날짜만 있고 아무것도 안 적었으면 닫을 때 지운다
  function openServiceSheet(siteId, id, onDone, isNew, fromSchedule) {
    svcSheet = { siteId: siteId, id: id, onDone: onDone || null, fromSchedule: !!fromSchedule };
    if (!curService()) return;
    // 탭에 붙어 있던 폼을 창으로 되돌린다
    svcPanel.classList.remove('inline');
    if (svcPanel.parentNode !== $('svcSheet')) $('svcSheet').appendChild(svcPanel);
    fillServiceForm(isNew);
    $('svcSheet').hidden = false;
    if (isNew) setTimeout(function () { $('svcRequest').focus(); }, 50);
  }
  function renderServiceSheet() {
    var c = curService(); if (!c) return;
    svcPanel.querySelectorAll('.svc-kind').forEach(function (b) {
      b.classList.toggle('on', b.getAttribute('data-kind') === c.v.kind);
    });
    renderServiceStaff(c);
    renderServiceFilms(c);
    renderServiceTools(c);
    renderServiceBiz(c);
  }
  /* AS 필름 (2026-10-27 사장님): 현장 필름 줄에서 이 AS 에 쓸 번호를 칩으로 고르고(시공위치를 같이 보여줌),
     아래 주문처 칩에서 담당자 이름 = 전화(필름명 복사), 💬 = 필름명이 채워진 문자. 고른 게 없으면 현장 필름 전체로 주문 */
  function renderServiceFilms(c) {
    var wrap = $('svcFilms'); if (!wrap) return;
    wrap.innerHTML = '';
    var mine = c.v.films || [];
    var byCode = {}, order = [];
    (c.site.films || []).forEach(function (r) {
      var code = String((r && r.code) || '').trim(); if (!code) return;
      var k = Share.filmKey(code);
      if (!byCode[k]) { byCode[k] = { code: code, places: [] }; order.push(k); }
      if (r.place && byCode[k].places.indexOf(r.place) === -1) byCode[k].places.push(r.place);
    });
    mine.forEach(function (code) { var k = Share.filmKey(code); if (!byCode[k]) { byCode[k] = { code: code, places: [], extra: true }; order.push(k); } });
    var picked = el2('div', 'svc-films-picked' + (mine.length ? '' : ' none'),
      mine.length ? '🎞 이 AS 필름: ' + mine.join(', ') : (order.length ? '쓸 필름을 탭하세요 (안 고르면 현장 필름 전체로 주문)' : '현장에 적힌 필름이 없습니다 — + 로 번호를 넣으세요'));
    wrap.appendChild(picked);
    var chips = el2('div', 'chips chips-pick');
    order.forEach(function (k) {
      var f = byCode[k];
      var on = mine.some(function (m) { return Share.filmKey(m) === k; });
      var chip = document.createElement('button'); chip.type = 'button';
      chip.className = 'chip pick svc-film-chip' + (on ? ' on' : '');
      chip.innerHTML = esc(f.code) + (on ? ' ✓' : '') + (f.places.length ? '<small>' + esc(f.places.slice(0, 3).join('·')) + (f.places.length > 3 ? '…' : '') + '</small>' : '');
      chip.onclick = function () {
        var cur = curService(); if (!cur) return;
        var have = cur.v.films || [];
        svcSave({ films: on ? have.filter(function (x) { return Share.filmKey(x) !== k; }) : have.concat([f.code]) });
        renderServiceSheet();
      };
      chips.appendChild(chip);
    });
    var add = document.createElement('button'); add.type = 'button'; add.className = 'chip add'; add.textContent = '+ 다른 필름';
    add.onclick = function () {
      modalPrompt('AS 에 쓸 필름 번호', '', '예: 예림 HP604').then(function (val) {
        var code = String(val || '').trim(); if (!code) return;
        var cur = curService(); if (!cur) return;
        var have = cur.v.films || [];
        if (have.some(function (x) { return Share.filmKey(x) === Share.filmKey(code); })) return;
        svcSave({ films: have.concat([code]) });
        renderServiceSheet();
      });
    };
    chips.appendChild(add);
    wrap.appendChild(chips);
    // 주문: 고른 필름(없으면 현장 필름 전체)으로 주문처 담당자에게 전화·문자
    var forOrder = mine.length ? mine.map(function (code) { return { place: '', code: code, ready: false }; })
      : (c.site.films || []).filter(function (r) { return r && String(r.code || '').trim(); }).map(function (r) { return { place: r.place, code: r.code, ready: false }; });
    var ob = el2('div', 'svc-film-order');
    renderFilmVendors(ob, forOrder, c.site);
    wrap.appendChild(ob);
  }
  // 필요한 부자재·공구: 설정 목록(+ 이 접수에만 있는 것) 칩, 탭으로 켜고 끈다. '+ 추가' 는 설정 목록에도 넣는다
  function renderServiceTools(c) {
    var wrap = $('svcTools'); wrap.innerHTML = '';
    var mine = c.v.tools || [];
    // 고른 것을 박스 맨 위에 크게 — 칩 사이에서 켜진 것만 찾기 어렵다. 안 골랐으면 경고
    var picked = $('svcToolsPicked');
    picked.classList.toggle('none', !mine.length);
    picked.textContent = mine.length ? '챙길 것 ' + mine.length + '개: ' + mine.join(', ') : '⚠ 아직 안 골랐습니다 — 아래에서 탭하세요';
    var all = (state.settings.serviceTools || []).slice();
    mine.forEach(function (t) { if (all.indexOf(t) === -1) all.push(t); });
    all.forEach(function (t) {
      var on = mine.indexOf(t) !== -1;
      var chip = document.createElement('button'); chip.type = 'button';
      chip.className = 'chip pick' + (on ? ' on' : ''); chip.textContent = t + (on ? ' ✓' : '');
      chip.onclick = function () {
        var cur = curService(); if (!cur) return;
        var have = cur.v.tools || [];
        svcSave({ tools: on ? have.filter(function (x) { return x !== t; }) : have.concat([t]) });
        renderServiceSheet();
      };
      wrap.appendChild(chip);
    });
    var add = document.createElement('button'); add.type = 'button'; add.className = 'chip add'; add.textContent = '+ 추가';
    add.onclick = function () {
      modalPrompt('부자재·공구 추가', '', '예: 실리콘건').then(function (v) {
        v = String(v || '').trim(); if (!v) return;
        var list = state.settings.serviceTools || [];
        if (list.indexOf(v) === -1) Store.setSettings({ serviceTools: list.concat([v]) });
        var cur = curService(); if (!cur) return;
        var have = cur.v.tools || [];
        if (have.indexOf(v) === -1) svcSave({ tools: have.concat([v]) });
        renderServiceSheet();
      });
    };
    wrap.appendChild(add);
  }
  // 담당: 팀원 명단 드롭다운 한 줄씩. 옆에 전화번호·차량번호(설정 → 팀원).
  // 명단에 없는 사람은 설정 → 팀원에 먼저 등록한다 (예전에 적어 둔 명단 밖 이름은 그대로 보인다)
  function renderServiceStaff(c) {
    var wrap = $('svcStaff'); wrap.innerHTML = '';
    var team = (state.settings.team || []).slice();
    var people = state.settings.people || {};
    var staff = c.v.staff.slice();
    if (!team.length && !staff.length) {
      var h = document.createElement('div'); h.className = 'sec-empty';
      h.textContent = '설정 → 팀원에서 먼저 등록하면 여기서 고릅니다.';
      wrap.appendChild(h);
      return;
    }
    var rows = staff.slice();
    if (!rows.length || svcExtraRow) rows.push('');
    var setStaff = function (next) {
      svcExtraRow = false;
      svcSave({ staff: next });
      renderServiceSheet();
    };
    rows.forEach(function (name, i) {
      var row = document.createElement('div'); row.className = 'svc-staff-row';
      var sel = document.createElement('select');
      // 다른 줄에서 이미 고른 사람은 빼고, 이 줄 사람은 명단에 없어도 넣는다
      var opts = team.filter(function (n) { return n === name || staff.indexOf(n) === -1; });
      if (name && opts.indexOf(name) === -1) opts.unshift(name);
      sel.innerHTML = '<option value="">누가 가나 (선택)</option>' +
        opts.map(function (n) { return '<option value="' + esc(n) + '"' + (n === name ? ' selected' : '') + '>' + esc(n) + '</option>'; }).join('');
      sel.onchange = function () {
        var next = staff.slice();
        if (i < staff.length) { if (sel.value) next[i] = sel.value; else next.splice(i, 1); }
        else if (sel.value) next.push(sel.value);
        setStaff(next);
      };
      row.appendChild(sel);
      var info = document.createElement('div'); info.className = 'svc-staff-info';
      if (name) {
        var p = Share.personOf(people, name);
        var tel = p.phone.replace(/[^0-9+]/g, '');
        info.innerHTML = (p.phone
            ? '<a class="svc-staff-tel" href="' + esc(Share.telHref(tel)) + '">📞 ' + esc(p.phone) + '</a>' +
              '<a class="svc-staff-sms" href="' + esc(smsHref(tel)) + '" title="' + esc(name) + ' 에게 문자">💬 문자</a>'
            : '<span class="svc-staff-miss">연락처 없음</span>') +
          (p.car ? '<span>🚗 ' + esc(p.car) + '</span>' : '<span class="svc-staff-miss">차량 없음</span>');
      }
      row.appendChild(info);
      if (rows.length > 1) {
        var x = document.createElement('button'); x.type = 'button'; x.className = 'x'; x.textContent = '×'; x.title = '빼기';
        x.onclick = function () {
          if (i < staff.length) setStaff(staff.filter(function (_, k) { return k !== i; }));
          else { svcExtraRow = false; renderServiceSheet(); }
        };
        row.appendChild(x);
      }
      wrap.appendChild(row);
    });
    var left = team.filter(function (n) { return staff.indexOf(n) === -1; });
    if (staff.length && !svcExtraRow && left.length) {
      var more = document.createElement('button'); more.type = 'button'; more.className = 'btn-sm svc-more';
      more.textContent = '+ 한 명 더';
      more.onclick = function () { svcExtraRow = true; renderServiceSheet(); };
      wrap.appendChild(more);
    }
  }
  // 업자 담당자: 작업자에게 갈 업자 연락처. 1명이면 그 사람(자동), 2명 이상이면 여기서 1명 고른다
  function renderServiceBiz(c) {
    var client = Store.getClient(c.site.clientId);
    var cs = Share.clientContactsOf(client);
    var wrap = $('svcBiz'); wrap.innerHTML = '';
    $('svcBizWrap').hidden = !cs.length;
    var picked = Share.serviceBizContact(client, c.v);
    cs.forEach(function (ct) {
      var key = Share.contactKey(ct);
      var on = !!picked && Share.contactKey(picked) === key;
      var chip = document.createElement('button'); chip.type = 'button';
      chip.className = 'chip pick' + (on ? ' on' : '');
      chip.textContent = [ct.name, ct.phone].filter(Boolean).join(' ') + (on ? ' ✓' : '');
      if (cs.length === 1) { chip.disabled = true; chip.title = '업자 담당자가 한 명이라 자동으로 이 사람이 갑니다'; }
      else chip.onclick = function () {
        svcSave({ bizContact: on ? '' : key });
        renderServiceSheet();
      };
      wrap.appendChild(chip);
    });
  }
  function closeServiceSheet() {
    if ($('svcSheet').hidden) return;
    $('svcSheet').hidden = true;
    // 접수만 누르고 아무것도 안 적었으면 빈 줄을 남기지 않는다
    var c = curService();
    if (c && svcSheet.id && !c.v.request.trim() && (!c.v.date || svcSheet.fromSchedule) && !c.v.staff.length && !c.v.phone.trim() && !c.v.customer.trim() && !(c.v.tools || []).length && !c.v.done) Store.removeService(svcSheet.siteId, svcSheet.id);
    var cb = svcSheet.onDone; svcSheet.onDone = null;
    if (cb) cb();
  }
  /* 칸을 고칠 때마다 바로 저장. 탭의 새 접수(draft)는 처음 내용이 들어오는 순간 접수로 만든다 —
     빈 칸을 보기만 하거나 종류(AS/추가)만 눌러서는 접수가 생기지 않는다 */
  var svcSave = function (patch) {
    if (svcSheet.id) { Store.updateService(svcSheet.siteId, svcSheet.id, patch); return; }
    if (!svcSheet.draft) return;
    Object.assign(svcSheet.draft, patch);
    if (!draftHasContent(svcSheet.draft)) return;
    var d = svcSheet.draft;
    var v = Store.addService(svcSheet.siteId, { kind: d.kind, request: d.request, date: d.date, staff: d.staff,
      customer: d.customer, phone: d.phone, bizContact: d.bizContact, tools: d.tools, done: d.done });
    if (!v) return;
    svcSheet.id = v.id; svcSheet.draft = null;
    if (svcSheet.listBox && svcSheet.listBox.isConnected) renderServiceList(svcSheet.listBox, svcSheet.siteId);
  };
  // 탭 안 폼: 지금 접수를 마치고 새 빈 접수로 (목록 다시 그림)
  function resetInlineService(msg) {
    var host = svcPanel.parentNode, list = svcSheet.listBox, siteId = svcSheet.siteId;
    if (msg) toast(msg);
    if (host && list) { mountInlineService(host, list, siteId); renderServiceList(list, siteId); }
  }
  document.querySelectorAll('#svcSheet .svc-kind').forEach(function (b) {
    b.onclick = function () { svcSave({ kind: b.getAttribute('data-kind') }); renderServiceSheet(); };
  });
  $('svcRequest').addEventListener('input', function () { svcSave({ request: $('svcRequest').value }); });
  $('svcDate').addEventListener('change', function () { svcSave({ date: $('svcDate').value }); });
  $('svcDateClear').onclick = function () { $('svcDate').value = ''; svcSave({ date: '' }); };
  // 고객 연락처 → 📞 전화 버튼 (번호가 없으면 흐리게, 눌러도 아무 일 없음)
  function syncSvcCall() {
    var t = $('svcPhone').value.replace(/[^0-9+]/g, '');
    $('svcCall').href = t ? Share.telHref(t) : '#';
    $('svcCall').classList.toggle('disabled', !t);
    $('svcSms').href = t ? smsHref(t) : '#';
    $('svcSms').classList.toggle('disabled', !t);
  }
  $('svcPhone').addEventListener('input', function () { svcSave({ phone: $('svcPhone').value }); syncSvcCall(); });
  $('svcCustomer').addEventListener('input', function () { svcSave({ customer: $('svcCustomer').value }); });
  $('svcDone').addEventListener('change', function () { svcSave({ done: $('svcDone').checked }); });
  $('svcCopyWorker').onclick = function () {
    var c = curService(); if (!c) return;
    var client = Store.getClient(c.site.clientId);
    // 업자 담당자가 여럿인데 안 골랐으면 막는다 - 엉뚱한 사람 번호가 가면 안 된다
    if (Share.serviceBizContact(client, c.v) === null) { toast('업자 담당자를 골라 주세요'); return; }
    copyText(Share.buildServiceOrder(c.site, c.v, client), '복사됨 — 작업자에게 붙여넣기');
  };
  $('svcCopyClient').onclick = function () {
    var c = curService(); if (!c) return;
    var missing = [];
    var t = Share.buildServiceVisit(c.site, c.v, state.settings.people || {}, missing);
    if (!t) { toast('담당을 먼저 골라 주세요'); return; }
    copyText(t, '복사됨 — 업자에게 붙여넣기' + (missing.length ? ' · ' + missing.join('·') + ' 연락처 없음 (설정 → 팀원)' : ''));
  };
  $('svcCopyCar').onclick = function () {
    var c = curService(); if (!c) return;
    var missing = [];
    var t = Share.buildServiceCars(c.site, c.v, state.settings.people || {}, missing);
    if (!t) { toast(c.v.staff.length ? '차량번호가 등록된 담당이 없습니다 (설정 → 팀원)' : '담당을 먼저 골라 주세요'); return; }
    copyText(t, '복사됨 — 관리실·업자에게 붙여넣기' + (missing.length ? ' · ' + missing.join('·') + ' 차량 없음' : ''));
  };
  $('svcDelete').onclick = function () {
    var c = curService(); if (!c) return;
    // 탭의 아직 저장 안 된 새 접수는 칸만 비운다
    if (svcSheet.inline && !svcSheet.id) { resetInlineService('비웠습니다'); return; }
    modalConfirm('삭제', Share.serviceLabel(c.v) + ' "' + (c.v.request || svcWhen(c.v)) + '" 을(를) 지웁니다.', '삭제', true).then(function (ok) {
      if (!ok) return;
      Store.removeService(svcSheet.siteId, svcSheet.id);
      if (svcSheet.inline) { resetInlineService('삭제됨'); return; }
      closeServiceSheet();
      toast('삭제됨');
    });
  };
  // 확인: 창이면 닫기. 탭 안 폼이면 '접수 완료' — 이미 저장돼 있으니 새 빈 접수로 넘어간다
  $('svcOk').onclick = function () {
    if (!svcSheet.inline) { closeServiceSheet(); return; }
    if (!svcSheet.id) { toast('요청 내용부터 적어 주세요'); $('svcRequest').focus(); return; }
    resetInlineService('접수했습니다 — 아래 목록에 있습니다');
  };
  $('svcClose').onclick = closeServiceSheet;
  $('svcSheet').addEventListener('click', function (e) { if (e.target === $('svcSheet')) closeServiceSheet(); });

  // 현장 상세: 부자재 체크리스트
  function renderSuppliesSection(box, siteId) {
    var s = Store.getSite(siteId); if (!s) return;
    box.innerHTML = '<h3 class="sec-title">부자재 <span class="sec-hint">— 현장에 내려놓으면 체크 (상비품은 설정 › 내 차 재고)</span></h3>';
    var rerender = function () { renderSuppliesSection(box, siteId); };
    if (!s.supplies.length) {
      var empty = document.createElement('div'); empty.className = 'sec-empty'; empty.textContent = '항목이 없습니다. 설정 › 내 차 재고에 넣어두면 새 현장에 자동으로 깔립니다.';
      box.appendChild(empty);
    }
    s.supplies.forEach(function (r, i) {
      var row = document.createElement('div'); row.className = 'sec-row';
      var name = document.createElement('div'); name.className = 'sec-name'; name.textContent = r.name;
      var auto = Share.siliconeOf(s).who === 'me' && Share.siliconeOf(s).colors.some(function (c) { return Share.siliconeName(c) === r.name; });
      row.appendChild(checkBtn(r.ready, function () {
        var u = Store.toggleSupply(siteId, i);
        var sil = box.nextElementSibling;   // 실리콘 줄을 체크하면 실리콘 칸의 빨간 줄도 다시 그린다
        if (auto && sil && sil.id === 'silSec') renderSiliconeSection(sil, siteId);
        return u && u.supplies[i] && u.supplies[i].ready;
      }));
      row.appendChild(name);
      if (auto) {   // 실리콘 칸에서 만든 줄 — 지우려면 실리콘 칸에서 색을 끈다
        name.textContent = '🧴 ' + r.name; row.classList.add('sil-row');
        var tag = document.createElement('span'); tag.className = 'sil-tag'; tag.textContent = '실리콘 칸'; row.appendChild(tag);
      } else {
        var x = document.createElement('button'); x.type = 'button'; x.className = 'x'; x.textContent = '×'; x.title = '삭제';
        x.onclick = function () { Store.removeSupply(siteId, i); rerender(); };
        row.appendChild(x);
      }
      box.appendChild(row);
    });
    // 설정의 기본 항목 중 이 현장에 없는 것 — 탭 한 번으로 넣는다.
    // 기본 항목은 현장을 만들 때만 깔리므로, 나중에 설정에 추가한 항목은 여기서 골라 넣는다
    var have = s.supplies.map(function (r) { return r.name; });
    var more = (state.settings.supplyDefaults || []).filter(function (n) { return n && have.indexOf(n) === -1; });
    if (more.length) {
      var picks = document.createElement('div'); picks.className = 'supply-picks';
      more.forEach(function (n) {
        var c = document.createElement('button'); c.type = 'button'; c.className = 'supply-pick'; c.textContent = '＋ ' + n;
        c.onclick = function () { Store.addSupply(siteId, n); rerender(); };
        picks.appendChild(c);
      });
      box.appendChild(picks);
    }
    var add = document.createElement('button'); add.type = 'button'; add.className = 'sec-add';
    add.textContent = more.length ? '＋ 직접 입력' : '＋ 항목 추가';
    add.onclick = function () {
      modalPrompt('부자재 항목', '', '예: 칼날, 스퀴지').then(function (v) {
        if (v == null) return;
        Store.addSupply(siteId, v); rerender();
      });
    };
    box.appendChild(add);
  }
  // 현장 상세: 실리콘 — 없음 / 내가 쏨 / 다른 사람. 내가 쏠 때만 색(여러 개)을 고르고 부자재로 넘어간다
  function siliconeLateText(s) {
    var dd = Share.dayDiff(Share.todayIso(), s.date);
    return '⚠ 실리콘 준비! ' + (dd > 0 ? '시공 ' + dd + '일 전' : dd === 0 ? '오늘 시공' : '시공 시작했는데') +
      ' — ' + Share.siliconeLeft(s).join('·') + ' 아직 안 챙김';
  }
  /* ---------- ➕ 추가작업 → 인원·필름 (2026-10-26 사장님) ----------
     기사앱 사장님 보기에서 적은 재시공·AS·추가요청을 받아 와서, 늘어난 시간만큼 필요 인원을 늘리고
     필름 줄을 더한다. 계산은 Share.extraPlan. 현장업무(관리자앱)에 연결된 현장만 — 기사앱 조회는 열쇠 없이 된다 */
  var EXTRA_URL = 'https://primary-production-a6fa.up.railway.app/webhook/film-quality-get-v2?code=';
  var extraCache = {};   // adminId → { at, tasks, items } | { at, err }
  function extraData(adminId, cb) {
    var c = extraCache[adminId];
    if (c && Date.now() - c.at < 60000) return c;
    if (c && c.loading) return null;
    extraCache[adminId] = { at: 0, loading: true };
    fetch(EXTRA_URL + encodeURIComponent(adminId) + '&_t=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (j) { var d = Array.isArray(j) ? j[0] : j; extraCache[adminId] = { at: Date.now(), tasks: (d && d.tasks) || [], items: (d && d.items) || {} }; cb(); })
      .catch(function (e) { extraCache[adminId] = { at: Date.now(), err: e.message || '불러오기 실패' }; cb(); });
    return null;
  }
  function renderExtraSection(box, siteId) {
    var s = Store.getSite(siteId); if (!s) return;
    var film = box.id === 'extraFilmSec';
    box.innerHTML = '';
    box.hidden = true;
    var adminId = String(s.adminId || '').trim();
    if (!adminId) return;
    var rerender = function () { ['extraSec', 'extraFilmSec'].forEach(function (id) { var b = $(id); if (b) renderExtraSection(b, siteId); }); };
    var d = extraData(adminId, rerender);
    if (!d || d.err) return;
    var plan = Share.extraPlan(d.tasks, d.items, s);
    if (!plan.rows.length) return;
    box.hidden = false;
    box.classList.add('extra-sec');
    var hrs = Math.floor(plan.minutes / 60), mins = plan.minutes % 60;
    var 시간 = (hrs ? hrs + '시간 ' : '') + (mins ? mins + '분' : '') || '0분';
    box.appendChild(el2('h3', 'sec-title', '➕ 추가작업 ' + plan.rows.length + '건 — 기사앱 사장님 보기에서 적은 일'));
    var list = el2('div', 'ex-list');
    var 표 = { 재시공: '🔁 재시공', AS: '🛠 AS', 추가요청: '➕ 추가' };
    plan.rows.forEach(function (r) {
      var row = el2('div', 'ex-r' + (r.done ? ' done' : ''));
      var nm = el2('div', 'ex-nm');
      var tag = el2('span', 'ex-t ex-' + (r.kind === 'AS' ? 'as' : r.kind === '재시공' ? 're' : 'add'), 표[r.kind] || r.kind);
      nm.appendChild(tag); nm.appendChild(document.createTextNode(' ' + r.name));
      var sub = el2('small', '', [r.who, r.done ? '✅ 끝남' : '약 ' + (r.minutes >= 60 ? Math.round(r.minutes / 6) / 10 + '시간' : r.minutes + '분'),
        r.filmM ? '필름 ' + r.filmM + 'm' + (r.filmCode ? ' ' + r.filmCode : '') : ''].filter(Boolean).join(' · '));
      nm.appendChild(sub);
      row.appendChild(nm);
      list.appendChild(row);
    });
    box.appendChild(list);
    if (!film) {
      var need = Share.needStaffOf(s);
      var st = el2('div', 'ex-plan');
      st.appendChild(el2('b', '', '👷 남은 추가작업 약 ' + 시간 + ' ≈ ' + plan.pum + '품'));
      st.appendChild(el2('span', '', plan.addStaff ? '필요 인원 ' + (need || 0) + '명 → ' + ((need || 0) + plan.addStaff) + '명으로 늘리면 위 날짜별 인원에서 모자란 만큼 보여요'
        : '이미 필요 인원에 넣었어요'));
      if (plan.addStaff) {
        var b = el2('button', 'btn-sm primary', '필요 인원 +' + plan.addStaff + '명 넣기'); b.type = 'button';
        b.onclick = function () {
          var cur = Store.getSite(siteId);
          var doneMap = Object.assign({}, cur.extraDone || {});
          plan.rows.forEach(function (r) { if (!r.done) doneMap[r.id] = Object.assign({}, doneMap[r.id], { staff: 1 }); });
          Store.updateSite(siteId, { extraDone: doneMap });
          Store.setNeedStaff(siteId, (Share.needStaffOf(cur) || 0) + plan.addStaff);
          toast('필요 인원 +' + plan.addStaff + '명 — 날짜를 더하거나 그날 사람을 넣으세요');
          var ds = $('daysSec'); if (ds) renderDaysSection(ds, siteId);
          rerender(); paintSiteStatus();
        };
        st.appendChild(b);
      }
      box.appendChild(st);
    }
    var fp = el2('div', 'ex-plan film');
    fp.appendChild(el2('b', '', '🎞 추가작업 필름 ' + (plan.films.length ? plan.films.map(function (f) { return f.code + ' +' + f.m + 'm'; }).join(', ') : '없음')));
    var noCode = plan.rows.filter(function (r) { return r.filmM > 0 && !r.filmCode; }).length;
    fp.appendChild(el2('span', '', plan.newFilmRows.length ? '필름 줄에 넣어 두면 이 현장 필름 목록에 추가분(m)이 남아요 — 주문할 때 수량에 더하세요'
      : noCode ? '필름 번호를 먼저 적어 주세요 (시공위치가 같은 줄의 번호를 씁니다)' : '이미 필름 줄에 넣었어요'));
    if (plan.newFilmRows.length) {
      var fb = el2('button', 'btn-sm primary', '필름 줄에 ' + plan.newFilmRows.length + '개 넣기'); fb.type = 'button';
      fb.onclick = function () {
        var cur = Store.getSite(siteId);
        var doneMap = Object.assign({}, cur.extraDone || {});
        var rows = (cur.films || []).slice();
        plan.newFilmRows.forEach(function (r) { rows.push(Share.extraFilmRow(r)); doneMap[r.id] = Object.assign({}, doneMap[r.id], { film: 1 }); });
        Store.updateSite(siteId, { films: rows, extraDone: doneMap });
        toast('🎞 필름 줄 ' + plan.newFilmRows.length + '개 추가 — 시공위치에 추가분 m 이 적혀 있어요');
        renderSite();
      };
      fp.appendChild(fb);
    }
    box.appendChild(fp);
  }

  /* ---------- 💰 정산 내역 (2026-10-26 사장님) ----------
     일이 띄엄띄엄 여러 날이면 중간중간 정산견적을 발행한다. 발행한 견적서(정산견적 표)를 날짜순으로 모아
     날짜·금액·내역을 보여주고, 입금은 여기서 체크한다. 같은 견적을 고쳐 다시 낸 것은 Share.settleRounds 가 합계에서 뺀다.
     사장님 열쇠가 있는 기기에서만 (금액이 나가는 조회라 n8n 이 열쇠를 본다) */
  var SETTLE_HISTORY_URL = 'https://primary-production-a6fa.up.railway.app/webhook/settle-history?site=';
  var settleCache = {};
  function won(n) { return Math.round(Number(n) || 0).toLocaleString('ko-KR') + '원'; }
  function settleLine(r) {
    var parts = [];
    if (r.품수) parts.push('인건비 ' + r.품수 + '품');
    if (r.자재비) parts.push('자재 ' + won(r.자재비));
    if (r.추가작업 && r.추가작업.length) parts.push('추가작업 ' + r.추가작업.length + '건');
    (r.부가내역 || []).forEach(function (e) { parts.push(e.항목명 + (e.비고 ? ' ' + e.비고 : '')); });
    if (r.미수금) parts.push('미수금 ' + won(r.미수금));
    return parts.join(' · ');
  }
  function settleMemoText(sum) {
    var L = ['[정산 내역] ' + sum.회차 + '회 · 합계 ' + won(sum.합계) + ' · 받은 ' + won(sum.받은) + ' · 남은 ' + won(sum.남은)];
    sum.rows.filter(function (r) { return r.포함; }).forEach(function (r) {
      var 입 = r.입금액 >= r.정산금액 && r.정산금액 > 0 ? ' (입금' + (r.입금일 ? ' ' + Share.shortDate(r.입금일) : '') + ')'
        : r.입금액 ? ' (일부 입금 ' + won(r.입금액) + ')' : ' (미입금)';
      L.push(r.회 + '회 ' + Share.dayLabel(r.날짜) + ' ' + won(r.정산금액) + 입);
      if (r.수동) L.push('   ' + (r.내용 || '견적서 없이 정산'));
      else {
        if (r.조정) L.push('   견적서 ' + won(r.견적금액) + ' → ' + won(r.정산금액) + (r.사유 ? ' (' + r.사유 + ')' : ''));
        var d = settleLine(r); if (d) L.push('   ' + d);
        if (r.추가작업 && r.추가작업.length) L.push('   추가: ' + r.추가작업.map(function (a) { return a.품목명 + (a.청구 === '무상' ? ' 무상' : ''); }).join(', '));
      }
    });
    return L.join('\n');
  }
  // 한 회차 고치기 — 정산 금액(조정)·사유·입금액·입금일·합계 넣기. 견적서 없이 더한 정산은 날짜·내용도, 지우기도
  function openSettleEdit(siteId, r, onDone) {
    var 새것 = !r;
    r = r || { 수동: true, key: 'm' + Date.now().toString(36), 날짜: Share.todayIso(), 내용: '', 정산금액: '', 견적금액: 0, 사유: '', 입금액: 0, 입금일: '', 포함: true };
    // 금액 칸은 적는 대로 천 단위 쉼표 (660000 → 660,000). 저장할 때 숫자만 뽑는다
    var v = function (x) { return x === 0 || x ? Math.round(Number(x) || 0).toLocaleString('ko-KR') : ''; };
    var html = '<div class="st-form">' +
      (r.수동 ? '<label>날짜<input type="date" id="stDate" value="' + esc(r.날짜) + '"></label>' +
        '<label>내용<input type="text" id="stWhat" value="' + esc(r.내용 || '') + '" placeholder="예: 현관 손잡이 추가, 2차 중간 정산"></label>'
        : '<p class="st-q">견적서 금액 <b>' + won(r.견적금액) + '</b> · ' + esc(Share.dayLabel(r.날짜)) + ' 발행</p>') +
      '<label>정산 금액 <small>실제로 받기로 한 돈</small><input type="text" inputmode="numeric" class="st-won" id="stAmt" value="' + esc(v(r.정산금액)) + '" placeholder="0"></label>' +
      (r.수동 ? '' : '<label>조정 사유 <small>금액이 다를 때</small><input type="text" id="stWhy" value="' + esc(r.사유 || '') + '" placeholder="예: 네고 10만원, 부자재비 빼기"></label>') +
      '<label>입금액 <small>일부만 받았으면 받은 만큼</small><input type="text" inputmode="numeric" class="st-won" id="stPaid" value="' + esc(r.입금액 ? v(r.입금액) : '') + '" placeholder="0 = 아직"></label>' +
      '<label>입금일<input type="date" id="stPaidAt" value="' + esc(r.입금일 || '') + '"></label>' +
      '<label class="st-ck"><input type="checkbox" id="stIn"' + (r.포함 ? ' checked' : '') + '> 합계에 넣기 <small>' +
        (r.자동대체 ? '나중 견적서에 같은 품목이 다 있어서 고친 전 판으로 봤어요 — 따로 받은 돈이면 켜세요' : '빼면 기록만 남아요') + '</small></label></div>';
    var btns = [{ label: '취소', onClick: closeModal }];
    if (r.수동 && !새것) btns.push({ label: '지우기', cls: 'danger', onClick: function () {
      var cur = Store.getSite(siteId);
      Store.updateSite(siteId, { settleManual: (cur.settleManual || []).filter(function (m) { return m.id !== r.key; }) });
      closeModal(); onDone();
    } });
    btns.push({ label: '저장', cls: 'primary', onClick: function () {
      var cur = Store.getSite(siteId);
      var amt = $('stAmt').value.replace(/[^0-9]/g, ''), paid = $('stPaid').value.replace(/[^0-9]/g, '');
      var paidAt = $('stPaidAt').value || (paid && Number(paid) > 0 ? Share.todayIso() : '');
      var 포함 = $('stIn').checked;
      if (r.수동) {
        var what = $('stWhat').value.trim();
        if (!what && !amt) { toast('내용이나 금액을 적어 주세요'); return; }
        var row = { id: r.key, 날짜: $('stDate').value || Share.todayIso(), 내용: what, 금액: amt ? Number(amt) : 0, 입금액: paid ? Number(paid) : 0, 입금일: paid && Number(paid) > 0 ? paidAt : '', 포함: 포함 };
        var list = (cur.settleManual || []).filter(function (m) { return m.id !== r.key; }).concat([row]);
        Store.updateSite(siteId, { settleManual: list });
      } else {
        var log = Object.assign({}, cur.settleLog || {});
        var e = {};
        if (amt !== '' && Number(amt) !== r.견적금액) e.금액 = Number(amt);
        var why = $('stWhy').value.trim(); if (why) e.사유 = why;
        if (paid && Number(paid) > 0) { e.입금액 = Number(paid); e.입금일 = paidAt; }
        if (포함 !== !r.자동대체) e.포함 = 포함;
        log[r.key] = e;
        Store.updateSite(siteId, { settleLog: log });
      }
      closeModal(); onDone();
    } });
    openModal(새것 ? '＋ 정산 직접 추가' : (r.수동 ? '정산 고치기' : '정산·입금 고치기'), html, btns);
    document.querySelectorAll('#modalBody .st-won').forEach(function (inp) {
      inp.addEventListener('input', function () {
        var digits = inp.value.replace(/[^0-9]/g, '').replace(/^0+(?=\d)/, '');
        var fromEnd = inp.value.length - (inp.selectionStart || 0);   // 커서를 끝에서 같은 자리에 둔다
        inp.value = digits ? Number(digits).toLocaleString('ko-KR') : '';
        var pos = Math.max(0, inp.value.length - fromEnd);
        try { inp.setSelectionRange(pos, pos); } catch (e) { /* 일부 브라우저 */ }
      });
    });
  }
  function renderSettleSection(box, siteId) {
    var s = Store.getSite(siteId); if (!s) return;
    var adminId = String(s.adminId || '').trim();
    box.innerHTML = ''; box.hidden = false;
    box.classList.add('settle-sec');
    box.appendChild(el2('h3', 'sec-title', '💰 정산 내역 — 회차마다 날짜·금액·입금'));
    var rerender = function () { var b = $('settleSec'); if (b) renderSettleSection(b, siteId); };
    var c = { list: [] };
    if (adminId) {
      c = settleCache[adminId];
      if (!c || (!c.loading && Date.now() - c.at > 60000)) {
        settleCache[adminId] = { loading: true, at: Date.now() };
        fetch(SETTLE_HISTORY_URL + encodeURIComponent(adminId))
          .then(function (res) {
            if (res.status === 401 || res.status === 403) throw new Error('이 기기에 사장님 열쇠가 없어 발행한 정산견적을 못 불러옵니다');
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return res.json();
          })
          .then(function (d) { settleCache[adminId] = { at: Date.now(), list: (d && d.정산) || [] }; })
          .catch(function (e) { settleCache[adminId] = { at: Date.now(), err: e.message || String(e), list: [] }; })
          .then(rerender);
        c = settleCache[adminId];
      }
      if (c.loading) { box.appendChild(el2('div', 'sec-empty', '불러오는 중…')); return; }
      if (c.err) box.appendChild(el2('div', 'sec-empty', c.err));
    }
    var sum = Share.settleRounds(c.list || [], s.settleLog, s.settleManual);
    if (!sum.rows.length) {
      box.appendChild(el2('div', 'sec-empty', adminId ? '아직 발행한 정산견적이 없습니다. 정산견적을 발행하면 여기 쌓이고, 견적서 없이 받은 돈은 아래 ＋ 로 적으세요.'
        : '현장업무에 연결하면 발행한 정산견적이 여기 쌓여요. 견적서 없이 받은 돈은 아래 ＋ 로 적으세요.'));
    } else {
      var top = el2('div', 'st-sum');
      top.appendChild(el2('b', '', sum.회차 + '회 정산 · 합계 ' + won(sum.합계)));
      top.appendChild(el2('span', sum.남은 > 0 ? 'due' : 'ok', sum.남은 > 0 ? '받은 ' + won(sum.받은) + ' · 남은 ' + won(sum.남은) : sum.남은 < 0 ? '받은 ' + won(sum.받은) + ' · ' + won(-sum.남은) + ' 더 받음' : '✓ 다 받았어요'));
      box.appendChild(top);
    }
    sum.rows.forEach(function (r) {
      var 다받음 = r.정산금액 > 0 && r.입금액 >= r.정산금액;
      var row = el2('div', 'st-r' + (r.포함 ? '' : ' old') + (다받음 ? ' paid' : ''));
      var head = el2('div', 'st-h');
      head.appendChild(el2('span', 'st-no', r.포함 ? r.회 + '회' : (r.자동대체 ? '고친 전' : '뺌')));
      head.appendChild(el2('span', 'st-d', Share.dayLabel(r.날짜)));
      head.appendChild(el2('b', 'st-amt', won(r.정산금액)));
      row.appendChild(head);
      if (r.수동) row.appendChild(el2('small', 'st-man', '✍️ ' + (r.내용 || '견적서 없이 정산')));
      else {
        if (r.조정) row.appendChild(el2('small', 'st-adj', '견적서 ' + won(r.견적금액) + ' → 정산 ' + won(r.정산금액) + (r.사유 ? ' · ' + r.사유 : '')));
        if (!r.포함 && r.자동대체) {
          var rep = sum.rows.find(function (x) { return x.key === r.자동대체; });
          row.appendChild(el2('small', '', (rep ? Share.dayLabel(rep.날짜) + ' ' : '') + '견적서에 같은 품목이 다 있어 고친 전 판으로 봤어요 (✏️ 에서 합계에 넣기)'));
        } else {
          var d = settleLine(r); if (d) row.appendChild(el2('small', '', d));
          if (r.추가작업 && r.추가작업.length) row.appendChild(el2('small', 'st-add', '➕ ' + r.추가작업.map(function (a) { return a.품목명 + (a.청구 === '무상' ? ' (무상)' : a.청구 === '업체청구' ? ' (업체 청구)' : ''); }).join(', ')));
        }
      }
      if (r.포함) row.appendChild(el2('small', 'st-pay' + (다받음 ? ' ok' : r.입금액 ? ' part' : ''),
        다받음 ? '💰 입금 ' + won(r.입금액) + (r.입금일 ? ' · ' + Share.shortDate(r.입금일) : '') + ' ✓'
          : r.입금액 ? '💰 일부 입금 ' + won(r.입금액) + (r.입금일 ? ' · ' + Share.shortDate(r.입금일) : '') + ' · 남은 ' + won(r.정산금액 - r.입금액) : '미입금'));
      var bt = el2('div', 'st-bt');
      if (!r.수동) { var a = el2('a', 'btn-sm', '📄 견적서'); a.href = 'https://songil.netlify.app/s/' + encodeURIComponent(r.코드); a.target = '_blank'; a.rel = 'noopener'; bt.appendChild(a); }
      var ed = el2('button', 'btn-sm', '✏️ 금액·입금'); ed.type = 'button';
      ed.onclick = function () { openSettleEdit(siteId, r, rerender); };
      bt.appendChild(ed);
      if (r.포함 && !다받음) {
        var pay = el2('button', 'btn-sm', '💰 남은 돈 입금'); pay.type = 'button';
        pay.onclick = function () {
          var cur = Store.getSite(siteId);
          if (r.수동) {
            Store.updateSite(siteId, { settleManual: (cur.settleManual || []).map(function (m) { return m.id === r.key ? Object.assign({}, m, { 입금액: r.정산금액, 입금일: Share.todayIso() }) : m; }) });
          } else {
            var log = Object.assign({}, cur.settleLog || {});
            log[r.key] = Object.assign({}, log[r.key], { 입금액: r.정산금액, 입금일: Share.todayIso() });
            Store.updateSite(siteId, { settleLog: log });
          }
          toast('💰 ' + won(r.정산금액 - (r.입금액 || 0)) + ' 입금으로 적었어요');
          rerender();
        };
        bt.appendChild(pay);
      }
      row.appendChild(bt);
      box.appendChild(row);
    });
    var foot = el2('div', 'st-foot');
    var add = el2('button', 'btn-sm', '＋ 정산 직접 추가'); add.type = 'button';
    add.title = '견적서 없이 받기로 한 돈 — 말로 정한 추가분, 중간 정산 등';
    add.onclick = function () { openSettleEdit(siteId, null, rerender); };
    foot.appendChild(add);
    if (sum.rows.length) {
      var cp = el2('button', 'btn-sm st-memo', '📝 메모에 붙이기'); cp.type = 'button';
      cp.onclick = function () {
        var cur = Store.getSite(siteId);
        var text = settleMemoText(Share.settleRounds(c.list || [], cur.settleLog, cur.settleManual));
        var memo = String(cur.memo || '');
        // 예전에 붙인 정산 내역 덩어리는 새 것으로 바꾼다 (계속 쌓이지 않게)
        memo = memo.replace(/\[정산 내역\][\s\S]*?(?=\n\n|$)/, '').replace(/^\n+/, '');
        Store.updateSite(siteId, { memo: text + (memo ? '\n\n' + memo : '') });
        toast('📝 메모 맨 위에 정산 내역을 붙였어요');
        renderSite(); pickSiteTab('review', false);
      };
      foot.appendChild(cp);
    }
    box.appendChild(foot);
  }

  function renderSiliconeSection(box, siteId) {
    var s = Store.getSite(siteId); if (!s) return;
    var sc = Share.siliconeOf(s);
    var rerender = function () { renderSiliconeSection(box, siteId); var sup = box.previousElementSibling; if (sup) renderSuppliesSection(sup, siteId); paintSiteStatus(); };
    box.className = 'sec sil-sec' + (sc.who === 'me' ? ' me' : sc.who === 'other' ? ' other' : '');
    box.innerHTML = '<h3 class="sec-title">🧴 실리콘 <span class="sec-hint">— 내가 쏘면 2일 전부터 준비 알림</span></h3>';
    var who = document.createElement('div'); who.className = 'sil-who';
    [['', '없음'], ['me', '🙋 내가 쏨'], ['other', '👷 다른 사람']].forEach(function (o) {
      var b = document.createElement('button'); b.type = 'button'; b.textContent = o[1];
      b.className = 'sil-opt' + (sc.who === o[0] ? ' on' : '');
      b.onclick = function () { Store.setSilicone(siteId, o[0], sc.colors); rerender(); };
      who.appendChild(b);
    });
    box.appendChild(who);
    if (sc.who === 'other') {
      var off = document.createElement('div'); off.className = 'sil-off'; off.textContent = '내 일 아님 — 부자재·할 일 없음';
      box.appendChild(off);
      return;
    }
    if (sc.who !== 'me') return;
    var lab = document.createElement('div'); lab.className = 'sil-lab'; lab.textContent = '색상 (여러 개 고를 수 있음)';
    box.appendChild(lab);
    var cs = document.createElement('div'); cs.className = 'sil-colors';
    var all = Share.SILICONE_COLORS.concat(sc.colors.filter(function (c) { return Share.SILICONE_COLORS.indexOf(c) === -1; }));
    all.forEach(function (c) {
      var on = sc.colors.indexOf(c) !== -1;
      var b = document.createElement('button'); b.type = 'button'; b.className = 'sil-color' + (on ? ' on' : '');
      b.textContent = (on ? '✓ ' : '') + c;
      b.onclick = function () {
        Store.setSilicone(siteId, 'me', on ? sc.colors.filter(function (x) { return x !== c; }) : sc.colors.concat([c]));
        rerender();
      };
      cs.appendChild(b);
    });
    var add = document.createElement('button'); add.type = 'button'; add.className = 'sil-color add'; add.textContent = '＋ 직접';
    add.onclick = function () {
      modalPrompt('실리콘 색상', '', '예: 베이지').then(function (v) {
        v = String(v == null ? '' : v).replace(/^실리콘\s*/, '').trim();
        if (!v) return;
        Store.setSilicone(siteId, 'me', sc.colors.concat([v])); rerender();
      });
    };
    cs.appendChild(add);
    box.appendChild(cs);
    if (!sc.colors.length) {
      var hint = document.createElement('div'); hint.className = 'sil-off'; hint.textContent = '색을 고르면 위 부자재에 자동으로 들어갑니다';
      box.appendChild(hint);
    } else if (Share.siliconeLate(s)) {
      var late = document.createElement('div'); late.className = 'film-late-msg'; late.textContent = siliconeLateText(s);
      box.appendChild(late);
    }
  }
  // 인원 선택창(바텀시트): 설정의 팀원 명단은 칩으로(들어간 사람은 강조), 명단에 없는 사람은 아래 칸에 직접 입력
  var staffPicker = { siteId: '', dayIndex: 0, onDone: null, hold: '' };
  function openStaffPicker(siteId, dayIndex, onDone) {
    staffPicker = { siteId: siteId, dayIndex: dayIndex, onDone: onDone, hold: '' };
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
  /* ---------- 하루 수익 적기 (2026-10-14) ----------
     일정 → '수익 💰' 보기에서 날짜를 누르면 뜬다. 그날 인건비·자재비 등을 빼고 남은 돈을 직접 적는다.
     한 날에 여러 줄(현장별 등)을 적을 수 있고, 줄마다 ✏️ 고치기 · ✕ 지우기. 적는 대로 저장(백업)된다 */
  var incomeIso = '', incomeEditId = '';
  function openIncomeSheet(iso) {
    incomeIso = iso; incomeEditId = '';
    $('incAmt').value = ''; $('incMemo').value = '';
    renderIncomeSheet();
    $('incomeSheet').hidden = false;
    setTimeout(function () { $('incAmt').focus(); }, 50);
  }
  function closeIncomeSheet() {
    $('incomeSheet').hidden = true;
    renderSchedule();
  }
  function renderIncomeSheet() {
    var iso = incomeIso;
    var list = (state.settings.income || {})[iso] || [];
    var dayTotal = Share.incomeOfDay(state.settings.income, iso);
    var mon = Share.incomeOfMonth(state.settings.income, iso.slice(0, 7));
    $('incTitle').textContent = '💰 ' + dateLabel(iso) + ' 수익';
    var box = $('incList'); box.innerHTML = '';
    if (!list.length) {
      var e = document.createElement('div'); e.className = 'sec-empty'; e.textContent = '아직 적은 수익이 없어요. 아래에 금액과 내역을 적으세요.';
      box.appendChild(e);
    }
    list.forEach(function (it) {
      var row = document.createElement('div'); row.className = 'inc-row' + (it.id === incomeEditId ? ' editing' : '');
      var amt = document.createElement('b'); amt.className = 'inc-amt' + (it.amt < 0 ? ' minus' : ''); amt.textContent = Share.wonText(it.amt);
      var memo = document.createElement('span'); memo.className = 'inc-memo'; memo.textContent = it.memo || '(내역 없음)';
      var ed = document.createElement('button'); ed.type = 'button'; ed.className = 'inc-btn'; ed.textContent = '✏️'; ed.title = '고치기';
      ed.onclick = function () {
        incomeEditId = it.id;
        $('incAmt').value = String(it.amt % 1000 === 0 ? it.amt / 10000 : it.amt);   // 적은 그대로 만원 단위로 (42만5천 → 42.5)
        $('incMemo').value = it.memo || '';
        renderIncomeSheet();
        $('incAmt').focus();
      };
      var del = document.createElement('button'); del.type = 'button'; del.className = 'inc-btn del'; del.textContent = '✕'; del.title = '지우기';
      del.onclick = function () {
        if (!confirm(Share.wonText(it.amt) + (it.memo ? ' (' + it.memo + ')' : '') + '\n이 수익을 지울까요?')) return;
        Store.deleteIncome(iso, it.id);
        if (incomeEditId === it.id) { incomeEditId = ''; $('incAmt').value = ''; $('incMemo').value = ''; }
        renderIncomeSheet();
      };
      row.appendChild(amt); row.appendChild(memo); row.appendChild(ed); row.appendChild(del);
      box.appendChild(row);
    });
    $('incDayTotal').innerHTML = '이날 합계 <b class="' + (dayTotal < 0 ? 'minus' : '') + '">' + Share.wonText(dayTotal) + '</b>' +
      ' · ' + (+iso.slice(5, 7)) + '월 합계 <b>' + Share.wonText(mon.total) + '</b> (' + mon.days + '일)';
    $('incSave').textContent = incomeEditId ? '✏️ 고치기 저장' : '💾 넣기';
    $('incCancelEdit').hidden = !incomeEditId;
  }
  function saveIncomeForm() {
    var amt = Share.parseManwon($('incAmt').value);
    if (!amt) { toast('금액을 적어 주세요 (예: 40 = 40만원)'); $('incAmt').focus(); return; }
    var memo = $('incMemo').value.trim();
    if (incomeEditId) Store.updateIncome(incomeIso, incomeEditId, amt, memo);
    else Store.addIncome(incomeIso, amt, memo);
    toast((incomeEditId ? '고쳤어요 · ' : '넣었어요 · ') + Share.wonText(amt));
    incomeEditId = ''; $('incAmt').value = ''; $('incMemo').value = '';
    renderIncomeSheet();
  }
  $('incSave').onclick = saveIncomeForm;
  $('incAmt').onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); $('incMemo').focus(); } };
  $('incMemo').onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); saveIncomeForm(); } };
  $('incCancelEdit').onclick = function () { incomeEditId = ''; $('incAmt').value = ''; $('incMemo').value = ''; renderIncomeSheet(); };
  $('incClose').onclick = closeIncomeSheet;
  $('incDone').onclick = closeIncomeSheet;
  $('incomeSheet').onclick = function (e) { if (e.target === $('incomeSheet')) closeIncomeSheet(); };

  /* 팀원 한 사람 일정 잡기 (2026-10-14).
     인원 잡기는 날짜마다 창을 열어야 해서 불편했다 — 사람을 먼저 고르고 달력에서 날짜를 누르면
     그날 '대기' 로 잡힌다(다시 누르면 빠짐). 이미 그날 현장·AS 에 들어간 날은 '현장' 으로 보이고 못 누른다.
     지난 날짜는 흐리게. 누를 때마다 바로 저장(동기화)된다 */
  var holdCal = { name: '', y: 0, m: 0 };
  function openHoldCalendar(name) {
    var t = Share.todayIso().split('-');
    holdCal = { name: name, y: +t[0], m: +t[1] - 1 };
    renderHoldCalendar();
    $('holdCalSheet').hidden = false;
  }
  function closeHoldCalendar() {
    $('holdCalSheet').hidden = true;
    if (!$('viewSettings').hidden) renderTeamList();
    if (typeof renderSchedule === 'function' && $('viewSchedule') && !$('viewSchedule').hidden) renderSchedule();
  }
  function renderHoldCalendar() {
    var name = holdCal.name, y = holdCal.y, m = holdCal.m;
    var pad = function (v) { return (v < 10 ? '0' : '') + v; };
    var norm = function (v) { return String(v).replace(/\s+/g, ''); };
    var today = Share.todayIso();
    var holds = state.settings.holds || {};
    var staffByDate = Share.dateStaff(state.sites);
    $('holdCalTitle').textContent = '📅 ' + name + ' 일정 잡기';
    $('holdCalMonth').textContent = y + '년 ' + (m + 1) + '월';
    var grid = $('holdCalGrid'); grid.innerHTML = '';
    ['일', '월', '화', '수', '목', '금', '토'].forEach(function (w, i) {
      var d = document.createElement('div'); d.className = 'holdcal-wd' + (i === 0 ? ' sun' : i === 6 ? ' sat' : ''); d.textContent = w;
      grid.appendChild(d);
    });
    var first = new Date(y, m, 1).getDay(), last = new Date(y, m + 1, 0).getDate();
    for (var b = 0; b < first; b++) { var e = document.createElement('div'); e.className = 'holdcal-blank'; grid.appendChild(e); }
    var heldCount = 0;
    for (var day = 1; day <= last; day++) (function (day) {
      var iso = y + '-' + pad(m + 1) + '-' + pad(day);
      var busy = ((staffByDate[iso] || {}).names || []).some(function (n) { return norm(n) === norm(name); });
      var on = (holds[iso] || []).some(function (n) { return norm(n) === norm(name); });
      var past = iso < today;
      if (on && !busy) heldCount++;
      var c = document.createElement('button'); c.type = 'button';
      c.className = 'holdcal-day' + (busy ? ' busy' : on ? ' on' : '') + (past ? ' past' : '') +
        (iso === today ? ' today' : '') + (Share.isRedDay(iso) ? ' red' : '');
      c.innerHTML = '<span class="n">' + day + '</span><span class="t">' + (busy ? '현장' : on ? '잡음' : '') + '</span>';
      c.onclick = function () {
        if (busy) { toast(name + ' 은(는) 이날 이미 현장에 들어가 있어요'); return; }
        if (past) { toast('지난 날짜는 잡을 수 없어요'); return; }
        Store.toggleHold(iso, name);
        renderHoldCalendar();
      };
      grid.appendChild(c);
    })(day);
    $('holdCalInfo').innerHTML = '날짜를 누르면 그날 <b>대기</b>로 잡히고, 다시 누르면 빠집니다. 바로 저장돼요.<br>' +
      '이번 달 잡은 날: <b>' + heldCount + '일</b> · 파란 칸은 이미 현장에 들어간 날';
  }
  $('holdCalClose').onclick = closeHoldCalendar;
  $('holdCalDone').onclick = closeHoldCalendar;
  $('holdCalSheet').onclick = function (e) { if (e.target === $('holdCalSheet')) closeHoldCalendar(); };
  $('holdCalPrev').onclick = function () { holdCal.m--; if (holdCal.m < 0) { holdCal.m = 11; holdCal.y--; } renderHoldCalendar(); };
  $('holdCalNext').onclick = function () { holdCal.m++; if (holdCal.m > 11) { holdCal.m = 0; holdCal.y++; } renderHoldCalendar(); };

  // 대기 인원 잡기 (2026-10-14): 같은 인원 창을 날짜 하나에 대해 쓴다. 현장은 고르지 않는다
  function openHoldPicker(iso) {
    staffPicker = { siteId: '', dayIndex: 0, onDone: renderSchedule, hold: iso };
    renderStaffPicker();
    $('staffSheet').hidden = false;
    $('staffInput').value = '';
  }
  function renderHoldPicker() {
    var iso = staffPicker.hold;
    $('staffSheetTitle').textContent = '👤 인원 잡기 — ' + dateLabel(iso);
    var wrap = $('staffChips'); wrap.innerHTML = '';
    var mine = (state.settings.holds || {})[iso] || [];
    var busy = ((Share.dateStaff(state.sites)[iso] || {}).names || []);
    var norm = function (v) { return String(v).replace(/\s+/g, ''); };
    var isIn = function (list, n) { return list.some(function (x) { return norm(x) === norm(n); }); };
    var hint = document.createElement('div'); hint.className = 'sec-empty';
    hint.textContent = '현장은 나중에 — 그날 일할 사람만 먼저 잡아 둡니다. 현장 인원에 넣으면 대기에서 저절로 빠져요.';
    wrap.appendChild(hint);
    var names = (state.settings.team || []).slice();
    mine.forEach(function (n) { if (!isIn(names, n)) names.push(n); });
    var q = staffQuery();   // 검색칸은 여기서도 거른다 (2026-10-24)
    if (q) names = names.filter(function (n) { return Share.nameMatch(n, q); });
    names.sort(function (a, b) { return a.localeCompare(b, 'ko'); });
    names.forEach(function (n) {
      var assigned = isIn(busy, n);
      var on = isIn(mine, n);
      var c = document.createElement('button'); c.type = 'button';
      c.className = 'chip pick' + (on && !assigned ? ' on hold' : '') + (assigned ? ' busy' : '');
      c.textContent = n + (assigned ? ' · 현장 배정됨' : on ? ' ✓' : '');
      c.onclick = function () {
        if (assigned) { toast(n + ' 은(는) 이날 이미 현장에 들어가 있어요'); return; }
        Store.toggleHold(iso, n); renderStaffPicker();
      };
      wrap.appendChild(c);
    });
    $('staffPeople').innerHTML = '';
  }
  /* 인원 칩 (2026-10-24 사장님: 사람이 많아 찾기 힘들다) — 검색어가 없으면 ⭐ 자주(최근 한 달 많이 들어간 6명)
     + 나머지 가나다(첫 자음별), 검색어가 있으면 맞는 사람만 (맞은 글자 칠함) + 명단에 없으면 [＋ 추가].
     busy = 그날 다른 현장에 이미 들어간 사람 — 회색 '다른 현장', 눌러서 넣을 수는 있다 */
  function staffQuery() { return $('staffInput').value.trim(); }
  function renderPickChips(wrap, names, picked, busy, onPick, afterHold) {
    var q = staffQuery();
    var freq = Share.staffFrequency(state.sites, Share.todayIso(), 30);
    var chip = function (n, extra) {
      var on = picked.indexOf(n) !== -1, isBusy = !on && busy.indexOf(n) !== -1;
      var c = document.createElement('button'); c.type = 'button';
      c.className = 'chip pick' + (on ? ' on' : '') + (isBusy ? ' busy2' : '') + (extra && extra.fav ? ' fav' : '');
      var m = q ? Share.nameMatch(n, q) : null;
      if (m && m[1]) {
        c.appendChild(document.createTextNode(n.slice(0, m[0])));
        var hl = document.createElement('mark'); hl.textContent = n.slice(m[0], m[0] + m[1]); c.appendChild(hl);
        c.appendChild(document.createTextNode(n.slice(m[0] + m[1])));
      } else c.appendChild(document.createTextNode(n));
      if (on) c.appendChild(document.createTextNode(' ✓'));
      if (isBusy) { var bs = document.createElement('small'); bs.textContent = '다른 현장'; c.appendChild(bs); }
      else if (extra && extra.n && !q) { var ns = document.createElement('i'); ns.className = 'pick-n'; ns.textContent = extra.n; c.appendChild(ns); }
      c.onclick = function () {
        onPick(n, on);
        if (q) { $('staffInput').value = ''; }
        renderStaffPicker();
      };
      return c;
    };
    var head = function (txt, sub) {
      var h = document.createElement('div'); h.className = 'pick-head';
      h.textContent = txt;
      if (sub) { var sm = document.createElement('small'); sm.textContent = sub; h.appendChild(sm); }
      wrap.appendChild(h);
    };
    if (q) {
      var hit = names.filter(function (n) { return Share.nameMatch(n, q); });
      var favNames = Share.staffPickGroups(names, freq, 6).fav.map(function (f) { return f.name; });
      hit.sort(function (a, b) { return (favNames.indexOf(a) === -1) - (favNames.indexOf(b) === -1) || a.localeCompare(b, 'ko'); });
      head(hit.length ? '찾은 사람 ' + hit.length + '명' : '명단에 "' + q + '" 없음');
      hit.forEach(function (n) { wrap.appendChild(chip(n, { fav: favNames.indexOf(n) !== -1 })); });
      if (!hit.length && !/^[ㄱ-ㅎ]+$/.test(q.replace(/\s+/g, ''))) {   // 맞는 사람이 없을 때만 새로 추가
        var add = document.createElement('button'); add.type = 'button'; add.className = 'pick-add';
        add.textContent = '＋ "' + q + '" 명단에 없는 사람으로 추가';
        add.onclick = addStaffFromInput;
        wrap.appendChild(add);
      }
      return;
    }
    var g = Share.staffPickGroups(names, freq, 6);
    if (g.fav.length) {
      head('⭐ 자주', ' — 최근 한 달 많이 들어간 순');
      g.fav.forEach(function (f) { wrap.appendChild(chip(f.name, { fav: true, n: f.n })); });
    }
    if (g.groups.length) {
      if (g.fav.length || afterHold) head('전체', ' — 가나다');
      g.groups.forEach(function (gr) {
        var ini = document.createElement('div'); ini.className = 'pick-ini'; ini.textContent = gr.ini;
        wrap.appendChild(ini);
        gr.names.forEach(function (n) { wrap.appendChild(chip(n)); });
      });
    }
  }
  function renderStaffPicker() {
    if (staffPicker.hold) { renderHoldPicker(); return; }
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
    // 그날 대기 인원을 맨 위에 따로 — 누르면 이 현장에 들어가고 대기에서 빠진다 (2026-10-14)
    var waiting = Share.isIsoDate(d.date) && !staffQuery() ? Share.heldOpen(state.settings.holds, state.sites, d.date) : [];
    if (waiting.length) {
      var wh = document.createElement('div'); wh.className = 'staff-hold-head'; wh.textContent = '⏳ 그날 대기 — 누르면 이 현장으로';
      wrap.appendChild(wh);
      waiting.forEach(function (n) {
        var c = document.createElement('button'); c.type = 'button'; c.className = 'chip pick hold';
        c.textContent = n;
        c.onclick = function () { Store.addStaff(staffPicker.siteId, staffPicker.dayIndex, n); renderStaffPicker(); };
        wrap.appendChild(c);
      });
      var br = document.createElement('div'); br.className = 'staff-hold-sep'; wrap.appendChild(br);
      names = names.filter(function (n) { return waiting.indexOf(n) === -1; });
    }
    renderPickChips(wrap, names, d.staff, Share.busyElsewhere(state.sites, d.date, s.id), function (n, on) {
      if (on) Store.removeStaff(staffPicker.siteId, staffPicker.dayIndex, n);
      else Store.addStaff(staffPicker.siteId, staffPicker.dayIndex, n);
    }, waiting.length > 0);
    // 이 날 들어간 사람의 연락처·차량번호 — 여기서 바로 적는다 (설정 팀원 명단과 같은 곳에 저장).
    // 현장의 '연락처 보내기'(업자에게 · 관리실 차량등록) 문구에 들어간다
    var pbox = $('staffPeople'); pbox.innerHTML = '';
    if (d.staff.length) {
      var h = document.createElement('div'); h.className = 'staff-people-head';
      h.innerHTML = '📇 연락처·차량번호 <span>— 한 번 적으면 다른 현장에도 그대로</span>';
      pbox.appendChild(h);
      d.staff.forEach(function (n) {
        var row = document.createElement('div'); row.className = 'staff-person';
        var t = document.createElement('div'); t.className = 'staff-person-name'; t.textContent = n;
        row.appendChild(t); row.appendChild(personInputs(n));
        pbox.appendChild(row);
      });
    }
  }
  function addStaffFromInput() {
    var v = $('staffInput').value.trim();
    if (!v) return;
    if (staffPicker.hold) { Store.toggleHold(staffPicker.hold, v); $('staffInput').value = ''; renderStaffPicker(); return; }
    Store.addStaff(staffPicker.siteId, staffPicker.dayIndex, v);
    $('staffInput').value = '';
    renderStaffPicker();
  }
  $('staffInput').addEventListener('input', function () { renderStaffPicker(); });   // 치는 대로 걸러 보여준다
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
  /* 🗑 삭제 → 🙈 숨김 (2026-10-24 사장님). 실수로 지울 일이 없게 위에서는 숨기기만 한다.
     숨긴 현장은 메인 목록 맨 아래 '숨긴 현장 N곳' 을 펼쳐 열고, 그 화면에서 다시 보이기·완전 삭제 */
  function paintHideState(s) {
    var b = $('btnHideSite');
    b.textContent = s && s.hide ? '👁' : '🙈';
    b.title = s && s.hide ? '다시 보이기 — 목록에 다시 나옵니다' : '숨기기 — 목록에서만 안 보이게';
    var old = $('hiddenBanner'); if (old) old.remove();
    if (!s || !s.hide) return;
    var bn = document.createElement('div'); bn.id = 'hiddenBanner'; bn.className = 'hidden-banner';
    bn.appendChild(el2('span', '', '🙈 숨긴 현장 — 목록에 안 나옵니다'));
    var show = el2('button', 'btn-sm', '다시 보이기'); show.type = 'button';
    show.onclick = function () { $('btnHideSite').onclick(); };
    var del = el2('button', 'btn-sm danger', '완전 삭제'); del.type = 'button';
    del.onclick = function () {
      // AS 를 지우려다 현장을 지우는 일이 있어서(2026-10-28) '삭제' 를 직접 적어야 지운다. 지워도 🗑 지운 현장에서 되살릴 수 있다
      modalPrompt('현장을 통째로 지울까요? "' + Share.titleLine(s) + '" — AS 만 지우려면 취소하세요. 지우려면 삭제 라고 적으세요', '', '삭제').then(function (v) {
        if (String(v || '').trim() !== '삭제') { if (v != null) toast('지우지 않았습니다'); return; }
        Store.deleteSite(s.id); toast('삭제됨 — 목록 맨 아래 🗑 지운 현장에서 되살릴 수 있어요'); back();
      });
    };
    bn.appendChild(show); bn.appendChild(del);
    $('siteFields').insertBefore(bn, $('siteFields').firstChild);
  }
  $('btnHideSite').onclick = function () {
    var s = Store.getSite(currentSiteId); if (!s) return;
    var u = Store.updateSite(s.id, { hide: !s.hide });
    if (u.hide) { toast('숨겼습니다 — 목록 맨 아래 \'숨긴 현장\' 에서 다시 열 수 있습니다'); back(); }
    else { toast('다시 목록에 보입니다'); paintHideState(u); }
  };
  $('btnSiteSettings').onclick = function () { go('#settings'); };
  // 📅 월간 일정 바로가기 (2026-10-28) — 이 현장 날짜가 든 달을 펴서 연다
  $('btnSiteMonth').onclick = function () {
    var s = Store.getSite(currentSiteId);
    var d = s && Share.isIsoDate(s.date) ? s.date : Share.todayIso();
    calMonth = ymOf(d); calMode = 'month'; monthBase = 0; pickedDate = '';
    go('#schedule');
    setTimeout(function () { window.scrollTo(0, 0); }, 0);
  };
  /* 📸 완료사진 (2026-10-25 사장님): 현장업무(기사앱)에 연결된 현장만. 기사앱을 '사장님 · 완료사진' 보기로 연다 —
     기사 이름 고르고 품목 찾아 들어갈 필요 없이 모든 품목이 한 화면, 📷 한 번에 촬영 */
  function paintPhotoBtn(s) {
    // 늘 보이게 한다 (2026-10-26: 연결 안 된 현장에선 안 보여서 '사진기 버튼이 없다' 고 헷갈림) — 연결 전엔 흐리게
    var link = s ? Share.workerLink(s) : '';
    $('btnSitePhotos').hidden = false;
    $('btnSitePhotos').classList.toggle('dim', !link);
  }
  $('btnSitePhotos').onclick = function () {
    var link = Share.workerLink(Store.getSite(currentSiteId) || {});
    if (!link) { toast('📸 완료사진은 현장업무(관리자앱)에 연결된 현장만 됩니다 — 위 🛠 현장업무 버튼으로 먼저 연결하세요'); return; }
    window.open(link + (link.indexOf('?') >= 0 ? '&' : '?') + 'owner=1', '_blank');
  };

  function refreshRowState(row, s, key) {
    row.classList.toggle('is-empty', Share.isEmpty(s, key));
    if (key === 'name' || key === 'unit' || key === 'size') $('siteTitle').textContent = Share.titleLine(s);
  }
  // 라벨 오른쪽 좁은 칸으로는 부족한 항목들 - 입력칸을 아래 줄로 내려 가로 폭을 꽉 채운다
  var WIDE_TYPES = { multiline: 1, films: 1, link: 1, contacts: 1 };

  function fieldRow(s, f) {
    var row = document.createElement('div');
    // 긴 글·여러 칸이 들어가는 항목(메모, 필름/시공위치, 사진 링크)은 입력칸을
    // 라벨 아래 줄로 내려서 화면 가로 폭을 꽉 채운다 (frow-wide)
    // 현장명은 '군포 우륵아파트 704동 606호 30평' 처럼 길어지므로 같이 내린다.
    row.className = 'frow' + (f.key === 'name' ? ' frow-name frow-wide' : '') + (WIDE_TYPES[f.type] ? ' frow-wide' : '');
    var cb = document.createElement('input'); cb.type = 'checkbox'; cb.className = 'fcheck';
    cb.dataset.key = f.key;
    cb.checked = !!checked[f.key];
    cb.onchange = function () { checked[f.key] = cb.checked; paintCopyPick(); };
    // 현장명·달력지역은 공유 문구에 안 나가는 칸이라 고를 체크박스가 필요 없다
    if (f.key === 'name' || f.key === 'calRegion') cb.style.visibility = 'hidden';
    var label = document.createElement('div'); label.className = 'flabel'; label.textContent = f.label;
    // 현장명 옆 '주소 복사' — 내비에 붙여넣는다 (호수·평형은 빼고 아파트 이름과 동까지)
    if (f.key === 'name') {
      var navBtn = document.createElement('button');
      navBtn.type = 'button'; navBtn.className = 'nav-copy'; navBtn.textContent = '📋 주소 복사';
      navBtn.onclick = function () {
        var addr = Share.navAddress(Store.getSite(s.id) || s);
        if (!addr) { toast('현장명을 먼저 적어주세요'); return; }
        copyText(addr, '복사됨: ' + addr + ' — 내비에 붙여넣기 하세요');
      };
      // 기사접속 링크도 팀원 공유에 같이 싣는 체크 (2026-10-22). 현장업무에 연결 안 된 현장은 못 고른다
      var wl = document.createElement('label');
      var 연결 = !!Share.workerLink(Store.getSite(s.id) || s);
      wl.className = 'wl-pick' + (연결 ? '' : ' off');
      wl.title = 연결 ? '팀원에게 공유 복사에 기사접속 링크를 같이 넣습니다' : '현장업무에 연결해야 고를 수 있습니다';
      var wcb = document.createElement('input'); wcb.type = 'checkbox'; wcb.className = 'fcheck';
      wcb.dataset.key = Share.WORKER_KEY;
      wcb.disabled = !연결;
      wcb.checked = 연결 && !!checked[Share.WORKER_KEY];
      wcb.onchange = function () {
        if (!Share.workerLink(Store.getSite(s.id) || s)) { wcb.checked = false; toast('먼저 현장업무를 연결하세요'); return; }
        checked[Share.WORKER_KEY] = wcb.checked; paintCopyPick();
      };
      wl.appendChild(wcb);
      wl.appendChild(document.createTextNode('🔗 기사접속링크'));
      // 흐린 칸을 누르면 왜 못 고르는지 알려 준다 (비활성 체크박스는 눌러도 아무 일이 없어서)
      if (!연결) wl.onclick = function () { toast('현장업무에 연결된 현장만 기사접속 링크를 넣을 수 있습니다 (위의 🛠 현장업무 연결)'); };
      var tools = document.createElement('span'); tools.className = 'name-tools';
      tools.appendChild(wl); tools.appendChild(navBtn);
      label.appendChild(tools);
    }
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
      if (f.key === 'name') inp.placeholder = '현장명 (예: 군포 우륵아파트 704동 606호 30평)';
      else if (f.key === 'calRegion') {
        // 비워두면 현장명에서 뽑은 게 뜬다. 뭐가 뜰지 미리 보여줘야 적을지 말지 안다
        var 자동 = Share.autoRegion(s);
        inp.placeholder = 자동 ? '비워두면 ' + 자동 : '예: 인천 송도동';
      } else inp.placeholder = f.placeholder || '';
      inp.addEventListener('input', function () {
        var p = {}; p[f.key] = inp.value; save(p);
        // 현장명을 고치면 달력지역의 '비워두면 OO' 도 따라 바뀐다
        if (f.key === 'name') {
          var rg = document.querySelector('#siteFields input[data-k="calRegion"]');
          if (rg) {
            var a = Share.autoRegion(Store.getSite(s.id) || s);
            rg.placeholder = a ? '비워두면 ' + a : '예: 인천 송도동';
          }
        }
      });
      if (f.key === 'calRegion') inp.dataset.k = 'calRegion';
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
      // 주소를 붙여넣는 칸(견적서·현장사진). 옆의 '열기' 로 바로 확인할 수 있게 한다.
      var box3 = document.createElement('div'); box3.className = 'with-btn';
      var link = document.createElement('input');
      link.type = 'text'; link.inputMode = 'url'; link.autocapitalize = 'off'; link.spellcheck = false;
      link.placeholder = f.placeholder || '링크 붙여넣기';
      link.value = s[f.key] || '';
      link.addEventListener('input', function () { var p = {}; p[f.key] = link.value; save(p); });
      var open = document.createElement('button'); open.className = 'mini'; open.type = 'button'; open.textContent = '열기';
      open.onclick = function () { openLink(link.value); };
      box3.appendChild(link); box3.appendChild(open); ctl.appendChild(box3);
    } else if (f.type === 'films') {
      renderFilms(ctl, s, save);
    } else if (f.type === 'contacts') {
      renderOwners(ctl, s, save);
    } else { // multiline
      var ta = document.createElement('textarea'); ta.rows = 4; ta.value = s[f.key] || '';
      ta.placeholder = f.placeholder || '카톡 대화 복붙, 기타 메모';
      ta.addEventListener('input', function () { var p = {}; p[f.key] = ta.value; save(p); });
      ctl.appendChild(ta);
    }
    refreshRowState(row, s, f.key);
    return row;
  }
  /* 발주처 담당자 (2026-10-14) — 한 줄에 이름·역할·전화. 📞 로 바로 걸고 ✕ 로 뺀다.
     적는 대로 저장한다. 빈 줄은 저장은 되지만 공유 문구·빈칸 판정에서는 없는 것으로 친다 */
  function renderOwners(ctl, s, save) {
    ctl.innerHTML = '';
    var rows = ((Store.getSite(s.id) || s).owners || []).map(function (r) { return Object.assign({ name: '', role: '', phone: '' }, r); });
    var commit = function () { var p = {}; p.owners = rows.map(function (r) { return Object.assign({}, r); }); save(p); };
    var list = document.createElement('div'); list.className = 'owner-list';
    rows.forEach(function (r, i) {
      var line = document.createElement('div'); line.className = 'owner-row';
      var mk = function (key, ph, cls, type) {
        var inp = document.createElement('input'); inp.type = type || 'text'; inp.className = cls; inp.placeholder = ph;
        inp.value = r[key] || ''; inp.autocomplete = 'off';
        if (type === 'tel') inp.inputMode = 'tel';
        inp.addEventListener('input', function () { r[key] = inp.value; commit(); syncCall(); });
        line.appendChild(inp);
        return inp;
      };
      mk('name', '이름', 'owner-name');
      mk('role', '역할 (현장소장)', 'owner-role');
      var ph = mk('phone', '010-0000-0000', 'owner-phone', 'tel');
      var call = document.createElement('a'); call.className = 'owner-call'; call.textContent = '📞'; call.title = '전화 걸기';
      var sms = document.createElement('a'); sms.className = 'owner-sms'; sms.textContent = '💬'; sms.title = '문자 보내기';
      var syncCall = function () {
        var t = Share.phoneDigits(ph.value);
        call.href = t ? Share.telHref(t) : '#';
        sms.href = t ? smsHref(t) : '#';
        call.classList.toggle('disabled', !t);
        sms.classList.toggle('disabled', !t);
      };
      call.onclick = function (e) { if (call.classList.contains('disabled')) e.preventDefault(); };
      sms.onclick = function (e) { if (sms.classList.contains('disabled')) e.preventDefault(); };
      syncCall();
      line.appendChild(call); line.appendChild(sms);
      var del = document.createElement('button'); del.type = 'button'; del.className = 'owner-del'; del.textContent = '✕'; del.title = '빼기';
      del.onclick = function () {
        var who = (r.name || r.phone || '').trim();
        var go_ = function () { rows.splice(i, 1); commit(); renderOwners(ctl, Store.getSite(s.id) || s, save); };
        if (!who) { go_(); return; }
        modalConfirm('담당자 빼기', '"' + who + '" 을(를) 뺄까요?', '빼기', true).then(function (ok) { if (ok) go_(); });
      };
      line.appendChild(del);
      list.appendChild(line);
    });
    ctl.appendChild(list);
    var add = document.createElement('button'); add.type = 'button'; add.className = 'film-add owner-add'; add.textContent = '＋ 담당자 추가';
    add.onclick = function () {
      rows.push({ name: '', role: '', phone: '' }); commit();
      renderOwners(ctl, Store.getSite(s.id) || s, save);
      var names = ctl.querySelectorAll('.owner-name'); if (names.length) names[names.length - 1].focus();
    };
    ctl.appendChild(add);
  }
  function renderFilms(ctl, s, save) {
    ctl.innerHTML = '';
    var films = (s.films || []).map(function (r) { return Object.assign({ place: '', code: '', ready: false, orderedAt: '' }, r); });
    if (!films.length) films.push({ place: '', code: '', ready: false, orderedAt: '' });
    var warnPainters = [];   // 번호를 바꾸면 줄마다 경고를 다시 그린다 (첫 줄만 보이는 규칙 때문에)
    films.forEach(function (r, i) {
      var line = document.createElement('div'); line.className = 'film-row';
      line.innerHTML = '<input type="text" class="place" placeholder="시공위치 (현관문 뒷면)" value="' + esc(r.place) + '">' +
        '<input type="text" class="code" placeholder="필름번호 (PS035)" value="' + esc(r.code) + '">' +
        '<button type="button" class="x" title="줄 삭제">×</button>';
      // 줄마다 [주문] 버튼은 뺐다 (2026-10-24 사장님: 번거롭다 — 위 단계 띠의 '필름 주문' 으로 충분)
      // 준비됨 ☑ — 줄 맨 앞. 아직 저장 안 된 빈 첫 줄이면 먼저 저장하고 토글한다
      line.insertBefore(checkBtn(r.ready, function () {
        if (!Store.getSite(s.id).films[i]) save({ films: films.slice() });
        var u = Store.toggleFilm(s.id, i);
        films[i].ready = !!(u && u.films[i] && u.films[i].ready);
        return films[i].ready;
      }), line.firstChild);
      var upd = function () {
        films[i] = Object.assign({}, films[i], { place: line.querySelector('.place').value, code: line.querySelector('.code').value, ready: !!films[i].ready });
        save({ films: films.slice() });
      };
      line.querySelector('.place').addEventListener('input', upd);
      line.querySelector('.code').addEventListener('input', upd);
      // 번호를 다 적고 나가면 겹침 경고를 다시 그린다 (적는 중에 다시 그리면 커서가 날아간다)
      line.querySelector('.code').addEventListener('change', function () { warnPainters.forEach(function (f) { f(); }); });
      line.querySelector('.x').onclick = function () {
        films.splice(i, 1); save({ films: films.slice() }); renderFilms(ctl, Store.getSite(s.id), save);
      };
      ctl.appendChild(line);
      // 같은 번호가 앞뒤 7일 안 다른 현장에도 있으면 줄 바로 아래에 경고.
      // 이미 끝난 현장은 빼고, 같은 번호가 여러 줄이면 맨 첫 줄에만 (2026-10-24 사장님)
      var warn = document.createElement('div'); warn.className = 'film-warn';
      var paintWarn = function () {
        var cur = Store.getSite(s.id) || s;
        var k = Share.filmKey(films[i].code);
        var first = films.findIndex(function (f) { return Share.filmKey(f && f.code) === k; }) === i;
        var ov = first ? Share.filmOverlapsAhead(state.sites, cur, films[i].code) : [];
        warn.hidden = !ov.length;
        warn.textContent = ov.map(function (x) { return Share.filmOverlapText(x, clientName(x.site)); }).join('\n');
      };
      paintWarn(); warnPainters.push(paintWarn);
      ctl.appendChild(warn);
    });
    // 줄 추가 | 필름명 복사. 복사는 필름 번호만 한 줄에 하나씩 - 대리점 주문용이라
    // 시공위치는 빼고 준다. 방금 친 값(films 배열)을 그대로 읽는다.
    var acts = document.createElement('div'); acts.className = 'film-actions';
    var add = document.createElement('button'); add.type = 'button'; add.className = 'film-add'; add.textContent = '＋ 줄 추가';
    add.onclick = function () {
      // 시공위치는 빈칸, 필름명은 위 줄 것 복사 (시공위치만 다르고 필름은 같은 경우가 많다)
      films.push(Share.newFilmRow(films)); save({ films: films.slice() });
      renderFilms(ctl, Store.getSite(s.id), save);
      var ps = ctl.querySelectorAll('.place'); if (ps.length) ps[ps.length - 1].focus();
    };
    var cp = document.createElement('button'); cp.type = 'button'; cp.className = 'film-copy'; cp.textContent = '필름명 복사';
    cp.onclick = function () {
      var text = Share.filmOrderText({ films: films });
      if (!text) { toast('적힌 필름 번호가 없습니다'); return; }
      // ☑ 된 줄이 있으면 그것만 복사되므로 토스트로 어느 쪽인지 알려준다
      var picked = films.filter(function (r) { return r.ready && String(r.code || '').trim(); }).length;
      copyText(text, (picked ? '체크한 ' + picked + '줄만 ' : '전체 ') + '필름명 복사됨 — 대리점 주문에 붙여넣기 하세요');
    };
    acts.appendChild(add);
    acts.appendChild(cp);
    ctl.appendChild(acts);
    renderFilmVendors(ctl, films, s);
  }
  /* 필름 주문처 (2026-10-19) — 설정에 넣어 둔 주문처·담당자.
     담당자 [전화] 를 누르면 ☑ 체크한 필름명(없으면 전체)이 먼저 복사되고 전화 화면으로 넘어간다.
     통화하면서 카톡·문자에 붙여넣기만 하면 된다. */
  var filmVendorPick = '';   // 지금 고른 주문처 id (화면용, 저장하지 않음)
  function renderFilmVendors(ctl, films, site) {
    var vendors = Share.filmVendors(state.settings);
    var box = document.createElement('div'); box.className = 'fv-box';
    var head = document.createElement('div'); head.className = 'fv-head';
    head.innerHTML = '<span>🏭 필름 주문처</span>';
    /* 문자 첫 줄에 [현장명] 을 넣을지 — 평소엔 필름명만, 퀵서비스를 부를 때만 켠다 (2026-10-19).
       한 번 고르면 다음 현장에서도 그대로다 (이 폰에만 기억하고 복원해도 안 바뀐다). */
    var tog = document.createElement('button'); tog.type = 'button'; tog.className = 'fv-sitetog';
    var paintTog = function () {
      var on = !!state.settings.smsSiteName;
      tog.classList.toggle('on', on);
      tog.textContent = (on ? '☑' : '☐') + ' 퀵서비스용 현장주소';
      tog.title = on ? '문자 첫 줄에 [현장주소] 가 들어갑니다 (퀵서비스용)' : '문자에 필름명만 들어갑니다';
    };
    tog.onclick = function () {
      var on = !state.settings.smsSiteName;
      Store.setSettings({ smsSiteName: on });
      paintTog(); renderFilmVendors2(box, films, site);
      toast(on ? '문자에 [현장주소] 를 넣습니다 (퀵서비스용)' : '문자에 필름명만 넣습니다');
    };
    paintTog();
    head.appendChild(tog);
    box.appendChild(head);
    if (!vendors.length) {
      var hint = document.createElement('p'); hint.className = 'sec-empty';
      hint.textContent = '주문처를 넣어두면 여기서 바로 전화할 수 있습니다.';
      var go2 = document.createElement('button'); go2.type = 'button'; go2.className = 'btn-sm fv-setup'; go2.textContent = '설정에서 넣기';
      go2.onclick = function () { go('#settings'); setTimeout(function () { pickSettingsTab('prep', true); }, 0); };
      box.appendChild(hint); box.appendChild(go2);
      ctl.appendChild(box);
      return;
    }
    // 필름명에 이름이 들어 있는 주문처를 먼저 고른다 (한솔 콘크리트화이트 → 한솔)
    var auto = Share.vendorForSite({ films: films }, vendors);
    var cur = vendors.filter(function (v) { return v.id === filmVendorPick; })[0] || auto || vendors[0];
    var tabs = document.createElement('div'); tabs.className = 'fv-tabs';
    vendors.forEach(function (v) {
      var b = document.createElement('button'); b.type = 'button';
      b.className = 'fv-tab' + (v.id === cur.id ? ' on' : '');
      b.textContent = v.name + (auto && v.id === auto.id ? ' ✓' : '');
      if (auto && v.id === auto.id) b.title = '이 현장 필름에 ' + v.name + ' 이(가) 있어 먼저 골랐습니다';
      b.onclick = function () { filmVendorPick = v.id; renderFilmVendors2(box, films, site); };
      tabs.appendChild(b);
    });
    box.appendChild(tabs);
    var list = document.createElement('div'); list.className = 'fv-list';
    box.appendChild(list);
    fillVendorPeople(list, cur, films, site);
    ctl.appendChild(box);
  }
  // 주문처만 바꿔 다시 그린다 (칩 + 담당자 줄)
  function renderFilmVendors2(box, films, site) {
    var vendors = Share.filmVendors(state.settings);
    var cur = vendors.filter(function (v) { return v.id === filmVendorPick; })[0] || vendors[0];
    if (!cur) return;
    box.querySelectorAll('.fv-tab').forEach(function (b, i) { b.classList.toggle('on', vendors[i] && vendors[i].id === cur.id); });
    fillVendorPeople(box.querySelector('.fv-list'), cur, films, site);
  }
  /* 문자 보내기 주소 — 번호와 본문을 미리 채운 문자창을 연다.
     안드로이드는 sms:번호?body=…, 아이폰은 sms:번호&body=… 로 구분자가 다르다 */
  function smsHref(phone, body) { return Share.smsHref(phone, body, Share.isIosUA(navigator.userAgent)); }
  /* 담당자는 이름 알약 하나로 (2026-10-19) — 날짜별 인원 칩과 같은 모양.
     이름을 누르면 필름명이 복사되며 전화, 옆 💬 를 누르면 필름명이 채워진 문자창. */
  function fillVendorPeople(list, vendor, films, site) {
    list.innerHTML = '';
    if (!vendor.people.length) {
      list.appendChild(el2('p', 'sec-empty', vendor.name + ' 담당자가 없습니다 — 설정 › 현장준비 › 필름 거래처에서 넣으세요.'));
      return;
    }
    var 본문 = state.settings.smsSiteName
      ? Share.filmOrderMessage({ name: (site && site.name) || '', unit: site && site.unit, size: site && site.size, films: films })
      : Share.filmOrderText({ films: films });
    vendor.people.forEach(function (p, i) {
      var who = p.name || ('담당자 ' + (i + 1));
      var pill = el2('span', 'fv-chip' + (p.phone ? '' : ' off'));

      // 이름 = 전화 (누르는 순간 필름명 복사 → 통화하며 붙여넣기)
      var call = document.createElement(p.phone ? 'a' : 'button');
      call.className = 'fv-chip-nm'; call.textContent = who;
      if (p.phone) {
        call.href = telHref(p.phone);
        call.title = who + ' 에게 전화 (' + p.phone + ') — 필름명이 복사됩니다';
        call.onclick = function () { copyFilmNames(films, who); };
      } else {
        call.type = 'button'; call.title = '번호 없음';
        call.onclick = function () { toast(who + ' 번호가 없습니다 — 설정 › 현장준비 › 필름 거래처에서 넣으세요'); };
      }

      // 💬 = 문자 (번호와 필름명이 이미 채워진 문자창)
      var ok = p.phone && 본문;
      var sms = document.createElement(ok ? 'a' : 'button');
      sms.className = 'fv-chip-sms'; sms.textContent = '💬';
      if (ok) {
        sms.href = smsHref(p.phone, 본문);
        sms.title = who + ' 에게 문자 — 필름명이 채워집니다';
        sms.onclick = function () { toast('필름명이 채워진 문자창이 열립니다 — 보내기만 누르세요'); };
      } else {
        sms.type = 'button'; sms.title = p.phone ? '적힌 필름 번호가 없음' : '번호 없음';
        sms.onclick = function () { toast(p.phone ? '적힌 필름 번호가 없습니다' : who + ' 번호가 없습니다 — 설정 › 현장준비 › 필름 거래처에서 넣으세요'); };
      }
      pill.appendChild(call); pill.appendChild(sms);
      list.appendChild(pill);
    });
  }
  // ☑ 체크한 줄만, 없으면 전체 필름명을 복사한다 (필름명 복사 버튼과 같은 규칙)
  function copyFilmNames(films, who) {
    var text = Share.filmOrderText({ films: films });
    if (!text) { toast('적힌 필름 번호가 없습니다'); return false; }
    var picked = films.filter(function (r) { return r.ready && String(r.code || '').trim(); }).length;
    copyText(text, (picked ? '체크한 ' + picked + '줄' : '전체 필름명') + ' 복사됨 — ' + (who ? who + '에게 ' : '') + '통화하며 붙여넣기 하세요');
    return true;
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
  /* 지금 몇 개를 고른 건지 보여 준다. 탭을 나눈 뒤로는 다른 탭의 칸이 체크돼 있어도
     눈에 안 보여서, 고른 것만 복사했는데도 '전체가 복사됐다' 고 읽힌다 */
  function paintCopyPick() {
    var el = $('copyPickCount'); if (!el) return;
    var s = Store.getSite(currentSiteId);
    var n = s ? checkedKeys().filter(function (k) { return !Share.isEmpty(s, k); }).length : 0;
    el.textContent = '공유 항목 ' + n + '개';
    el.className = n ? '' : 'none';
  }
  function setAllChecked(on) {
    // 발주처 담당자는 '전체 선택' 에 안 들어간다 — 고객 번호는 그 칸을 직접 체크했을 때만 기사님께 나간다 (2026-10-14)
    Share.FIELDS.forEach(function (f) { checked[f.key] = on && f.key !== 'name' && f.key !== 'owners'; });
    checked[Share.WORKER_KEY] = on;   // 연결 안 된 현장이면 비어 있는 칸처럼 빠진다
    document.querySelectorAll('#siteFields .fcheck').forEach(function (cb) {
      var k = cb.dataset.key;
      cb.checked = !!checked[k] && !cb.disabled;
    });
    paintCopyPick();
  }
  $('btnPickAll').onclick = function () { setAllChecked(true); };
  $('btnPickNone').onclick = function () { setAllChecked(false); };
  // 저장 버튼 - 칸마다 이미 자동저장되고 있지만, 눌러서 확인할 수 있게 둔 버튼.
  // 실제로 하는 일: 키보드 내리기(마지막 입력 확정) + 백업 대기분을 3초 기다리지 않고 바로 전송.
  function saveNow() {
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    if (!state.settings.backupKey) { toast('저장됨 (백업키가 없어 폰에만 저장)'); return; }
    if (!Store.pendingCount()) { toast('저장됨 — 백업까지 완료'); return; }
    toast('저장 중...');
    Store.flush().then(function (ok) {
      toast(ok ? '저장됨 — 백업까지 완료' : '폰에 저장됨 — 백업은 잠시 뒤 다시 보냅니다');
    });
  }
  $('btnSaveSite').onclick = saveNow;

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
  /* 팀원 명단 + 연락처·차량번호 (2026-09-24).
     명단 자체는 예전처럼 이름만 둔다 — 인원 칩이 이 이름을 쓰고, 인원 칸에는 명단에 없는 사람도
     들어간다. 연락처·차량은 이름으로 찾는 표(settings.people)에 둔다. 현장의 '연락처 보내기'
     문구(업자에게 작업자 연락처 · 관리실 차량등록)가 여기서 채워진다 */
  // 연락처·차량번호 입력 두 칸 — 설정 팀원 명단과 인원 선택창이 같이 쓴다. 적는 대로 저장
  function personInputs(name) {
    var p = Share.personOf(state.settings.people, name);
    var info = document.createElement('div'); info.className = 'team-info';
    var ph = document.createElement('input'); ph.type = 'tel'; ph.placeholder = '연락처 010-…'; ph.value = p.phone;
    var car = document.createElement('input'); car.type = 'text'; car.placeholder = '차량번호 12가3456'; car.value = p.car;
    car.autocomplete = 'off';
    // 전화·차량만 바꾼다 — 경력·페이·사는곳·메모 같은 다른 칸은 그대로 둔다(합치기)
    var save = function () {
      Store.setSettings({ people: Share.mergePerson(state.settings.people, name, { phone: ph.value, car: car.value }) });
    };
    ph.addEventListener('input', save); car.addEventListener('input', save);
    info.appendChild(ph); info.appendChild(car);
    return info;
  }
  // 팀원 명단에서 지금 보고 있는 등급 탭 ('' = 전체). 앱을 다시 열면 전체부터 (2026-10-16)
  var teamTab = '';
  function renderTeamList() {
    var box = $('teamList'); box.innerHTML = '';
    var team = state.settings.team || [];
    if (!team.length) {
      var e = document.createElement('div'); e.className = 'sec-empty'; e.textContent = '아직 없음';
      box.appendChild(e);
    }
    // 등급 탭: 전체 / A / B / C / F — 옆의 숫자는 그 등급 사람 수.
    // 등급을 안 정한 사람(미정)은 [전체]에서만 보인다
    var gradeOf = function (n) { return Share.personOf(state.settings.people, n).grade; };
    if (team.length) {
      var tabs = document.createElement('div'); tabs.className = 'team-tabs';
      [''].concat(Share.PERSON_GRADES).forEach(function (g) {
        var n = g ? team.filter(function (nm) { return gradeOf(nm) === g; }).length : team.length;
        var b = document.createElement('button'); b.type = 'button';
        b.className = 'team-tab g-' + (g || 'all') + (teamTab === g ? ' on' : '');
        b.innerHTML = (g ? esc(g) : '전체') + '<span class="tt-n">' + n + '</span>';
        b.onclick = function () { teamTab = g; renderTeamList(); };
        tabs.appendChild(b);
      });
      box.appendChild(tabs);
    }
    var shown = teamTab ? team.filter(function (nm) { return gradeOf(nm) === teamTab; }) : team;
    if (team.length && !shown.length) {
      var none = document.createElement('div'); none.className = 'sec-empty';
      none.textContent = teamTab + '등급인 사람이 아직 없습니다. [수정]에서 등급을 정할 수 있습니다.';
      box.appendChild(none);
    }
    // 한 줄 = 이름+등급+페이 · [수정] [전화] [일정] [×] (2026-10-16).
    // 전화번호는 글자로 띄우지 않는다 — [전화]로 바로 걸고, 번호가 없으면 그 버튼이 비활성
    shown.forEach(function (name) {
      var i = team.indexOf(name);
      var p = Share.personOf(state.settings.people, name);
      var row = document.createElement('div'); row.className = 'team-row team-tap';
      var main = document.createElement('div'); main.className = 'team-main';
      var t = document.createElement('div'); t.className = 'slist-name';
      t.appendChild(document.createTextNode(name));
      if (p.grade) {   // 이름 뒤에 등급 — 서영호A(23)
        var gb = document.createElement('span'); gb.className = 'gbadge g-' + p.grade; gb.textContent = p.grade;
        gb.title = '등급 ' + p.grade;
        t.appendChild(gb);
      }
      if (p.pay) {   // 이름 뒤에 일당 — 서영호(23)
        var pay = document.createElement('span'); pay.className = 'team-pay'; pay.textContent = '(' + p.pay + ')';
        pay.title = '일당 ' + p.pay + '만원';
        t.appendChild(pay);
      }
      main.appendChild(t);
      // 이름 아래 '📒 18일차 ›' — 누르면 작업내역 (2026-10-23). 사장님이 [수정]에서 켠 사람만 (2026-10-24)
      var h = (state.settings.tracked || []).indexOf(name) !== -1 ? Share.personHistory(state.sites, name, Share.todayIso()) : null;
      if (h) {
        var sub = document.createElement('button'); sub.type = 'button'; sub.className = 'team-hist';
        sub.textContent = h.workDays ? '📒 ' + h.workDays + '일차 ›'
          : h.upcoming.length ? '📒 첫 작업 ' + Share.shortDate(h.upcoming[0].date) + ' ›' : '📒 작업내역 ›';
        sub.title = h.first ? '첫 작업 ' + Share.dayLabel(h.first) + ' · 눌러서 작업내역 보기' : '눌러서 작업내역 보기';
        sub.onclick = function (e) { e.stopPropagation(); openPersonHistory(name); };
        main.appendChild(sub);
      }
      main.onclick = function () { openPersonSheet(name); };   // 이름을 눌러도 기사 정보가 열린다

      // 수정 — 기사 정보 창(이름·등급·전화·차량·경력·페이·사는곳·메모)
      var edit = document.createElement('button'); edit.type = 'button'; edit.className = 'team-btn edit'; edit.textContent = '수정';
      edit.title = '기사 정보 고치기';
      edit.onclick = function (e) { e.stopPropagation(); openPersonSheet(name); };

      // 전화·문자 — 번호가 있으면 바로, 없으면 비활성(수정에서 번호를 넣어야 켜진다)
      var call, sms;
      if (p.phone) {
        call = document.createElement('a'); call.className = 'team-btn call';
        call.href = telHref(p.phone); call.textContent = '전화'; call.title = p.phone + ' 로 전화';
        call.onclick = function (e) { e.stopPropagation(); };
        sms = document.createElement('a'); sms.className = 'team-btn sms';
        sms.href = smsHref(p.phone); sms.textContent = '문자'; sms.title = p.phone + ' 로 문자';
        sms.onclick = function (e) { e.stopPropagation(); };
      } else {
        call = document.createElement('button'); call.type = 'button'; call.className = 'team-btn call'; call.textContent = '전화';
        call.disabled = true; call.title = '연락처 없음 — [수정]에서 번호를 넣으세요';
        call.onclick = function (e) { e.stopPropagation(); };
        sms = document.createElement('button'); sms.type = 'button'; sms.className = 'team-btn sms'; sms.textContent = '문자';
        sms.disabled = true; sms.title = '연락처 없음 — [수정]에서 번호를 넣으세요';
        sms.onclick = function (e) { e.stopPropagation(); };
      }

      // 일정 — 이 사람을 여러 날짜에 한 번에 잡는다 (날짜마다 인원 창을 여는 대신)
      var cal = document.createElement('button'); cal.type = 'button'; cal.className = 'team-btn cal'; cal.textContent = '일정';
      cal.title = '여러 날짜에 한 번에 넣기';
      cal.onclick = function (e) { e.stopPropagation(); openHoldCalendar(name); };

      // × — 지우기 전에 한 번 물어본다 (실수로 누르면 기사 정보까지 날아가므로)
      var x = document.createElement('button'); x.type = 'button'; x.className = 'x'; x.textContent = '×'; x.title = '삭제';
      x.onclick = function (e) {
        e.stopPropagation();
        modalConfirm('팀원 삭제', name + ' 님을 명단에서 지울까요? 전화·차량·경력 같은 기사 정보도 같이 지워집니다. (이미 잡아둔 현장의 인원 이름은 그대로 남습니다)', '삭제', true)
          .then(function (ok) {
            if (!ok) return;
            var next = team.slice(); next.splice(i, 1);
            if (p.photo) Store.deletePhoto(p.photo);                                      // 사진도 같이 지운다
            var people = Object.assign({}, state.settings.people); delete people[name];   // 기사 정보도 같이 지운다
            Store.setSettings({ team: next, people: people });
            renderTeamList();
            toast(name + ' 님을 명단에서 지웠습니다');
          });
      };
      row.appendChild(main); row.appendChild(edit); row.appendChild(call); row.appendChild(sms); row.appendChild(cal); row.appendChild(x);
      box.appendChild(row);
    });
  }
  /* 팀원 작업내역 창 (2026-10-23, 2026-10-24 사장님: 탭 두 개만) — [품목별 경험] [현장별 경험].
     기록은 현장업무(관리자 앱)에서 받는다: n8n worker-history (사장님 열쇠). 품목을 누르면 그 품목을 한 현장들이 펼쳐진다.
     현장별은 이 앱에서 그 사람이 들어간 현장도 같이 (현장업무 기록이 없으면 '기록 없음'). 현장 이름을 누르면 그 현장으로 */
  var workerWorkCache = {};
  var historyTab = 'kind';
  var WORKER_HISTORY_URL = 'https://primary-production-a6fa.up.railway.app/webhook/worker-history';
  function openPersonHistory(name) {
    var h = Share.personHistory(state.sites, name, Share.todayIso());
    var head = h.workDays ? '<p class="ph-head"><b>' + h.workDays + '일차</b> · 첫 작업 ' + esc(Share.dayLabel(h.first)) + '</p>' : '';
    openModal(name + ' 작업내역', '<div class="ph">' + head +
      '<div class="ph-tabs"><button type="button" data-tab="kind">품목별 경험</button><button type="button" data-tab="site">현장별 경험</button></div>' +
      '<div id="phBody"></div></div>', [{ label: '닫기', onClick: closeModal }]);
    $('modalBody').querySelectorAll('.ph-tabs button').forEach(function (b) {
      b.onclick = function () { historyTab = b.dataset.tab; paintHistory(name); };
    });
    paintHistory(name);
    if (!workerWorkCache[name]) loadWorkerWork(name);
  }
  function loadWorkerWork(name) {
    workerWorkCache[name] = { loading: true };
    fetch(WORKER_HISTORY_URL + '?name=' + encodeURIComponent(name))
      .then(function (res) {
        if (res.status === 401 || res.status === 403) throw new Error('이 기기에 사장님 열쇠가 없어 현장업무 기록을 못 봅니다');
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (d) { workerWorkCache[name] = { data: d }; })
      .catch(function (e) { workerWorkCache[name] = { error: e.message || String(e) }; })
      .then(function () { paintHistory(name); });
  }
  function paintHistory(name) {
    var box = $('phBody'); if (!box) return;
    $('modalBody').querySelectorAll('.ph-tabs button').forEach(function (b) { b.classList.toggle('on', b.dataset.tab === historyTab); });
    var c = workerWorkCache[name] || {};
    var ex = Share.workerExperience(c.data ? c.data.tasks : [], state.sites, name, c.data ? c.data.시작 : null);
    var note = c.loading ? '<p class="ph-hint">현장업무 기록을 불러오는 중…</p>'
      : c.error ? '<p class="ph-hint">⚠ ' + esc(c.error) + ' <button type="button" class="link-btn" id="phRetry">다시</button></p>' : '';
    var stage = function (r) {
      return (r.밑작업 ? '<em class="' + (r.밑작업완료 ? 'ok' : 'no') + '">밑작업 ' + (r.밑작업완료 ? '✓' : '미완료') + '</em>' : '') +
        (r.시공 ? '<em class="si ' + (r.시공완료 ? 'ok' : 'no') + '">시공 ' + (r.시공완료 ? '✓' : '미완료') + '</em>' : '');
    };
    var H = [note];
    if (historyTab === 'kind') {
      if (!c.loading && !c.error && !ex.kinds.length) H.push('<p class="ph-hint">현장업무에 맡은 품목이 아직 없습니다.</p>');
      var krow = function (r, timed) {
        var sub = [r.품목];
        if (timed === 'm' && (r.샤시크기 || r.길이m)) sub.push(r.샤시크기 ? r.샤시크기.replace('x', '×') : r.길이m + 'm');
        if (timed && r.밑분) sub.push(r.밑분 + '분');
        var right = !timed ? stage(r)
          : r.측정제외 ? '<span class="ph-per none">측정 안 함</span>'
          : r.per ? '<span class="ph-per">' + r.per + '분' + (timed === 'm' ? '<small>/1m</small>' : '') + '</span>'
          : '<span class="ph-per none">' + (r.밑분 && timed === 'm' ? '길이 없음' : r.밑작업완료 ? '시간 기록 전' : '미완료') + '</span>';
        return '<div class="ph-krow"><span class="d">' + esc(r.date ? Share.dayLabel(r.date) : '') + '</span><span class="m"><b' +
          (r.siteId ? ' class="go" data-site="' + esc(r.siteId) + '"' : '') + '>' + esc(r.현장명) + '</b><small>' + esc(sub.join(' · ')) + '</small></span>' +
          '<span class="s">' + right + '</span></div>';
      };
      // 작업시간 묶음 (2026-10-24): 샤시는 종류·면별 1m당, 문+틀은 1개당 — 첫 3번 → 최근 3번, 막대는 오래된 순
      var timeBox = function (g) {
        var tr = g.trend, head = '';
        if (tr && tr.first) {
          var pct = Math.round((tr.first - tr.last) / tr.first * 100);
          head = '첫 ' + tr.k + '번 평균 <b>' + tr.first + '분</b> → 최근 ' + tr.k + '번 <b>' + tr.last + '분</b> ' +
            (pct > 0 ? '<em class="up">▼ ' + pct + '% 빨라짐</em>' : pct < 0 ? '<em class="down">▲ ' + (-pct) + '% 느려짐</em>' : '<em>그대로</em>');
        } else if (tr) head = '평균 <b>' + tr.avg + '분</b> <small>· 아직 비교할 만큼 안 쌓임 (' + tr.n + '번)</small>';
        else head = '<small>시간 기록이 아직 없습니다 — 공지 확인·완료 보고부터 쌓입니다</small>';
        var max = Math.max.apply(null, g.spark.concat([1]));
        var spark = g.spark.length > 1 ? '<div class="ph-spark">' + g.spark.map(function (v, i) {
          return '<i' + (i === g.spark.length - 1 ? ' class="last"' : '') + ' style="height:' + Math.max(12, Math.round(v / max * 100)) + '%" title="' + v + '분"></i>';
        }).join('') + '</div>' : '';
        return '<div class="ph-tgrp"><div class="ph-tgh"><b>' + esc(g.label) + '</b><small>· ' + g.rows.length + '곳' +
          (g.label === '종류 모름' ? ' · 관리자앱에서 종류를 고르면 나뉩니다' : g.unit === 'm' ? ' · 1m당' : '') + '</small></div>' +
          '<div class="ph-trend">' + head + '</div>' + spark + g.rows.map(function (r) { return krow(r, g.unit); }).join('') + '</div>';
      };
      ex.kinds.forEach(function (k, i) {
        var timed = k.times && k.times.length;
        var rest = timed ? k.rows.filter(function (r) { return !r.밑작업; }) : k.rows;   // 시공만 맡은 줄은 아래에 그대로
        H.push('<details class="ph-kind"><summary><b>' + esc(k.name) + '</b>' +
          (timed ? '<span class="ph-clock" title="작업시간 기록 품목">⏱</span>' : '') +
          '<span class="ph-st' + (k.밑 ? '' : ' none') + '">밑 ' + k.밑 + (k.밑 ? ' <small>(' + k.밑완료 + ')</small>' : '') + '</span>' +
          '<span class="ph-st si' + (k.시 ? '' : ' none') + '">시공 ' + (k.시 ? k.시 + ' <small>(' + k.시완료 + ')</small>' : '아직') + '</span></summary>' +
          (timed ? k.times.map(timeBox).join('') : '') +
          rest.map(function (r) { return krow(r, ''); }).join('') + '</details>');
      });
      if (ex.kinds.length) H.push('<p class="ph-hint">괄호 = 완료 처리한 수 · 품목을 누르면 현장별로 펼쳐집니다 · ⏱ 샤시·문+틀은 밑작업 시간(공지 확인 → 완료 보고, 12~1시 점심 뺌)</p>');
    } else {
      if (!ex.sites.length) H.push('<p class="ph-hint">아직 들어간 현장이 없습니다.</p>');
      ex.sites.forEach(function (s) {
        H.push('<div class="ph-site"><div class="ph-site-h"><span class="d">' + esc(s.date ? Share.dayLabel(s.date) : '') + '</span><b' +
          (s.siteId ? ' class="go" data-site="' + esc(s.siteId) + '"' : '') + '>' + esc(s.현장명) + '</b></div>' +
          (s.items.length ? s.items.map(function (r) {
            return '<div class="ph-srow"><span>' + esc(r.품목) + '</span><span class="s">' + stage(r) + '</span></div>';
          }).join('') : '<p class="ph-hint">' + (c.data ? '현장업무에 맡은 품목 기록 없음' : '') + '</p>') + '</div>');
      });
    }
    box.innerHTML = H.join('');
    if ($('phRetry')) $('phRetry').onclick = function () { loadWorkerWork(name); paintHistory(name); };
    box.querySelectorAll('.go').forEach(function (el) {
      el.onclick = function (e) { e.preventDefault(); e.stopPropagation(); closeModal(); go('#site/' + el.dataset.site); };
    });
  }

  // 기사 정보 창 — 이름 바꾸기, 등급(A·B·C·F), 전화·차량·경력·페이·사는곳·메모(모두 글자). 적는 대로 저장.
  // 등급·경력·페이·사는곳·메모는 카톡 복사 문구에 나가지 않는다
  var PERSON_FIELDS = [
    { key: 'phone', label: '전화번호', ph: '010-…', mode: 'tel', call: true },
    { key: 'car', label: '차량번호', ph: '12가3456' },
    { key: 'career', label: '경력', ph: '예: 3년 · 샤시 전문' },
    { key: 'pay', label: '페이 (일당, 만원)', ph: '', sel: true },
    { key: 'home', label: '사는곳', ph: '예: 부천 중동' },
    { key: 'memo', label: '메모', ph: '', area: true }
  ];
  function telHref(v) { return Share.telHref(v); }
  /* 📞 전화 / 💬 문자 (2026-10-19) — 번호가 보이는 자리는 어디든 둘을 같이 단다.
     번호가 없으면 흐리게 두고 눌러도 아무 일이 없게 한다 (빈 문자창이 열리면 더 헷갈린다).
     kind: 'tel' | 'sms' · body: 문자에 미리 채울 본문 (없으면 빈 문자창) */
  function contactLink(kind, phone, cls, text, who, body) {
    var num = Share.phoneDigits(phone);
    var sms = kind === 'sms';
    var a = document.createElement('a');
    a.className = cls + (num ? '' : ' disabled');
    a.textContent = text;
    a.href = (num ? (sms ? smsHref(phone, body) : telHref(phone)) : '#');
    a.title = num
      ? (who ? who + ' — ' : '') + (sms ? '문자 보내기' : '전화 걸기') + ' (' + phone + ')'
      : '연락처 없음';
    a.setAttribute('aria-label', a.title);
    a.onclick = function (e) { e.stopPropagation(); if (!num) e.preventDefault(); };
    return a;
  }
  // 페이(일당) 고르기 — 8~30 만원, 숫자만 (Share.payOf 가 예전에 적어둔 '일 28만 식대포함' 도 28 로 읽는다)
  function payOptions(cur) {
    var v = Share.payOf(cur);
    var out = ['<option value=""' + (v ? '' : ' selected') + '>미정</option>'];
    for (var n = Share.PAY_MIN; n <= Share.PAY_MAX; n++) {
      out.push('<option value="' + n + '"' + (+v === n ? ' selected' : '') + '>' + n + '</option>');
    }
    return out.join('');
  }
  /* 기사 사진 (2026-10-16) — 한 사람에 한 장.
     사진 자체는 다른 사진(명함·단가표)과 같은 곳에 저장하고(폰은 IndexedDB, 백업은 조각 행),
     기사 정보에는 그 사진의 id 만 적어둔다. 이름을 바꿔도 사진은 그대로 따라간다. */
  var PERSON_PHOTO_OWNER = 'person';   // 거래처가 아니라 '사람' 사진이라는 표시
  function renderPersonPhoto(name) {
    var box = $('pfPhoto'); if (!box) return;
    box.innerHTML = '';
    var p = Share.personOf(state.settings.people, name);
    var photo = p.photo ? Store.getPhoto(p.photo) : null;
    if (!photo) {
      var add = document.createElement('button'); add.type = 'button'; add.className = 'pf-photo-add';
      add.textContent = '＋ 사진 넣기 (촬영 · 앨범)';
      add.onclick = function () { $('pfPhotoInput').click(); };
      box.appendChild(add);
      return;
    }
    var img = document.createElement('img'); img.alt = name;
    var small = photo.thumb || photo.dataUrl;
    if (Share.isImageDataUrl(small)) img.src = small;
    Store.photoData(photo.id).then(function (url) {   // 원본은 읽는 대로 교체 (크게 볼 때 선명하게)
      if (Share.isImageDataUrl(url) && box.contains(img)) img.src = url;
    });
    img.title = '탭하면 크게';
    img.onclick = function () { img.classList.toggle('big'); };
    var act = document.createElement('div'); act.className = 'pf-photo-act';
    var chg = document.createElement('button'); chg.type = 'button'; chg.className = 'btn-sm'; chg.textContent = '바꾸기';
    chg.onclick = function () { $('pfPhotoInput').click(); };
    var del = document.createElement('button'); del.type = 'button'; del.className = 'btn-sm btn-danger'; del.textContent = '사진 삭제';
    del.onclick = function () {
      modalConfirm('사진 삭제', name + ' 님 사진을 지울까요?', '삭제', true).then(function (ok) {
        if (ok) { clearPersonPhoto(name); toast('사진을 지웠습니다'); }
        openPersonSheet(name);   // 확인창이 이 창을 덮었으므로, 지우든 취소든 기사 정보로 돌아온다
      });
    };
    act.appendChild(chg); act.appendChild(del);
    box.appendChild(img); box.appendChild(act);
  }
  // 그 사람에게 걸린 사진을 저장소에서 지우고 기사 정보의 사진 id 도 비운다
  function clearPersonPhoto(name) {
    var p = Share.personOf(state.settings.people, name);
    if (!p.photo) return;
    Store.deletePhoto(p.photo);
    Store.setSettings({ people: Share.mergePerson(state.settings.people, name, { photo: '' }) });
  }
  function setPersonPhoto(name, file) {
    if (!/^image\//.test(file.type || '')) { toast('이미지 파일만 넣을 수 있습니다'); return; }
    toast('사진 처리 중…');
    compressImage(file).then(function (r) {
      return Store.addPhoto(PERSON_PHOTO_OWNER, { name: name, thumb: r.thumb, dataUrl: r.dataUrl, w: r.w, h: r.h, bytes: r.bytes });
    }).then(function (saved) {
      if (!saved) { toast('폰 저장공간이 가득 찼습니다 — 사진을 지우고 다시 시도하세요'); return; }
      clearPersonPhoto(name);   // 예전 사진은 지운다 (한 사람에 한 장)
      Store.setSettings({ people: Share.mergePerson(state.settings.people, name, { photo: saved.id }) });
      renderPersonPhoto(name);
      toast('사진을 넣었습니다');
    }).catch(function (e) {
      toast((e && e.message) || '사진을 읽지 못했습니다');
    });
  }
  function openPersonSheet(name) {
    var p = Share.personOf(state.settings.people, name);
    var fieldHtml = function (f) {
      var ctl = f.sel
        ? '<select class="pf-sel" data-pf="' + f.key + '">' + payOptions(p[f.key]) + '</select>'
        : f.area
        ? '<textarea data-pf="' + f.key + '" rows="3" placeholder="' + esc(f.ph) + '">' + esc(p[f.key]) + '</textarea>'
        : '<input type="text" data-pf="' + f.key + '"' + (f.mode ? ' inputmode="' + f.mode + '"' : '') + ' autocomplete="off" placeholder="' + esc(f.ph) + '" value="' + esc(p[f.key]) + '">';
      if (f.call) ctl = '<div class="pf-row">' + ctl +
        '<a class="pf-call" id="pfCall" href="' + esc(telHref(p.phone)) + '"' + (p.phone ? '' : ' hidden') + '>📞 전화</a>' +
        '<a class="pf-call sms" id="pfSms" href="' + esc(smsHref(p.phone)) + '"' + (p.phone ? '' : ' hidden') + '>💬 문자</a></div>';
      return '<label class="pf-label">' + f.label + '</label>' + ctl;
    };
    var grades = [''].concat(Share.PERSON_GRADES);
    var html = '<div class="person-form">' +
      '<label class="pf-label">이름</label><div class="pf-row"><input type="text" id="pfName" autocomplete="off" value="' + esc(name) + '"><button type="button" class="btn-sm" id="pfRename">이름 바꾸기</button></div>' +
      '<p class="hint admin-err" id="pfMsg" hidden></p>' +
      // 작업내역 보기 (2026-10-24) — 켠 사람만 명단 이름 아래에 'N일차' 가 나오고 누르면 작업내역
      '<label class="pf-track"><input type="checkbox" id="pfTrack"' + ((state.settings.tracked || []).indexOf(name) !== -1 ? ' checked' : '') +
        '> 📒 작업내역 · ⏱ 작업시간 측정 <small>켠 사람만 명단에 몇 일차인지 나오고, 누르면 품목별·현장별 경험과 샤시·문+틀 밑작업 시간 (신입이 오면 여기만 켜면 됩니다)</small></label>' +
      '<label class="pf-label">등급</label><div class="pf-grades" id="pfGrades">' + grades.map(function (g) {
        return '<button type="button" class="pf-grade g-' + (g || 'none') + (p.grade === g ? ' on' : '') + '" data-g="' + g + '">' + (g || '미정') + '</button>';
      }).join('') + '</div>' +
      // 사진은 메모 바로 위 (메모를 길게 쓰면 사진이 저 아래로 밀려서, 2026-10-16)
      PERSON_FIELDS.map(function (f) {
        var photo = '<label class="pf-label">사진</label><div class="pf-photo" id="pfPhoto"></div>';
        return (f.key === 'memo' ? photo : '') + fieldHtml(f);
      }).join('') +
      '<input type="file" id="pfPhotoInput" accept="image/*" hidden>' + '</div>';
    // 칸은 적는 대로 저장되지만, 눌러서 확인할 수 있는 [저장]을 따로 둔다 (백업까지 바로 보낸다)
    openModal('기사 정보 · ' + name, html, [
      { label: '닫기', onClick: closeModal },
      { label: '💾 저장', cls: 'primary', onClick: function () { closeModal(); renderTeamList(); saveNow(); } }
    ]);
    renderPersonPhoto(name);
    $('pfPhotoInput').onchange = function () {
      var f = ($('pfPhotoInput').files || [])[0];
      $('pfPhotoInput').value = '';
      if (f) setPersonPhoto(name, f);
    };

    // 이름 바꾸기 — 명단·기사 정보·모든 현장의 인원이 한꺼번에 새 이름으로 바뀐다
    var doRename = function () {
      var r = Store.renameStaff(name, $('pfName').value);
      if (!r.ok) { $('pfMsg').textContent = r.reason; $('pfMsg').hidden = false; return; }
      var to = $('pfName').value.trim();
      renderTeamList();
      toast(r.sites ? '이름을 바꿨습니다 — 현장 ' + r.sites + '곳의 인원도 함께 바뀌었습니다' : '이름을 바꿨습니다');
      openPersonSheet(to);
    };
    $('pfRename').onclick = doRename;
    // 한글 IME 조합 중 Enter(keyCode 229) 는 글자 확정용이므로 무시
    $('pfName').addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); doRename(); } });
    $('pfName').addEventListener('input', function () { $('pfMsg').hidden = true; });

    $('pfTrack').onchange = function () {
      var list = (state.settings.tracked || []).filter(function (n) { return n !== name; });
      if ($('pfTrack').checked) list.push(name);
      Store.setSettings({ tracked: list });
      renderTeamList();
    };
    $('pfGrades').querySelectorAll('button').forEach(function (b) {
      b.onclick = function () {
        Store.setSettings({ people: Share.mergePerson(state.settings.people, name, { grade: b.dataset.g }) });
        $('pfGrades').querySelectorAll('button').forEach(function (o) { o.classList.toggle('on', o === b); });
        renderTeamList();
      };
    });
    $('modalBody').querySelectorAll('[data-pf]').forEach(function (el) {
      el.addEventListener('change', function () { el.dispatchEvent(new Event('input')); });   // 드롭다운(페이)
      el.addEventListener('input', function () {
        var patch = {}; patch[el.dataset.pf] = el.value;
        Store.setSettings({ people: Share.mergePerson(state.settings.people, name, patch) });
        if (el.dataset.pf === 'phone') {   // 전화 걸기 버튼도 지금 적은 번호를 따라간다
          var c = $('pfCall'); c.href = telHref(el.value); c.hidden = !el.value.trim();
          var m = $('pfSms'); m.href = smsHref(el.value); m.hidden = c.hidden;
        }
        renderTeamList();   // 뒤에 깔린 목록의 요약 줄도 바로 따라가게
      });
    });
  }

  // 설정 탭 (2026-10-05) — 팀원 / 현장준비 / 후기 / 문구 / 백업. 항목은 모두 DOM 에 있고 data-stab 으로 보이기만 바꾼다
  var SETTINGS_TABS = [
    { key: 'team', label: '팀원', cls: 'tab-info' },
    { key: 'prep', label: '현장준비', cls: 'tab-staff' },
    { key: 'review', label: '후기', cls: 'tab-film' },
    { key: 'text', label: '문구', cls: 'tab-supply' },
    { key: 'backup', label: '백업', cls: 'tab-gray' }
  ];
  var settingsTab = 'team';
  function pickSettingsTab(key, scroll) {
    settingsTab = key;
    document.querySelectorAll('#settingsTabs .site-tab').forEach(function (b) { b.classList.toggle('on', b.dataset.tab === key); });
    document.querySelectorAll('#viewSettings .settings-section').forEach(function (sec) { sec.hidden = sec.dataset.stab !== key; });
    if (scroll) window.scrollTo(0, 0);
  }
  function renderSettingsTabs() {
    var bar = $('settingsTabs'); bar.innerHTML = '';
    SETTINGS_TABS.forEach(function (t) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'site-tab ' + t.cls; b.dataset.tab = t.key; b.textContent = t.label;
      b.onclick = function () { pickSettingsTab(t.key, true); };
      bar.appendChild(b);
    });
    pickSettingsTab(settingsTab, false);
  }
  /* 내 차 재고 (2026-10-19) — 줄마다 [충분|부족]. 부족한 게 있으면 할 일에 '🚚 차 보충' 한 줄로 뜬다.
     목록 자체는 예전처럼 새 현장 체크리스트로도 깔린다 */
  function renderSupplyDefaultList() {
    var box = $('supplyDefaultList'); box.innerHTML = '';
    var items = state.settings.supplyDefaults || [];
    if (!items.length) {
      box.appendChild(el2('div', 'sec-empty', '아직 없음'));
      return;
    }
    items.forEach(function (name, i) {
      var low = Share.stockLowNames(state.settings).indexOf(name) !== -1;
      var row = document.createElement('div'); row.className = 'slist-row';
      var t = document.createElement('div'); t.className = 'slist-name'; t.textContent = name;
      var tg = document.createElement('button'); tg.type = 'button';
      tg.className = 'stock-toggle' + (low ? ' low' : '');
      tg.textContent = low ? '부족' : '충분';
      tg.title = low ? '채웠으면 눌러서 충분으로' : '떨어졌으면 눌러서 부족으로';
      tg.onclick = function () {
        Store.setSettings({ stockLow: Share.setStockLow(state.settings, name, !low) });
        renderSupplyDefaultList();
        toast(!low ? name + ' — 부족으로 표시했습니다 (할 일에 차 보충이 뜹니다)' : name + ' — 충분으로 바꿨습니다');
      };
      var x = document.createElement('button'); x.type = 'button'; x.className = 'x'; x.textContent = '×'; x.title = '삭제';
      x.onclick = function () {
        var next = items.slice(); next.splice(i, 1);
        Store.setSettings({ supplyDefaults: next, stockLow: Share.setStockLow(state.settings, name, false) });
        renderSupplyDefaultList();
      };
      row.appendChild(t); row.appendChild(tg); row.appendChild(x);
      box.appendChild(row);
    });
  }
  function el2(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  /* 필름 거래처 설정 (2026-10-19) — 거래처 카드마다 담당자(이름+번호) 여러 명.
     적는 대로 저장되고, 현장 › 필름 칸의 주문처 블록이 이 값을 쓴다 */
  function vendorsNow() { return Share.filmVendors(state.settings); }
  /* [＋ 담당자 추가] 는 빈 칸을 하나 띄워줄 뿐, 저장은 이름이나 번호를 적는 순간에 한다.
     빈 줄은 저장해도 걸러지므로(이름·번호가 둘 다 비면 담당자가 아니다) 눌러도 아무 일이 없는 것처럼 보였다.
     그래서 '아직 안 적은 줄'은 화면에만 두고 기억한다 (2026-10-19) */
  var fvDraftIdx = -1;
  function saveVendors(list) { Store.setSettings({ filmVendors: list }); }
  function renderFilmVendorList() {
    var box = $('filmVendorList'); box.innerHTML = '';
    var vendors = vendorsNow();
    if (!vendors.length) {
      box.appendChild(el2('div', 'sec-empty', '아직 없음 — 아래에 한솔·레놀릿처럼 주문처를 넣으세요.'));
      return;
    }
    vendors.forEach(function (v, vi) {
      var card = el2('div', 'fv-card');
      var head = el2('div', 'fv-card-head');
      var nameIn = document.createElement('input');
      nameIn.type = 'text'; nameIn.value = v.name; nameIn.className = 'fv-name'; nameIn.autocomplete = 'off';
      nameIn.addEventListener('input', function () {
        var list = vendorsNow(); list[vi].name = nameIn.value; saveVendors(list);
      });
      var del = el2('button', 'x', '×'); del.type = 'button'; del.title = '거래처 삭제';
      del.onclick = function () {
        modalConfirm('거래처 삭제', '"' + (v.name || '이 거래처') + '" 와 담당자 ' + v.people.length + '명을 지웁니다.', '삭제', true).then(function (ok) {
          if (!ok) return;
          var list = vendorsNow(); list.splice(vi, 1); saveVendors(list); renderFilmVendorList();
        });
      };
      // ⭐ 주거래처 (2026-10-24) — 누르면 맨 앞으로. 현장 화면 칩도 이 순서라 맨 앞이 먼저 골라진다
      var star = el2('button', 'fv-star' + (vi === 0 ? ' on' : ''), vi === 0 ? '⭐ 주거래처' : '☆');
      star.type = 'button'; star.title = vi === 0 ? '주거래처 — 현장 화면에서 먼저 보입니다' : '주거래처로 (맨 앞으로)';
      star.onclick = function () {
        if (vi === 0) return;
        fvDraftIdx = -1; var list = vendorsNow(); list.unshift(list.splice(vi, 1)[0]); saveVendors(list); renderFilmVendorList();
        toast(v.name + ' 을(를) 주거래처로 — 맨 앞에 보입니다');
      };
      head.appendChild(star); head.appendChild(nameIn); head.appendChild(del);
      card.appendChild(head);

      var people = v.people.slice();
      if (fvDraftIdx === vi) people.push({ name: '', phone: '' });   // 아직 안 적은 빈 줄
      people.forEach(function (p, pi) {
        var row = el2('div', 'fv-prow');
        var n = document.createElement('input'); n.type = 'text'; n.placeholder = '담당자 ' + (pi + 1); n.value = p.name; n.autocomplete = 'off';
        var ph = document.createElement('input'); ph.type = 'tel'; ph.placeholder = '010-…'; ph.value = p.phone; ph.className = 'fv-phone';
        var upd = function () {
          var list = vendorsNow(), tgt = list[vi].people;
          while (tgt.length < pi) tgt.push({ name: '', phone: '' });
          tgt[pi] = { name: n.value, phone: ph.value };
          if (n.value.trim() || ph.value.trim()) fvDraftIdx = -1;   // 적었으니 이제 진짜 담당자
          saveVendors(list);
        };
        n.addEventListener('input', upd); ph.addEventListener('input', upd);
        var call = document.createElement('a'); call.className = 'fv-call' + (p.phone ? '' : ' off'); call.textContent = '📞';
        if (p.phone) call.href = telHref(p.phone);
        var sms = document.createElement('a'); sms.className = 'fv-call sms' + (p.phone ? '' : ' off'); sms.textContent = '💬';
        sms.title = '문자 보내기';
        if (p.phone) sms.href = smsHref(p.phone);
        var x = el2('button', 'x', '×'); x.type = 'button'; x.title = '담당자 빼기';
        x.onclick = function () {
          if (pi >= v.people.length) { fvDraftIdx = -1; renderFilmVendorList(); return; }   // 빈 줄은 그냥 치운다
          var list = vendorsNow(); list[vi].people.splice(pi, 1); saveVendors(list); renderFilmVendorList();
        };
        row.appendChild(n); row.appendChild(ph); row.appendChild(call); row.appendChild(sms); row.appendChild(x);
        card.appendChild(row);
      });
      var addP = el2('button', 'sec-add', '＋ 담당자 추가'); addP.type = 'button';
      addP.onclick = function () {
        fvDraftIdx = vi; renderFilmVendorList();
        var card2 = $('filmVendorList').querySelectorAll('.fv-card')[vi];
        var ins = card2 ? card2.querySelectorAll('.fv-prow input') : [];
        if (ins.length >= 2) ins[ins.length - 2].focus();   // 새 줄의 이름 칸에 커서
      };
      card.appendChild(addP);
      box.appendChild(card);
    });
  }
  bindListAdder('filmVendorInput', 'btnAddFilmVendor', function () { return vendorsNow().map(function (v) { return v.name; }); }, function (names) {
    // bindListAdder 는 이름 목록만 다루므로, 새로 들어온 이름만 거래처로 만든다
    var list = vendorsNow();
    names.forEach(function (nm) {
      if (!list.some(function (v) { return v.name === nm; })) { list.push({ id: 'v' + Date.now().toString(36), name: nm, people: [] }); fvDraftIdx = list.length - 1; }
    });
    saveVendors(list); renderFilmVendorList();
  });
  // 새로 넣은 사람은 등급이 아직 없으니, 등급 탭을 보고 있었으면 [전체]로 돌려 바로 보이게 한다
  bindListAdder('teamInput', 'btnAddTeam', function () { return state.settings.team || []; }, function (next) { Store.setSettings({ team: next }); teamTab = ''; renderTeamList(); });
  bindListAdder('supplyInput', 'btnAddSupplyDefault', function () { return state.settings.supplyDefaults || []; }, function (next) { Store.setSettings({ supplyDefaults: next }); renderSupplyDefaultList(); });
  // AS 부자재·공구 (2026-10-05) — AS·추가작업 접수에서 탭으로 고르는 목록
  function renderServiceToolList() {
    renderStringList($('serviceToolList'), state.settings.serviceTools || [], function (next) { Store.setSettings({ serviceTools: next }); renderServiceToolList(); });
  }
  bindListAdder('serviceToolInput', 'btnAddServiceTool', function () { return state.settings.serviceTools || []; }, function (next) { Store.setSettings({ serviceTools: next }); renderServiceToolList(); });
  // 후기 질문·현장 태그 (2026-09-27)
  function renderReviewSettingLists() {
    renderReviewQuestionList();
    renderStringList($('reviewTagList'), state.settings.reviewTags || [], function (next) { Store.setSettings({ reviewTags: next }); renderReviewSettingLists(); });
  }
  /* 후기 질문 목록: 제목을 누르면 고치기(모든 현장의 답이 새 제목으로 옮겨간다), ↑↓ 순서, × 삭제.
     순서는 현장 후기 탭에 나오는 순서다 */
  function renderReviewQuestionList() {
    var box = $('reviewQuestionList'), list = state.settings.reviewQuestions || [];
    box.innerHTML = '';
    if (!list.length) {
      var e = document.createElement('div'); e.className = 'sec-empty'; e.textContent = '아직 없음';
      box.appendChild(e);
    }
    list.forEach(function (q, i) {
      var row = document.createElement('div'); row.className = 'slist-row rvq-row';
      var nm = document.createElement('button'); nm.type = 'button'; nm.className = 'slist-name rvq-name';
      nm.textContent = q; nm.title = '눌러서 제목 고치기';
      nm.onclick = function () {
        modalPrompt('질문 제목 고치기', q).then(function (v) {
          if (v == null) return;
          var to = String(v).trim();
          if (!to || to === q) return;
          if (!Store.renameReviewQuestion(q, to)) { toast('같은 제목의 질문이 이미 있습니다'); return; }
          toast('제목을 고쳤습니다 — 적어 둔 답도 함께 옮겼습니다');
          renderReviewQuestionList();
        });
      };
      var up = document.createElement('button'); up.type = 'button'; up.className = 'rvq-mv'; up.textContent = '↑'; up.title = '위로';
      up.disabled = i === 0;
      up.onclick = function () { Store.moveReviewQuestion(i, -1); renderReviewQuestionList(); };
      var dn = document.createElement('button'); dn.type = 'button'; dn.className = 'rvq-mv'; dn.textContent = '↓'; dn.title = '아래로';
      dn.disabled = i === list.length - 1;
      dn.onclick = function () { Store.moveReviewQuestion(i, 1); renderReviewQuestionList(); };
      var x = document.createElement('button'); x.type = 'button'; x.className = 'x'; x.textContent = '×'; x.title = '삭제';
      x.onclick = function () {
        modalConfirm('질문 삭제', '"' + q + '" 질문을 뺍니다. 이미 적은 답은 그 현장에 "(지난 질문)"으로 남습니다.', '삭제', true).then(function (ok) {
          if (!ok) return;
          var next = list.slice(); next.splice(i, 1);
          Store.setSettings({ reviewQuestions: next }); renderReviewQuestionList();
        });
      };
      row.appendChild(nm); row.appendChild(up); row.appendChild(dn); row.appendChild(x);
      box.appendChild(row);
    });
  }
  bindListAdder('reviewQuestionInput', 'btnAddReviewQuestion', function () { return state.settings.reviewQuestions || []; }, function (next) { Store.setSettings({ reviewQuestions: next }); renderReviewQuestionList(); });
  bindListAdder('reviewTagInput', 'btnAddReviewTag', function () { return state.settings.reviewTags || []; }, function (next) { Store.setSettings({ reviewTags: next }); renderReviewSettingLists(); });

  /* 앱 파일 버전 — 폰이 새 화면을 받았는지 설정에서 눈으로 확인한다.
     index.html 의 app.js?v=… 를 그대로 읽어 온다 (따로 적어 두면 어긋난다) */
  function appVersion() {
    var sc = [].slice.call(document.scripts).map(function (x) { return x.src || ''; })
      .filter(function (u) { return u.indexOf('app.js') !== -1; })[0] || '';
    var m = /[?&]v=([^&]+)/.exec(sc);
    return m ? m[1] : '';
  }
  function renderSettings() {
    settingsTab = 'team';   // 설정을 열 때마다 첫 탭에서 시작한다
    renderSettingsTabs();
    $('backupKey').value = state.settings.backupKey || '';
    if ($('appVer')) $('appVer').textContent = '버전 ' + (appVersion() || '—');
    renderSyncStatus();
    renderTeamList();
    renderFilmVendorList();
    renderSupplyDefaultList();
    renderServiceToolList();
    TaskUI.renderTaskRules($('taskRules'));
    renderReviewSettingLists();
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
  $('btnTrash').onclick = openTrash;
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

  // ---------- 할 일 (2026-10-14) ----------
  // 할 일 창을 닫거나 저장하면 지금 보고 있는 화면을 다시 그린다
  function refreshView() {
    var h = location.hash || '';
    if (h === '#schedule') renderSchedule();
    else if (/^#site\//.test(h)) renderSite();
    else if (h === '#settings' || h === '#reviews') return;
    else renderMain();
  }
  TaskUI.init({
    toast: toast, copyText: copyText, go: go, modalPrompt: modalPrompt, modalConfirm: modalConfirm, modalSheet: modalSheet,
    refresh: refreshView,
    openClient: function (clientId) {
      currentClientId = clientId;
      if (state.settings.lastTab !== clientId) Store.setSettings({ lastTab: clientId });
      if ((location.hash || '') === '' || location.hash === '#') renderMain(); else go('');
    },
    openService: function (siteId, svcId) { openServiceSheet(siteId, svcId, refreshView); },
    openDay: function (iso) {
      pickedDate = '';
      if ((location.hash || '') !== '#schedule') go('#schedule');
      setTimeout(function () { pickDate(iso); scrollToPicked(); }, 0);
    }
  });
  // '＋ 할 일' 은 떠 있는 버튼 대신 앱 이동(⊞) 패널 맨 위에 둔다 — 떠 있는 버튼이 두 개면 거슬린다 (2026-10-14)
  (window.AppSwitcherActions = window.AppSwitcherActions || []).push({
    icon: '＋', name: '할 일 넣기',
    onClick: function () {
      var s = /^#site\//.test(location.hash || '') ? Store.getSite(currentSiteId) : null;
      if (s) { TaskUI.openTaskSheet({ link: { type: 'site', id: s.id, siteId: s.id, label: Share.titleLine(s) } }); return; }
      TaskUI.openTaskSheet({ date: (location.hash === '#schedule' && pickedDate) || Share.todayIso() });
    }
  });
  $('btnSiteTask').onclick = function () {
    var s = Store.getSite(currentSiteId); if (!s) return;
    TaskUI.openTaskSheet({ link: { type: 'site', id: s.id, siteId: s.id, label: Share.titleLine(s) } });
  };

  // ---------- 시작 ----------
  if (state.settings.backupKey && Store.pendingCount()) Store.flush();
  handleAdminLinkHash();
  scheduleAdminSync();   // 앱을 열 때 맞출 게 남은 연결 현장이 있으면 한 번 더
  // 첫 진입: 해시가 없고 마지막에 일정 화면을 봤으면 일정으로 시작
  if ((!location.hash || location.hash === '#') && state.settings.lastView === 'schedule') location.replace('#schedule');
  route();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(function () { /* PWA 미지원 환경 */ });
  }
})();
