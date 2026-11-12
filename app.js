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
  window.toast = function (m) { toast(m); };   // 🎤 음성 입력(voice.js)이 알림에 쓴다
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
      openModal(title, '<p style="margin:0;line-height:1.6;white-space:pre-line">' + esc(msg) + '</p>', [
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
  /* 빈 현장 저절로 정리 (2026-11-03): ＋ 현장 으로 막 만든 현장을 아무것도 안 적고 나오면 지운다.
     이번에 만든 현장만 본다 (예전부터 있던 빈 현장은 목록 아래 [🧹 빈 현장 지우기] 로) */
  var freshSites = {};
  function markFreshSite(id) { freshSites[id] = true; }
  function dropIfBlank(id) {
    if (!freshSites[id]) return;
    delete freshSites[id];
    var s = Store.getSite(id);
    if (s && Store.isBlankSite(s)) { Store.deleteSite(id, { noTrash: true }); toast('아무것도 안 적은 새 현장은 지웠습니다'); }
  }

  function route() {
    var h = location.hash || '';
    // #site/현장id 또는 #site/현장id/탭 (2026-11-01: 텔레그램 필름 주문 알림이 #site/…/film 으로 필름 탭을 바로 연다)
    var m = /^#site\/([^/]+)(?:\/(\w+))?$/.exec(h);
    if (currentSiteId && (!m || m[1] !== currentSiteId)) dropIfBlank(currentSiteId);
    if (m && Store.getSite(m[1])) {
      currentSiteId = m[1];
      if (m[2] && SITE_TABS.some(function (t) { return t.key === m[2]; })) { siteTab = m[2]; siteTabFor = m[1]; }
      showView('viewSite'); renderSite(); return;
    }
    var mp = /^#photo\/(.+)$/.exec(h);
    if (mp && Store.getPhoto(mp[1])) { showView('viewMain'); renderMain(); openPhotoViewer(mp[1]); return; }
    closePhotoViewer();
    if (h === '#settings') { showView('viewSettings'); renderSettings(); return; }
    if (h === '#schedule') {
      // 일정 화면은 월간으로 연다 (2026-11-10 사장님). 현장을 보고 뒤로 온 거면 보던 그대로 (목록 자리 유지)
      if ($('viewSite').hidden && $('viewSchedule').hidden) { calMode = 'month'; calMonth = ymOf(pickedDate || Share.todayIso()); monthBase = 0; }
      rememberView('schedule'); showView('viewSchedule'); schDelKey = ''; renderSchedule();
      if (calMode === 'month') monthBase = Math.max(0, window.scrollY || 0);
      return;
    }
    if (h === '#reviews') { showView('viewReviews'); renderReviews(); return; }
    var ma = /^#approve(?:\/(\d{4}-\d{2}-\d{2}))?$/.exec(h);   // 📋 결재함 (카톡 링크 #approve/날짜, 2026-11-03)
    if (ma) { showView('viewApprove'); renderApprove(ma[1] || ''); return; }
    // ⏰ 정시 보고 알림의 '확인 필요 보기' → #order/log (업무 내역 탭)
    if (h === '#order/log') { showView('viewOrder'); wlMigrate(); wlTab(true); chatFeedPull(); return; }
    if (h === '#order') { showView('viewOrder'); wlMigrate(); renderChat(); chatAutoOff(); chatMicOff(); chatFeedPull(); return; }   // 📝 업무지시 보드 (2026-11-04)
    if (h && h !== '#') { history.replaceState(null, '', location.pathname); }
    currentSiteId = '';
    rememberView('main');
    showView('viewMain'); renderMain();
  }
  function showView(id) {
    if (id !== 'viewOrder' && typeof chatAutoOff === 'function') chatAutoOff();   // 비서 화면을 나가면 마이크 끔
    ['viewMain', 'viewSite', 'viewSettings', 'viewSchedule', 'viewReviews', 'viewApprove', 'viewOrder'].forEach(function (v) { $(v).hidden = v !== id; });
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
    modalPrompt('거래처 추가', '', '예: 피케이디자인 (1회성 고객은 👤 개인고객 탭에)').then(function (v) {
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
  /* ❓ 질문 담당 · 💬 카톡 / 📨 문자 (11/5 사장님: 출입정보를 누구에게 어떻게 물을지) — 거래처 담당자·현장 발주처 담당자 줄 아래.
     결재함 '출입정보 질문' [진행해] 때 이 사람·방법이 맨 위로 나온다. 방법을 안 고르면 카톡방 이름이 있으면 카톡, 없으면 문자 */
  function askControls(r, onChange) {
    var box = el2('div', 'ask-ctl');
    var who = el2('button', 'ask-who' + (r.ask ? ' on' : ''), r.ask ? '❓ 질문 담당' : '❓ 질문 담당으로');
    who.type = 'button';
    who.title = '출입정보·업체 확인 질문을 이 사람에게 묻기';
    who.onclick = function () { onChange({ ask: !r.ask }); };
    box.appendChild(who);
    var via = r.via === 'kakao' || r.via === 'sms' ? r.via : (String(r.kakaoRoom || '').trim() ? 'kakao' : 'sms');
    [['kakao', '💬 카톡'], ['sms', '📨 문자']].forEach(function (v) {
      var b = el2('button', 'ask-via' + (via === v[0] ? ' on' : ''), v[1]);
      b.type = 'button';
      b.onclick = function () { onChange({ via: v[0] }); };
      box.appendChild(b);
    });
    return box;
  }
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
        '<button class="x" title="삭제">×</button>' +
        '<input type="text" class="room" placeholder="카톡방 이름 (카톡에 보이는 그대로)" value="' + esc(ct.kakaoRoom || '') + '" autocomplete="off">';
      var save = function () {
        var contacts = c.contacts.slice();
        // ask(질문 담당)·via(카톡/문자) 는 그대로 둔다 (11/5)
        contacts[i] = Object.assign({}, contacts[i], { name: row.querySelector('.name').value, phone: row.querySelector('.phone').value, kakaoRoom: row.querySelector('.room').value.trim() });
        // 직접 적으면 ✕ 로 뺐던 방도 다시 살린다
        var offNow = (c.kakaoRoomsOff || []).filter(function (n) { return n !== contacts[i].kakaoRoom; });
        c = Store.updateClient(c.id, { contacts: contacts, kakaoRoomsOff: offNow }) || Store.getClient(c.id);
        paintClientRooms(Store.getClient(c.id));
        roomsPush();
        var t = (contacts[i].phone || '').replace(/[^0-9+]/g, '');
        var a = row.querySelector('a.tel'); a.href = Share.telHref(t); a.classList.toggle('disabled', !t);
        var m = row.querySelector('a.sms'); m.href = smsHref(t); m.classList.toggle('disabled', !t);
      };
      row.querySelector('.name').addEventListener('input', save);
      row.querySelector('.phone').addEventListener('input', save);
      row.querySelector('.room').addEventListener('input', save);
      /* 담당자를 다른 사람에게 알려줄 때 쓴다 — '룩스디자인 실장 010-7132-3491'.
         칸에 적힌 값을 그대로 읽는다. 저장을 안 눌렀어도 방금 고친 게 복사돼야 한다. */
      row.querySelector('.cp').onclick = function () {
        var 이름 = row.querySelector('.name').value.trim();
        var 번호 = row.querySelector('.phone').value.trim();
        var t = [이름, 번호].filter(Boolean).join(' ');
        if (!t) { toast('이름과 연락처가 비어 있습니다'); return; }
        copyText(t, '복사됨 — ' + t);
      };
      row.appendChild(askControls(ct, function (patch) {
        // 질문 담당은 거래처에 한 명 — 켜면 다른 사람은 끈다
        var contacts = c.contacts.map(function (x, j) {
          if (j === i) return Object.assign({}, x, patch);
          return patch.ask ? Object.assign({}, x, { ask: false }) : x;
        });
        Store.updateClient(c.id, { contacts: contacts }); renderContacts(Store.getClient(c.id));
      }));
      row.querySelector('.x').onclick = function () {
        var contacts = c.contacts.slice(); contacts.splice(i, 1);
        Store.updateClient(c.id, { contacts: contacts }); renderContacts(Store.getClient(c.id));
      };
      wrap.appendChild(row);
    });
    var rb = el2('div', 'room-list'); rb.id = 'clientRooms';
    wrap.appendChild(rb);
    paintClientRooms(c);
  }
  /* 💬 연결된 카톡방 (2026-11-05 사장님) — 담당자 아래 적은 방 · 카톡 정리로 연결된 방 · 노트북 설정(config client_rooms)에 있는 방.
     앱과 노트북이 서로 알려 준다 (n8n 카톡_보내기 rooms): 앱에 적은 방은 노트북이 빈칸 묻기·답장 읽기에도 쓴다 */
  var laptopRooms = {}, roomsPushT = 0;
  function paintClientRooms(c) {
    var box = $('clientRooms');
    if (!box || !c) return;
    box.innerHTML = '';
    var off = c.kakaoRoomsOff || [];
    var typed = BossChat.clientRooms({ contacts: c.contacts }), pasted = BossChat.clientRooms({ kakaoRooms: c.kakaoRooms });
    var lap = [].concat(laptopRooms[c.name] || []).filter(function (n) { return off.indexOf(n) === -1; });
    var rows = [];
    typed.concat(pasted, lap).forEach(function (n) { if (n && rows.indexOf(n) === -1) rows.push(n); });
    if (!rows.length) return;
    box.appendChild(el2('div', 'room-h', '💬 연결된 카톡방'));
    rows.forEach(function (n) {
      var tags = [];
      if (pasted.indexOf(n) !== -1) tags.push('카톡 정리');
      if (lap.indexOf(n) !== -1) tags.push('노트북');
      var chip = el2('span', 'room-chip', n);
      if (tags.length) chip.appendChild(el2('small', '', tags.join('·')));
      var del = el2('button', 'room-x', '✕'); del.type = 'button'; del.title = '이 방 빼기';
      del.onclick = function () { removeClientRoom(c.id, n); };
      chip.appendChild(del);
      box.appendChild(chip);
    });
  }
  // ✕ 방 빼기: 담당자 칸·카톡 정리 목록에서 지우고, 노트북 설정에 있는 방은 kakaoRoomsOff 로 — 노트북이 지켜보기·보내기에 안 쓴다 (설정 파일은 그대로)
  function removeClientRoom(clientId, room) {
    modalConfirm('카톡방 빼기', '"' + room + '" 방을 뺄까요?\n\n비서가 이 방을 안 쓰고, 노트북도 이 방을 지켜보지 않습니다. 카톡방 자체는 그대로입니다. 담당자 아래에 이름을 다시 적으면 되살아납니다.', '빼기', true).then(function (ok) {
      if (!ok) return;
      var c = Store.getClient(clientId);
      if (!c) return;
      var contacts = (c.contacts || []).map(function (ct) { return ct && ct.kakaoRoom === room ? Object.assign({}, ct, { kakaoRoom: '' }) : ct; });
      var pasted = (c.kakaoRooms || []).filter(function (n) { return n !== room; });
      var off = (c.kakaoRoomsOff || []).filter(function (n) { return n !== room; });
      if ([].concat(laptopRooms[c.name] || []).indexOf(room) !== -1) off.push(room);
      Store.updateClient(clientId, { contacts: contacts, kakaoRooms: pasted, kakaoRoomsOff: off });
      renderContacts(Store.getClient(clientId));
      toast('뺐어요 — ' + room);
      roomsSync();
    });
  }
  // 앱이 아는 방을 노트북에 알려 주고, 노트북 설정에 있는 방을 받아 온다
  function roomsSync() {
    if (!ownerKeyOn()) return;
    var rooms = {}, offRooms = {};
    Store.clients().forEach(function (c) { if ((c.kakaoRoomsOff || []).length) offRooms[c.name] = c.kakaoRoomsOff; });
    // 사장님이 담당자 아래 직접 적은 방만 — 노트북이 지켜보고 답도 하는 방이라, 카톡 정리로 저절로 생긴 방은 안 보낸다
    Store.clients().forEach(function (c) { var r = BossChat.clientRooms({ contacts: c.contacts }); if (r.length) rooms[c.name] = r; });
    kakaoPost({ action: 'rooms', side: 'app', rooms: rooms, off: offRooms }).then(function (d) {
      laptopRooms = d.rooms || {};
      // 노트북이 아는 방을 거래처에 적어 둔다 — 9시 출입정보 질문(n8n 업무일정표)이 '카톡방이 있으면 카톡' 을 판단할 때 쓴다 (11/11)
      Store.clients().forEach(function (c) {
        var lap = [].concat(laptopRooms[c.name] || []).map(function (n) { return String(n || '').trim(); }).filter(Boolean).sort();
        if (JSON.stringify(lap) !== JSON.stringify((c.laptopRooms || []).slice().sort())) Store.updateClient(c.id, { laptopRooms: lap });
      });
      paintClientRooms(Store.getClient(currentClientId));
    }).catch(function () { /* 다음에 */ });
  }
  function roomsPush() { clearTimeout(roomsPushT); roomsPushT = setTimeout(roomsSync, 2000); }
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
      .map(function (r) { return [Share.placeLine(r.place), r.code].filter(Boolean).join(' '); });
    if (films.length) lines.push('필름: ' + films.join(', '));
    if (!lines.length && s.memo && s.memo.trim()) lines.push(s.memo.trim().split('\n')[0]);
    return lines;
  }
  /* ---------- 👤 개인고객 탭 (2026-11-05 사장님) ----------
     블로그·소개로 오는 1회성 고객. 고객 이름이 먼저 보이고, 끝난 현장(시공 지남 + 잔금 받음)은 접어 둔다. 설계 songil docs/superpowers/specs/2026-11-05-개인고객-design.md */
  var pvFilter = 'open', pvQuery = '';
  function currentIsPrivate() { return Share.isPrivateClient(Store.getClient(currentClientId)); }
  function pvOrder(a, b) { return (a.date || '9999') < (b.date || '9999') ? -1 : 1; }
  function renderPrivateCards(wrap, all) {
    var bar = el2('div', 'pc-bar');
    var q = el2('input', 'pc-search');
    q.type = 'search'; q.placeholder = '🔍 이름·전화번호·아파트로 찾기'; q.value = pvQuery; q.autocomplete = 'off';
    bar.appendChild(q);
    var chips = el2('div', 'wl-chips pc-chips');
    bar.appendChild(chips);
    var list = el2('div', 'pc-list');
    wrap.appendChild(bar);
    wrap.appendChild(list);
    var paint = function () {
      var today = Share.todayIso();
      var visible = all.filter(function (s) { return !s.hide; });
      var open = visible.filter(function (s) { return !Share.privateDone(s, today); }).sort(pvOrder);
      var done = visible.filter(function (s) { return Share.privateDone(s, today); }).sort(function (a, b) { return pvOrder(b, a); });
      chips.innerHTML = '';
      [['open', '진행 ' + open.length], ['done', '끝남 ' + done.length], ['블로그', '블로그'], ['소개', '소개']].forEach(function (c) {
        var b = el2('button', 'wl-chip' + (pvFilter === c[0] ? ' on' : ''), c[1]); b.type = 'button';
        b.onclick = function () { pvFilter = c[0]; paint(); };
        chips.appendChild(b);
      });
      list.innerHTML = '';
      var rows = pvQuery.trim() ? visible.filter(function (s) { return Share.privateMatch(s, pvQuery); }).sort(pvOrder)
        : pvFilter === 'open' ? open : pvFilter === 'done' ? done : visible.filter(function (s) { return s.source === pvFilter; }).sort(pvOrder);
      if (!rows.length) list.appendChild(el2('p', 'sec-empty', pvQuery.trim() ? '찾는 고객이 없어요.' : pvFilter === 'open' ? '진행 중인 고객이 없어요. 아래 [＋ 고객] 으로 넣어 주세요.' : '해당하는 고객이 없어요.'));
      rows.forEach(function (s) {
        var c = Share.privateCustomer(s), card = el2('div', 'card color-' + (s.color || 0));
        var t = el2('h3', 'card-title pc-who', c.name ? c.name + ' 고객님' : Share.titleLine(s));
        if (s.source) t.appendChild(el2('span', 'pc-src', s.source + (s.sourceBy ? ' · ' + s.sourceBy : '')));
        card.appendChild(t);
        if (c.name) card.appendChild(el2('div', 'pc-where', Share.titleLine(s)));
        cardSummary(s).forEach(function (l) { card.appendChild(el2('div', 'card-line', l)); });
        if (c.phone) card.appendChild(el2('div', 'card-line', '📞 ' + c.phone));
        card.onclick = function () { go('#site/' + s.id); };
        list.appendChild(card);
      });
      if (pvFilter === 'open' && !pvQuery.trim() && done.length) {
        var fold = el2('button', 'hidden-toggle', '▶ 끝난 현장 ' + done.length + '곳'); fold.type = 'button';
        fold.onclick = function () { pvFilter = 'done'; paint(); };
        list.appendChild(fold);
      }
    };
    q.addEventListener('input', function () { pvQuery = q.value; paint(); });
    paint();
  }
  // ＋ 고객: 이름·연락처·경로·현장만. 전에 시공한 번호면 알려 준다
  function openNewCustomer() {
    var src = '';
    openModal('＋ 새 고객',
      '<label class="pc-l">고객 이름</label><input id="pvName" class="pc-in" autocomplete="off">' +
      '<label class="pc-l">연락처</label><input id="pvPhone" class="pc-in" type="tel" inputmode="tel" autocomplete="off"><div id="pvHit"></div>' +
      '<label class="pc-l">어디서 왔나요?</label><div class="pc-pick" id="pvSrc"></div>' +
      '<label class="pc-l">누구 소개인가요? (선택)</label><input id="pvBy" class="pc-in" autocomplete="off">' +
      '<label class="pc-l">현장 (아파트·동호수)</label><input id="pvSite" class="pc-in" autocomplete="off">',
      [{ label: '닫기', onClick: closeModal }, { label: '이 고객 현장 만들기', cls: 'primary', onClick: function () {
        var name = $('pvName').value.trim(), phone = $('pvPhone').value.trim(), place = $('pvSite').value.trim();
        if (!name && !place) { toast('고객 이름이나 현장을 적어 주세요'); return; }
        var s = Store.addSite(currentClientId);
        Store.updateSite(s.id, { name: place || name, owners: (name || phone) ? [{ name: name, role: '고객', phone: phone }] : [], source: src, sourceBy: $('pvBy').value.trim() });
        closeModal();
        pvFilter = 'open'; pvQuery = '';
        go('#site/' + s.id);
      } }]);
    var pick = $('pvSrc');
    Share.PRIVATE_SOURCES.forEach(function (v) {
      var b = el2('button', 'pc-opt', v); b.type = 'button';
      b.onclick = function () { src = src === v ? '' : v; pick.querySelectorAll('button').forEach(function (x) { x.classList.toggle('on', x.textContent === src); }); };
      pick.appendChild(b);
    });
    $('pvPhone').addEventListener('input', function () {
      var hit = Share.sitesByPhone(state.sites, this.value, ''), box = $('pvHit');
      box.innerHTML = '';
      if (!hit.length) return;
      var d = el2('div', 'pc-hit');
      d.appendChild(el2('b', '', '🔁 전에 시공한 고객이에요'));
      hit.slice(0, 3).forEach(function (s) {
        var a = el2('button', 'pc-hitrow', Share.titleLine(s) + (s.date ? ' · ' + Share.shortDate(s.date) : '') + ' →'); a.type = 'button';
        a.onclick = function () { closeModal(); go('#site/' + s.id); };
        d.appendChild(a);
      });
      box.appendChild(d);
    });
  }
  // 현장 화면 위 고객 칸 — 이름·연락처·경로, 전화·문자, 시공 1주 전 못 받은 정보를 문자로
  function renderCustomerCard(box, siteId) {
    var s = Store.getSite(siteId);
    box.className = 'sec pc-card';
    box.innerHTML = '';
    var rows = (s.owners || []).map(function (r) { return Object.assign({}, r); });
    if (!rows.length) rows = [{ name: '', role: '고객', phone: '' }];
    var line = function (key, label, type) {
      box.appendChild(el2('label', 'pc-l', label));
      var i = el2('input', 'pc-in'); i.type = type || 'text'; i.value = rows[0][key] || ''; i.autocomplete = 'off';
      if (type === 'tel') i.inputMode = 'tel';
      i.addEventListener('input', function () { rows[0][key] = i.value; Store.updateSite(siteId, { owners: rows.map(function (r) { return Object.assign({}, r); }) }); paintLinks(); });
      box.appendChild(i);
    };
    box.appendChild(el2('div', 'pc-ct', '고객'));
    line('name', '이름');
    line('phone', '연락처', 'tel');
    box.appendChild(el2('label', 'pc-l', '카톡방 이름 (카톡에 보이는 그대로)'));
    var kr = el2('input', 'pc-in'); kr.value = s.kakaoRoom || ''; kr.autocomplete = 'off'; kr.placeholder = '비워 두면 고객 이름으로 찾아요';
    kr.addEventListener('input', function () { Store.updateSite(siteId, { kakaoRoom: kr.value }); });
    box.appendChild(kr);
    var links = el2('div', 'pc-links');
    box.appendChild(links);
    var paintLinks = function () {
      links.innerHTML = '';
      var d = Share.phoneDigits(rows[0].phone);
      if (d.length < 9) return;
      [['전화', 'tel:'], ['문자', 'sms:']].forEach(function (x) {
        var a = el2('a', 'pc-link', x[0]); a.href = x[1] + d;
        links.appendChild(a);
      });
    };
    paintLinks();
    box.appendChild(el2('label', 'pc-l', '어디서 왔나요?'));
    var pick = el2('div', 'pc-pick');
    Share.PRIVATE_SOURCES.forEach(function (v) {
      var b = el2('button', 'pc-opt' + (s.source === v ? ' on' : ''), v); b.type = 'button';
      b.onclick = function () {
        var cur = (Store.getSite(siteId) || {}).source === v ? '' : v;
        Store.updateSite(siteId, { source: cur });
        pick.querySelectorAll('button').forEach(function (x) { x.classList.toggle('on', x.textContent === cur); });
      };
      pick.appendChild(b);
    });
    box.appendChild(pick);
    box.appendChild(el2('label', 'pc-l', '누구 소개인가요? (선택)'));
    var by = el2('input', 'pc-in'); by.value = s.sourceBy || ''; by.autocomplete = 'off';
    by.addEventListener('input', function () { Store.updateSite(siteId, { sourceBy: by.value }); });
    box.appendChild(by);
    // 시공 1주 전, 못 받은 정보 — 업체방이 없으니 문자로
    var today = Share.todayIso();
    if (s.date && s.date >= today && s.date <= Share.addDays(today, 7)) {
      var keys = ['pwLobby', 'pwUnit', 'parking', 'toilet'].filter(function (k) { return Share.isEmpty(s, k); });
      if (keys.length) {
        var ask = el2('div', 'pc-ask');
        ask.appendChild(el2('b', '', '시공 전 못 받은 정보'));
        ask.appendChild(el2('div', 'kk-v', keys.map(function (k) { return Kakao.FIELD_LABEL[k]; }).join(' · ')));
        var row = el2('div', 'pc-links');
        var q = el2('button', 'pc-askbtn', '문자로'); q.type = 'button';
        q.onclick = function () { openCustomerAsk(siteId, keys); };
        var kk = el2('button', 'pc-askbtn kk', '카톡으로'); kk.type = 'button';
        kk.onclick = function () { openCustomerKakao(siteId, keys, stat); };
        row.appendChild(q); row.appendChild(kk);
        ask.appendChild(row);
        box.appendChild(ask);
      }
    }
    var stat = el2('div', 'pc-kstat');
    box.appendChild(stat);
    customerKakaoWatch(siteId, stat);
  }
  // 💬 고객 카톡 (11/5): 노트북이 그 방에 보내고(이름이 정확히 같은 방만), 시공일까지 답장을 지켜본다. 결과는 site.kakaoLast
  function customerRoom(s) { return String(s.kakaoRoom || '').trim() || String(Share.privateCustomer(s).name || '').trim(); }
  function customerKakaoPaint(el, x) {
    el.innerHTML = '';
    if (!x) return;
    var c = kakaoCard(x);
    el.appendChild(el2('div', 'pc-kline ' + (x.state === 'sent' ? 'ok' : c.ok && !x.stale ? 'wait' : 'bad'), c.text + (x.state === 'sent' ? '\n이 방 답장을 시공일까지 지켜봅니다' : '')));
  }
  var customerKakaoT = 0;
  function customerKakaoWatch(siteId, el) {
    clearTimeout(customerKakaoT);
    var s = Store.getSite(siteId), x = s && s.kakaoLast;
    if (!x) return;
    customerKakaoPaint(el, x);
    if ((x.state !== 'wait' && x.state !== 'taken') || Date.now() - x.at > 60 * 60000) return;
    customerKakaoT = setTimeout(function () {
      if (!document.body.contains(el)) return;
      kakaoPost({ action: 'status', ids: [x.id] }).then(function (d) {
        var v = (d.items || [])[0];
        if (v && v.state && v.state !== 'unknown') {
          var k = Object.assign({}, x, { state: v.state, why: v.why || '', stale: !!v.stale });
          if (v.state === 'sent' || v.state === 'failed') k.doneAt = Date.now();
          Store.updateSite(siteId, { kakaoLast: k });
        }
      }).catch(function () { /* 다음에 */ }).then(function () { if (document.body.contains(el)) customerKakaoWatch(siteId, el); });
    }, 10000);
  }
  function openCustomerKakao(siteId, keys, stat) {
    var s = Store.getSite(siteId), c = Share.privateCustomer(s), room = customerRoom(s);
    if (!room) { toast('고객 이름이나 카톡방 이름을 먼저 적어 주세요'); return; }
    var text = '안녕하세요 섬세한손길입니다 🙂\n' + (Share.buildQuestion(s, keys, state.settings.questions) || '');
    openModal('💬 ' + room + ' 방에 카톡', '<p class="hint">노트북이 이름이 정확히 같은 방을 찾아 보냅니다. 노트북이 꺼져 있으면 30분 뒤 취소돼요.</p><textarea id="pcKk" rows="8" class="pc-in" data-no-stamp></textarea>', [
      { label: '닫기', onClick: closeModal },
      { label: '💬 보내기', cls: 'primary', onClick: function () {
        var v = $('pcKk').value.trim();
        if (!v) return;
        closeModal();
        var id = 'k' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        var days = (s.days || []).map(function (d) { return d.date; }).filter(Boolean).sort();
        var until = days[days.length - 1] || s.date || '';
        kakaoPost({ action: 'add', id: id, room: room, client: '', text: v, watch: { siteId: s.id, name: Share.titleLine(s), until: until, keys: keys } }).then(function () {
          Store.updateSite(siteId, { kakaoLast: { id: id, room: room, client: '', at: Date.now(), state: 'wait' } });
          toast('💬 노트북에 맡겼어요');
          workLog([{ src: 'me', kind: 'reply', title: room + ' 방 카톡 맡김', detail: (c.name || '') + ' 정보 묻기', siteId: s.id }]);
          if (document.body.contains(stat)) customerKakaoWatch(siteId, stat);
        }).catch(function (e) { toast('❌ 못 맡겼어요 — 인터넷을 확인해 주세요 (' + String(e.message || e).slice(0, 60) + ')'); });
      } }]);
    $('pcKk').value = text;
  }
  function openCustomerAsk(siteId, keys) {
    var s = Store.getSite(siteId), c = Share.privateCustomer(s), phone = Share.phoneDigits(c.phone);
    if (phone.length < 9) { toast('고객 연락처를 먼저 적어 주세요'); return; }
    var text = '안녕하세요 섬세한손길입니다 🙂\n' + (Share.buildQuestion(s, keys, state.settings.questions) || '');
    openModal('📨 ' + (c.name || '고객') + '님께 문자', '<p class="hint">사장님 폰으로 보냅니다. 답은 앱에 저절로 안 들어가요 — 답이 오면 칸에 적거나 🤖 비서에게 말해 주세요.</p><textarea id="pvAsk" rows="8" class="pc-in" data-no-stamp></textarea>', [
      { label: '닫기', onClick: closeModal },
      { label: '📨 보내기', cls: 'primary', onClick: function () {
        var v = $('pvAsk').value.trim(), key = '';
        if (!v) return;
        try { key = localStorage.getItem('ownerKey') || ''; } catch (e) { /* 저장소 막힘 */ }
        closeModal();
        toast('보내는 중…');
        fetch(ORDER_URL, { method: 'POST', headers: { 'content-type': 'application/json', 'x-owner-key': key },
          body: JSON.stringify({ siteId: s.id, name: Share.titleLine(s), text: v, sendTo: { label: c.name || '고객', phone: phone } }) })
          .then(function (res) { return res.json().catch(function () { return {}; }).then(function (d) { if (!res.ok || !d.ok) throw new Error(d.error || 'HTTP ' + res.status); }); })
          .then(function () { smsReplyWatch(phone, c.name || '고객', s.id, Share.titleLine(s), true, keys); toast('✅ 문자를 보냈어요'); workLog([{ src: 'me', kind: 'sms', title: (c.name || '고객') + '님께 정보 묻는 문자', detail: Share.titleLine(s), siteId: s.id }]); })
          .catch(function (e) { toast('❌ 못 보냈어요 — 폰의 SMS Gateway 를 확인해 주세요 (' + String(e.message || e).slice(0, 60) + ')'); });
      } }]);
    $('pvAsk').value = text;
  }
  // 🔀 다른 거래처로 옮기기 — 거래처로 등록했던 개인고객을 개인고객 탭으로 (반대도)
  function moveSiteToClient(siteId) {
    var s = Store.getSite(siteId);
    var items = Store.clients().filter(function (c) { return c.id !== s.clientId; }).map(function (c) { return { label: (Share.isPrivateClient(c) ? '👤 ' : '') + c.name, value: c.id }; });
    if (!items.length) { toast('옮길 다른 거래처가 없어요'); return; }
    modalSheet('🔀 어느 거래처로 옮길까요?', items).then(function (id) {
      if (!id) return;
      Store.updateSite(siteId, { clientId: id });
      currentClientId = id;
      toast('옮겼어요 — ' + Store.getClient(id).name);
      renderSite();
    });
  }
  function renderCards() {
    var wrap = $('cards'); wrap.innerHTML = '';
    var empty = $('emptyState');
    if (!currentClientId) {
      empty.hidden = false; empty.innerHTML = '위의 <b>＋</b> 버튼으로 첫 거래처를 추가하세요.';
      $('btnAddSite').hidden = true; return;
    }
    $('btnAddSite').hidden = false;
    var isPrivate = currentIsPrivate();
    $('btnAddSite').textContent = isPrivate ? '＋ 고객' : '＋ 현장';
    var all = Store.sitesOf(currentClientId);
    if (isPrivate) { empty.hidden = true; renderPrivateCards(wrap, all); cardsFooter(wrap, all.filter(function (s) { return s.hide; })); return; }
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
    cardsFooter(wrap);
  }
  function cardsFooter(wrap, hid) {
    if (hid && hid.length) {
      var tg = document.createElement('button'); tg.type = 'button'; tg.className = 'hidden-toggle';
      tg.textContent = showHidden ? '▲ 숨긴 현장 접기' : '🙈 숨긴 현장 ' + hid.length + '곳 보기';
      tg.onclick = function () { showHidden = !showHidden; renderCards(); };
      wrap.appendChild(tg);
      if (showHidden) hid.forEach(function (s) { var c = el2('div', 'card is-hidden color-' + (s.color || 0), Share.titleLine(s)); c.onclick = function () { go('#site/' + s.id); }; wrap.appendChild(c); });
    }
    // 🧹 빈 현장 한 번에 지우기 (2026-11-03) — 이름도 내용도 없는 현장. 지운 현장에서 되살릴 수 있다
    var blanks = Store.blankSitesOf(currentClientId);
    if (blanks.length) {
      var bk = document.createElement('button'); bk.type = 'button'; bk.className = 'hidden-toggle blank-toggle';
      bk.textContent = '🧹 아무것도 안 적은 빈 현장 ' + blanks.length + '곳 지우기';
      bk.onclick = function () {
        var now = Store.blankSitesOf(currentClientId);
        if (!now.length) { renderCards(); return; }
        modalConfirm('빈 현장 지우기', '이름도 내용도 없는 현장 ' + now.length + '곳을 지웁니다. 일정·필름·AS·견적이 하나라도 있는 현장은 지우지 않습니다. 잘못 지웠으면 🗑 지운 현장에서 되살릴 수 있습니다.', '지우기', true).then(function (ok) {
          if (!ok) return;
          now.forEach(function (x) { Store.deleteSite(x.id); });
          renderCards(); toast('빈 현장 ' + now.length + '곳을 지웠습니다');
        });
      };
      wrap.appendChild(bk);
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
    if (currentIsPrivate()) { openNewCustomer(); return; }
    var s = Store.addSite(currentClientId);
    markFreshSite(s.id);
    go('#site/' + s.id);
  };
  $('btnSettings').onclick = function () { go('#settings'); };

  function ensurePrivateTab() {
    if (state.settings.privateTabMade || !Store.clients().length) return;
    if (!Store.clients().some(Share.isPrivateClient)) Store.addClient(Share.PRIVATE_NAME);
    Store.setSettings({ privateTabMade: true });
  }
  function renderMain() {
    ensurePrivateTab();
    ensureCurrentClient();
    renderTabs(); renderFixed(); renderKakao($('kakaoWrap'), currentClientId); TaskUI.renderClientNotes($('notesWrap'), currentClientId); QuoteRequests.render($('qreqWrap'), currentClientId); renderCards(); renderSyncBadge();
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
  var calMode = 'month';   // 'week' | 'month' — 처음엔 월간 (2026-11-10), 아래로 내리면 주간으로 접힌다
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
    var bx = document.createElement('button'); bx.type = 'button'; bx.className = 'schcal-toggle';
    bx.textContent = '📦 AS 박스 찾기';
    bx.onclick = function () { openBoxFinder(''); };
    row.appendChild(bx);
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
    markFreshSite(s.id);
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
    if (Share.isPrivateClient(Store.getClient(s.clientId))) {   // 👤 개인고객: 고객 칸을 맨 위에
      var cust = document.createElement('div'); wrap.appendChild(cust);
      renderCustomerCard(cust, s.id);
    }
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
      if (f.key === 'owners') sec('info', '', function (box) { var mv = el2('button', 'hidden-toggle pc-move', '다른 거래처로 옮기기'); mv.type = 'button'; mv.onclick = function () { moveSiteToClient(s.id); }; box.appendChild(mv); });
      panes[pane].appendChild(fieldRow(s, f));
      if (f.key === 'date') {                                                // 시공날짜 바로 아래 날짜별 인원
        sec('staff', 'daysSec', renderDaysSection);
        sec('staff', 'extraSec', renderExtraSection);   // 추가작업 → 인원 (2026-10-26)
        sec('staff', '', renderContactSection);
      }
    });
    sec('info', 'checkSec', renderCheckSection);   // 업체 확인 질문의 답 (2026-11-01) — 출입 칸 아래
    sec('film', 'boxSec', renderBoxSection);       // AS 필름 박스 — 마지막 날 남긴 필름 (2026-10-31)
    sec('film', 'extraFilmSec', renderExtraSection);   // 추가작업 → 필름 (같은 내용, 필름 탭에서도)
    sec('film', '', renderSuppliesSection);     // 필름 바로 아래 부자재 (2026-10-05 한 탭으로 묶음)
    sec('film', 'silSec', renderSiliconeSection);   // 부자재 바로 아래 실리콘 (2026-10-24)
    sec('etc', 'asBoxSec', renderBoxSection);      // AS 접수 위에 이 현장 박스 (같은 내용)
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
    // 업체 확인 질문 (2026-11-01) — 시공 전인 현장만 '못 받은 답' 으로 센다 (지난 현장까지 빨갛게 두지 않게)
    if (s.date && s.date >= today) checksNow().forEach(function (c) { if (!c.off && !Share.checkAnswer(s, c.id) && !Share.checkSkipped(s, c.id)) empty.push('check:' + c.id); });
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
      // 1안 머리 (11/7): 현장명 왼쪽 두 줄 날짜 — 위 '11/7' (여러 날이면 '9/28–9/29'), 아래 '토' / '월–화 · 2일'
      st.d1 = Share.shortDate(a) + (a !== z ? '–' + Share.shortDate(z) : '');
      st.d2 = weekdayOf(a) + (a !== z ? '–' + weekdayOf(z) : '') + (ds.length > 1 ? ' · ' + ds.length + '일' : '');
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
    /* 1안 머리 (11/7 사장님): 날짜는 현장명 왼쪽 두 줄, 거래처명은 견적서·현장업무와 같은 줄 왼쪽, 머리 전체는 회색 띠로 아래와 나눈다 */
    var r1 = document.createElement('div'); r1.className = 'sh-r1';
    var dt = document.createElement('div'); dt.className = 'sh-date' + (st.d1 ? '' : ' none') + (st.d1 && st.d1.indexOf('–') !== -1 ? ' range' : '');
    dt.innerHTML = '<div class="sh-d1">' + esc(st.d1 || '미정') + '</div><div class="sh-d2">' + esc(st.d2 || '날짜') +
      (st.dday ? ' · <em class="sh-dday' + (st.dday === '끝남' ? ' done' : '') + '">' + st.dday + '</em>' : '') + '</div>';
    dt.title = st.when || '날짜 미정';
    var nm = document.createElement('div'); nm.className = 'sh-name';
    // '250-14' 같은 번지가 '250-' / '14' 로 갈라지지 않게 (11/7) — 보이는 제목만
    nm.innerHTML = esc(Share.titleLine(s)).replace(/(\S*\d-\d\S*)/g, '<span class="nobr">$1</span>');
    r1.appendChild(dt); r1.appendChild(nm);
    var sub = document.createElement('div'); sub.className = 'sh-sub';
    // 견적서 버튼 (2026-10-18) — 현장업무 왼쪽. 이어 붙인 견적서의 내역을 보고 인원을 가늠한다
    var qb = document.createElement('button'); qb.type = 'button';
    qb.className = 'sh-quote' + (s.quoteCode ? ' on' : '');
    qb.textContent = s.quoteCode ? '견적서 ✓' : '견적서 연결';
    qb.title = s.quoteCode ? '견적 내역 보기 · ' + QuoteLink.짧은주소(s.quoteCode) : '발행한 견적서를 이 현장에 이어 붙입니다';
    qb.onclick = function () { openQuoteSheet(s.id); };
    sub.appendChild(qb);
    // 현장업무(관리자 앱) 연결 버튼 — 연결 전엔 '연결', 후엔 맞춤 상태와 함께 시트를 연다
    var ab = document.createElement('button'); ab.type = 'button';
    ab.className = 'sh-admin' + (s.adminId ? ' on' : '');
    ab.textContent = s.adminId ? '현장업무 ' + adminBadge(s) : '현장업무 연결';
    ab.onclick = function () { openAdminSheet(s.id); };
    sub.appendChild(ab);
    // 거래처명을 누르면 그 업체 탭이 열린 거래처 화면으로 (같은 업체의 다른 현장을 바로 본다)
    if (client) {
      var cb = document.createElement('button'); cb.type = 'button'; cb.className = 'sh-client';
      cb.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 21V5l8-2v18M12 8l8 2v11M4 21h16M8 8h.01M8 12h.01M8 16h.01M16 13h.01M16 17h.01"/></svg><span>' + esc(client.name) + '</span>';
      cb.title = '이 업체의 현장 목록 보기';
      cb.onclick = function () {
        currentClientId = client.id;
        if (state.settings.lastTab !== client.id) Store.setSettings({ lastTab: client.id });
        go('');
      };
      sub.insertBefore(cb, sub.firstChild);   // 거래처명은 줄 맨 왼쪽
    }
    // 상태 알약 줄은 뺐다 (2026-09-26) — 탭 이름 옆 빨간 점이면 '여기 볼 게 있다' 는 걸 알기에 넉넉하고,
    // 알약이 두 줄로 늘어나 정작 봐야 할 칸이 아래로 밀렸다. 판정(siteStatus)은 그 점에 그대로 쓴다
    head.appendChild(r1); head.appendChild(sub);
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
    // 정산 견적서(/s/, 2026-11-12) 는 현장업무 품목으로 만든 견적이라 '시공품목 자동 선택' 이 필요 없고,
    // 수정은 방문견적이 아니라 그 현장의 정산견적 화면에서 한다
    var 정산 = QuoteLink.is정산(code);
    var btn = function (k, label) { return '<button type="button" data-k="' + k + '">' + label + '</button>'; };
    var 그리기 = function (내용) {
      openModal('📄 ' + (정산 ? '정산 견적서' : '견적서') + ' · ' + QuoteLink.짧은주소(code),
        내용 + '<div class="sheet-list">' +
          (정산 ? '' : btn('items', '🛠 현장업무에 시공품목 자동 선택<small>' + (s.adminId ? '견적서에 있는 품목을 현장업무에서 켭니다' : '먼저 현장업무를 연결해야 합니다') + '</small>')) +
          (정산
            ? (s.adminId ? btn('edit', '✏️ 정산 견적서 수정하기<small>정산견적 화면에서 고칩니다 · 다시 발행하면 새 견적서</small>') : '')
            : btn('edit', '✏️ 견적서 수정하기<small>방문견적에서 이 견적을 불러와 고칩니다 · 다시 발행하면 새 견적서</small>')) +
          btn('copy', '📋 견적서 링크 복사<small>카톡·문자로 다른 사람에게 보낼 때</small>') +
          btn('open', '🔗 견적서 열기<small>발행된 견적서를 새 창으로</small>') +
          btn('change', '🔁 다른 견적서로 바꾸기') +
          btn('unlink', '✕ 견적서 연결 해제') +
        '</div>', [{ label: '닫기', cls: 'primary', onClick: closeModal }]);
      $('modalBody').querySelectorAll('button[data-k]').forEach(function (b) {
        b.onclick = function () {
          var k = b.dataset.k;
          if (k === 'open') { window.open(QuoteLink.보기주소(code), '_blank'); return; }
          // 방문견적이 보내는 링크와 같은 꼴: /q/코드?d=1(품목설명 켬)&n=제목(base64url, 카톡 미리보기 제목) (2026-11-09)
          if (k === 'copy') {
            var 링크 = QuoteLink.보기주소(code) + '?d=1';
            var 제목 = 견적캐시[code] && QuoteLink.요약(견적캐시[code]).현장명;
            if (제목) {
              var bin = '';
              new TextEncoder().encode(제목).forEach(function (c) { bin += String.fromCharCode(c); });
              링크 += '&n=' + btoa(bin).split('+').join('-').split('/').join('_').split('=').join('');
            }
            var 안됨 = function () { window.prompt('길게 눌러 복사하세요', 링크); };
            if (navigator.clipboard && navigator.clipboard.writeText) {
              navigator.clipboard.writeText(링크).then(function () {
                toast('견적서 링크를 복사했습니다');
                var sm = b.querySelector('small'); if (sm) sm.textContent = '✅ 복사됨 · 카톡·문자에 붙여넣기';
              }, 안됨);
            } else 안됨();
            return;
          }
          // 방문견적 ?edit=<견적코드>&client=<거래처ID> (견적요청 내역의 [이 견적 수정하기] 와 같은 길, 2026-11-09).
          // 고쳐서 다시 발행하면 새 견적코드가 나온다 - 이 현장 연결은 [다른 견적서로 바꾸기] 로 새 것으로 바꾼다
          if (k === 'edit' && 정산) {
            window.open('https://songil.netlify.app/settle.html?site=' + encodeURIComponent(s.adminId), '_blank');
            toast('다시 발행했으면 여기서 [다른 견적서로 바꾸기] 로 새 견적서를 연결하세요');
            return;
          }
          if (k === 'edit') {
            window.open('https://songil.netlify.app/quote_pro.html?edit=' + encodeURIComponent(code) +
              (s.clientId ? '&client=' + encodeURIComponent(s.clientId) : ''), '_blank');
            toast('다시 발행했으면 여기서 [다른 견적서로 바꾸기] 로 새 견적서를 연결하세요');
            return;
          }
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
        // 품수 정산 견적서의 품목 줄은 금액이 없다(인건비·자재비로 따로 셈) - 0원 대신 빈칸
        html += '<div class="qv-zone"><span>' + esc(z.구역) + '</span><em>' + (z.합 ? esc(원화(z.합)) : '') + '</em></div>';
        z.줄.forEach(function (x) {
          html += '<div class="qv-line"><span>' + esc(x.품목명) + (x.수량 ? ' <i>' + esc(x.수량 + (x.단위 || '')) + '</i>' : '') +
            '</span><em>' + (x.금액 ? esc(원화(x.금액)) : '') + '</em></div>';
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
    // 정산 견적서 (2026-11-12): 현장업무에 연결된 현장이면 그 현장에서 발행한 정산 견적서를 받아 맨 위에 둔다
    var adminId = String(s.adminId || '').trim();
    var 정산목록 = adminId
      ? fetch(SETTLE_HISTORY_URL + encodeURIComponent(adminId))
          .then(function (res) { return res.ok ? res.json() : {}; })
          .then(function (d) { return ((d && d.정산) || []).slice().reverse(); }, function () { return []; })
      : Promise.resolve([]);
    // 방문견적 목록을 못 받아도 정산 견적서는 보여 준다 (둘은 따로 받는다). 둘 다 없으면 예전처럼 오류 화면
    var 발행 = QuoteRequests.발행목록(quoteDeps).then(function (l) { return { list: l }; }, function (e) { return { err: e }; });
    Promise.all([발행, 정산목록]).then(function (둘) {
      return 둘[0].err && !(둘[1] || []).length ? Promise.reject(둘[0].err) : 둘;
    }).then(function (둘) {
      var list = 둘[0].list || [], 정산들 = 둘[1] || [];
      var 발행오류 = 둘[0].err ? (둘[0].err.message || String(둘[0].err)) : '';
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
      var html = '<div class="qreq-linkrow"><input type="text" id="qlCode" placeholder="견적코드 또는 /q/·/s/ 주소" autocomplete="off">' +
        '<button type="button" class="btn-sm primary" id="qlGo">연결</button></div><p class="hint admin-err" id="qlMsg" hidden></p>';
      if (정산들.length) {
        html += '<div class="sheet-list">' + 정산들.map(function (p, k) {
          var 남 = 쓴코드['s:' + p.코드];
          return '<button type="button" data-s="' + k + '">🧮 정산 견적서 <em class="sim">이 현장</em>' +
            '<small>' + esc([p.발행일시 ? Share.shortDate(String(p.발행일시).slice(0, 10)) : '', p.총액 ? 원화(p.총액) : '', '/s/' + p.코드,
              남 ? '이미 ' + 남 + ' 에 연결됨' : ''].filter(Boolean).join(' · ')) + '</small></button>';
        }).join('') + '</div>';
      }
      if (발행오류) html += '<p class="hint admin-err">⚠ 방문견적 목록은 못 받았습니다 (' + esc(발행오류) + ')</p>';
      html += ranked.length
        ? '<div class="sheet-list">' + ranked.map(function (p, k) {
            var 남 = 쓴코드[p.견적코드];
            return '<button type="button" data-k="' + k + '">' + esc(p.현장명 || '(이름 없음)') +
              (rank(p) === 0 ? ' <em class="sim">이 거래처</em>' : '') +
              '<small>' + esc([p.발행일시 ? Share.shortDate(String(p.발행일시).slice(0, 10)) : '', p.총액 ? 원화(p.총액) : '', '/q/' + p.견적코드,
                남 ? '이미 ' + 남 + ' 에 연결됨' : ''].filter(Boolean).join(' · ')) + '</small></button>';
          }).join('') + '</div>'
        : (발행오류 ? '' : '<p class="hint">발행된 견적서를 못 받았습니다. 위 칸에 견적코드를 넣어 연결하세요.</p>');
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
      $('modalBody').querySelectorAll('button[data-s]').forEach(function (b) {
        b.onclick = function () { 붙이기('s:' + 정산들[+b.dataset.s].코드); };
      });
    }, function (e) {
      $('modalBody').innerHTML = '<p class="hint admin-err">⚠ 목록을 못 받았습니다 (' + esc(e.message) + ')</p>' +
        '<div class="qreq-linkrow"><input type="text" id="qlCode" placeholder="견적코드 또는 /q/·/s/ 주소" autocomplete="off">' +
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

  /* ---------- 견적요청 내역의 [🏗 이 견적으로 현장개설 + 작업관리 생성] (2026-11-03) ----------
     1) 같은 견적으로 만든 현장이 있으면 그 현장을 쓴다 (고쳐 다시 발행한 견적이면 견적코드만 새 것으로 바꾼다)
        없으면 이 거래처에 현장을 새로 만든다 — 현장명 = 견적서 제목, 견적서 연결
     2) 현장업무(관리자 앱)가 안 이어져 있으면: 이름이 비슷한 현장업무가 있으면 고르게 하고, 없으면 새로 만든다
     3) 현장업무가 생기면 견적서대로 시공품목을 켠다 (createAdminProject / openAdminPicker 가 applyQuoteItems 를 부른다) */
  function siteFromQuote(clientId, x) {
    var s = QuoteRequests.견적현장찾기(Store.state && Store.state.sites, x, clientId);
    var 새현장 = !s, 코드바뀜 = false;
    if (!s) {
      s = Store.addSite(clientId);
      Store.updateSite(s.id, { name: QuoteRequests.견적현장명(x.이름), quoteCode: x.견적코드 });
    } else if (s.quoteCode !== x.견적코드) {
      Store.updateSite(s.id, { quoteCode: x.견적코드 });
      코드바뀜 = true;
    }
    var siteId = s.id;
    go('#site/' + siteId);
    s = Store.getSite(siteId);
    if (s.adminId) {
      toast(코드바뀜 ? '이미 개설된 현장입니다 — 새 견적서로 바꿔 이었습니다' : '이미 개설된 현장입니다');
      if (코드바뀜) applyQuoteItems(siteId, true);   // 켜기만 한다 (끄지 않는다)
      return;
    }
    if (!AdminLink.adminTitle(s)) { toast((새현장 ? '현장을 만들었습니다' : '현장을 열었습니다') + ' — 현장명을 적은 뒤 현장업무를 연결하세요'); return; }
    adminFromQuote(siteId, 새현장);
  }
  // 이름이 비슷하고 아직 안 묶인 현장업무가 있으면 '그걸로 잇기' 를 먼저 보여준다 — 관리자 앱에서 먼저 만들어 둔 경우
  function adminFromQuote(siteId, 새현장) {
    var s = Store.getSite(siteId);
    var 머리 = 새현장 ? '현장을 만들었습니다. ' : '이 견적의 현장이 이미 있어 그 현장을 열었습니다. ';
    openModal('작업관리 생성', '<p class="hint">' + esc(머리) + '현장업무를 찾는 중…</p>', []);
    AdminLink.listProjects(adminDeps).then(function (list) {
      var linked = ((Store.state && Store.state.sites) || []).map(function (y) { return y.adminId; }).filter(Boolean);
      var 비슷 = QuoteRequests.비슷한현장업무(list, AdminLink.adminTitle(s), linked).slice(0, 5);
      if (!비슷.length) { createAdminProject(siteId); return; }
      $('modalBody').innerHTML = '<p class="hint">' + esc(머리) + '이름이 비슷한 현장업무가 있습니다. 같은 현장이면 골라서 잇고, 아니면 새로 만드세요.</p>' +
        '<div class="sheet-list">' +
          비슷.map(function (p, k) {
            return '<button type="button" data-k="' + k + '">🔗 ' + esc(p.name || '(이름없음)') +
              '<small>' + esc([p.date ? Share.shortDate(p.date) : '시공일 미정', p.workers.length ? '기사 ' + p.workers.length + '명' : ''].filter(Boolean).join(' · ')) + '</small></button>';
          }).join('') +
          '<button type="button" data-act="create">➕ 새 현장업무 만들기<small>' + esc(AdminLink.adminTitle(s)) + '</small></button>' +
        '</div>';
      $('modalBody').querySelectorAll('button[data-k]').forEach(function (b) {
        b.onclick = function () {
          AdminLink.linkExisting(siteId, 비슷[+b.dataset.k].id, adminDeps);
          closeModal(); adminRepaint(); toast('현장업무를 연결했습니다 — 견적서대로 시공품목을 켭니다');
          applyQuoteItems(siteId, true);
        };
      });
      $('modalBody').querySelector('button[data-act="create"]').onclick = function () { createAdminProject(siteId); };
    }, function () {
      createAdminProject(siteId);   // 목록을 못 받아도 만들기는 해 본다 (실패하면 그 화면에서 알려 준다)
    });
  }
  QuoteRequests.현장개설 = siteFromQuote;

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
    // 🚚 업체가 필름을 가져다주는 현장 (2026-11-05)
    var fvBtn = document.createElement('button'); fvBtn.type = 'button'; fvBtn.className = 'fv-sitetog' + (s.filmVendor ? ' on' : '');
    fvBtn.textContent = (s.filmVendor ? '☑' : '') + ' 업체가 필름을 가져옴';
    fvBtn.onclick = function () {
      var on = !s.filmVendor;
      Store.updateSite(siteId, Share.filmVendorPatch(s, on));
      toast(on ? '주문 알림을 끕니다 — 전날 업체에 한 번 확인해요' : '직접 주문하는 현장으로 되돌렸어요');
      renderStageSection(box, siteId);
    };
    box.appendChild(fvBtn);
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
     opts: dup{정규화이름:true} 겹침 표시, del 빼기 모드, onRemove(name), onAdd(), onDelToggle(),
     picked[이름] 🚗 픽업한 사람, onPickup(name) 이 있으면 칩 끝에 [픽업] (사장님 11/8) */
  var CAR_SVG = '<svg class="pk-i" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 16V11l2-5h12l2 5v5M4 16h16M7 16v2M17 16v2"/><circle cx="8" cy="13" r=".6"/><circle cx="16" cy="13" r=".6"/></svg>';
  function pickupBtn(n, on, onPickup) {
    var b = document.createElement('button'); b.type = 'button'; b.className = 'chip-pk';
    b.innerHTML = CAR_SVG + '<span>픽업</span>';
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    b.title = on ? n + ' 픽업 풀기 — 다시 안내 문자가 갑니다' : n + ' 픽업 — 안내 문자 대신 사장님께 전화 알림';
    b.onclick = function (e) { e.stopPropagation(); onPickup(n); };
    return b;
  }
  function renderChips(container, names, opts) {
    container.innerHTML = '';
    var dup = (opts && opts.dup) || {};
    var del = !!(opts && opts.del);
    var picked = (opts && opts.picked) || [], onPickup = opts && opts.onPickup;
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
      } else if (onPickup) {                       // 번호가 없는 사람 + [픽업]
        c = document.createElement('span');
        c.className = 'chip call nophone' + (isDup ? ' dup' : '');
        var cnb = document.createElement('button'); cnb.type = 'button'; cnb.className = 'chip-nm';
        cnb.textContent = n + (isDup ? ' ⚠' : '');
        cnb.title = '연락처 없음 — 설정 › 팀원에서 번호를 넣으세요';
        cnb.onclick = function (e) { e.stopPropagation(); toast(n + ' 연락처가 없습니다 — 설정 › 팀원에서 번호를 넣으세요'); };
        c.appendChild(cnb);
      } else {                                     // 번호가 없는 사람
        c = document.createElement('button'); c.type = 'button';
        c.className = 'chip nophone' + (isDup ? ' dup' : '');
        c.textContent = n + (isDup ? ' ⚠' : '');
        c.title = '연락처 없음 — 설정 › 팀원에서 번호를 넣으세요';
        c.onclick = function (e) { e.stopPropagation(); toast(n + ' 연락처가 없습니다 — 설정 › 팀원에서 번호를 넣으세요'); };
      }
      if (!del && onPickup) {
        var pon = picked.indexOf(n) !== -1;
        c.appendChild(pickupBtn(n, pon, onPickup));
        if (pon) c.className += ' picked';
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
  // 💰 인건비 예산 (11/6): 현장에 하나. 참고용이라 문자를 막지 않는다 — 언제든 다시 고른다
  function laborBudgetRow(siteId, rerender) {
    var s = Store.getSite(siteId);
    var cur = Share.laborBudgetOf(s);
    var row = el2('div', 'rc-labor');
    var top = el2('div', 'rc-labor-row');
    top.appendChild(el2('span', 'day-label', '인건비 예산'));
    var sel = document.createElement('select'); sel.className = 'rc-labor-sel'; sel.setAttribute('aria-label', '인건비 예산');
    [0].concat(Share.LABOR_BUDGETS).forEach(function (v) {
      var o = document.createElement('option'); o.value = String(v); o.textContent = v ? v + '만원' : '미정';
      sel.appendChild(o);
    });
    if (cur && Share.LABOR_BUDGETS.indexOf(cur) < 0) {
      var keep = document.createElement('option'); keep.value = String(cur); keep.textContent = cur + '만원'; sel.appendChild(keep);
    }
    sel.value = String(cur);
    sel.onchange = function () { Store.updateSite(siteId, { laborBudget: parseInt(sel.value, 10) || 0 }); rerender(); };
    top.appendChild(sel);
    row.appendChild(top);
    row.appendChild(el2('div', 'hint rc-labor-ref', '참고: 배정 페이 합계 ' + Share.laborPaySum(s, state.settings.people) + '만 / 인건비 예산 ' + (cur ? cur + '만' : '미정')));
    return row;
  }
  // 지금 '빼기 모드'인 날짜 줄 (-1 = 없음). 한 번에 한 줄만, 화면을 다시 그리면 풀린다
  var staffDelDay = -1;
  // 현장 상세: 일차별 인원 구역. 날짜 자체는 시공날짜 칸(달력)에서 고른다 — 여기서는 인원만
  // 맨 위에 총 필요 인원을 정해두면 날마다 배치/필요(3/3)가 옆에 뜨고, 모자란 날은 빨갛게 나온다
  function renderDaysSection(box, siteId) {
    var s = Store.getSite(siteId); if (!s) return;
    box.innerHTML = '';
    var rerender = function () { renderDaysSection(box, siteId); };
    box.appendChild(laborBudgetRow(siteId, rerender));
    var ss = Share.staffStatus(s);
    // 날짜 줄 — 날마다 테두리로 감싸서 누가 어느 날인지 섞이지 않게 한다 (2026-09-26)
    s.days.forEach(function (d, i) {
      // 날마다 테두리 색을 돌려 쓴다 — 이름이 여러 줄로 흐를 때 어느 날 사람인지 색으로 갈린다
      var row = document.createElement('div'); row.className = 'sec-row day-row day-c' + (i % 6);
      var head = document.createElement('div'); head.className = 'day-head';
      var lb = document.createElement('span'); lb.className = 'day-label';
      if (d.date) fillDayLabel(lb, i, d.date); else lb.textContent = '날짜 없음';
      head.appendChild(lb);
      var selfLeft = Share.isIsoDate(d.date) && Share.dayPlanOf(s, d.date).selfHire ? Share.selfHireLeft(s, d.date).filter(function (x) { return x.iso === d.date; })[0] : null;
      head.appendChild(selfLeft ? el2('span', 'rc-self-badge', '직접 구인 · ' + selfLeft.left + '명 남음') : staffCountBadge(s, i, false));
      var chips = document.createElement('div'); chips.className = 'chips';
      var iso = Share.isIsoDate(d.date) ? d.date : '', picked = iso ? Share.pickupOf(s, iso) : [];
      renderChips(chips, d.staff, {
        del: staffDelDay === i,
        picked: picked,
        onPickup: iso ? function (n) {
          var cur = Store.getSite(siteId);
          Store.updateSite(siteId, Share.pickupPatch(cur, iso, n, Share.pickupOf(cur, iso).indexOf(n) === -1)); rerender();
        } : null,
        onRemove: function (n) { Store.removeStaff(siteId, i, n); rerender(); },
        onAdd: function () { staffDelDay = -1; openStaffPicker(siteId, i, rerender); },
        onDelToggle: function () { staffDelDay = (staffDelDay === i ? -1 : i); rerender(); }
      });
      row.appendChild(head); row.appendChild(chips);
      var pickNow = picked.filter(function (n) { return d.staff.indexOf(n) !== -1; });
      if (pickNow.length) row.appendChild(el2('div', 'pk-note', pickNow.join('·') + '님은 픽업 — 안내 문자 대신 사장님께 "전화하세요" 알림'));
      if (Share.isIsoDate(d.date)) row.appendChild(recruitBlock(s, d.date, rerender));
      box.appendChild(row);
    });
    if (s.days.some(function (d) { return Share.isIsoDate(d.date); })) box.appendChild(recruitAllBlock(s, rerender));
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
  /* ---------- 👥 인원 모집 (2026-11-01 사장님) ----------
     일차 칸마다 필요 인원·직접 구인 → '남은 자리 2명' → 📨 인원 모집 (11/6: 예산은 현장 하나, 참고용. 고른 사람에게만).
     문자는 n8n 인원모집 흐름(crew-recruit)이 사장님 폰(SMS Gateway)으로: 남은 자리 수만큼 순서대로, 2시간 답 없으면 한 번 더,
     '아니요'·무응답이면 다음 사람. '네' 는 텔레그램 [넣기] 를 누르면 우편함으로 이 앱 그날 인원에 들어온다 (kakao.js crewAdd).
     설계 songil docs/superpowers/specs/2026-11-01-인원모집-design.md */
  var CREW_URL = 'https://primary-production-a6fa.up.railway.app/webhook/crew-recruit';
  function crewPost(body) {
    return fetch(CREW_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (d) {
          if (!res.ok || !d.ok) throw new Error(d.error || ('HTTP ' + res.status));
          return d;
        });
      });
  }
  function ownerKeyOn() { try { return !!localStorage.getItem('ownerKey'); } catch (e) { return false; } }
  function recruitBlock(site, iso, rerender) {
    var wrap = el2('div', 'rc-box');
    var plan = Share.recruitPlan(site, iso, state.sites, state.settings);
    var setPlan = function (patch) {
      var cur = Store.getSite(site.id), dp = Object.assign({}, cur.dayPlan || {});
      dp[iso] = Object.assign({}, Share.dayPlanOf(cur, iso), patch);
      Store.updateSite(site.id, { dayPlan: dp }); rerender();
    };
    // ✋ 직접 구인 — 문자를 안 보내고 사장님이 구해서 채운다. 다 찰 때까지 결재함에 남는다
    var ck = document.createElement('label'); ck.className = 'rc-self';
    var box = document.createElement('input'); box.type = 'checkbox'; box.checked = plan.selfHire;
    box.onchange = function () { setPlan({ selfHire: box.checked }); };
    ck.appendChild(box); ck.appendChild(document.createTextNode('직접 구인'));
    wrap.appendChild(ck);
    // 이 날 필요 [− 3명 ＋]
    var money = el2('div', 'rc-money');
    money.appendChild(el2('span', 'rc-lab', '이 날 필요'));
    var step = el2('div', 'stepper');
    [['−', -1], ['＋', 1]].forEach(function (a, k) {
      var b = el2('button', 'step-btn', a[0]); b.type = 'button';
      b.onclick = function () { setPlan({ need: Math.max(0, plan.need + a[1]) }); };
      if (k === 1) step.appendChild(el2('div', 'step-val' + (plan.need ? '' : ' none'), plan.need ? plan.need + '명' : '미정'));
      step.appendChild(b);
    });
    money.appendChild(step);
    wrap.appendChild(money);
    if (plan.selfHire) wrap.appendChild(el2('div', 'rc-self-note', '이 날은 문자를 안 보냅니다. 직접 구해서 채워 주세요. 다 채울 때까지 결재함에 날마다 올라옵니다.'));
    if (!plan.need) return wrap;
    wrap.appendChild(el2('div', 'rc-left' + (plan.slots ? '' : ' ok'), '남은 자리 ' + plan.slots + '명' + (plan.slots ? '' : ' ✓')));
    if (plan.noPay.length) wrap.appendChild(el2('div', 'rc-warn', '일당 미입력: ' + plan.noPay.join('·') + ' — 예산 참고 합계에서 빠집니다'));
    return wrap;
  }
  // 📨 여러 날 한 번에 모집 (11/1 사장님) — 날짜 칸 위에 하나. 자리 남은 날 · 버튼 · 진행
  function recruitAllBlock(site, rerender) {
    var wrap = el2('div', 'rc-all');
    var isos = site.days.map(function (d) { return d.date; }).filter(Share.isIsoDate);
    var m = Share.recruitMulti(site, isos, state.sites, state.settings);
    wrap.appendChild(el2('div', 'rc-all-h', '인원 모집' + (m.days.length ? ' — 자리 남은 날' : '')));
    if (!m.days.length) wrap.appendChild(el2('div', 'rc-st', '날마다 필요 인원을 넣으면 남은 자리가 여기 보입니다 (직접 구인 날은 빠집니다)'));
    m.days.forEach(function (d) { wrap.appendChild(el2('div', 'rc-st', d.label + ' · ' + d.slots + '자리')); });
    var picks = Share.recruitPickOf(site, state.settings);
    var ord = el2('button', 'rc-order', '문자 보낼 사람 고르기 (' + picks.length + '명 선택됨' + ((site.recruitOrder || []).length ? ' · 이 현장만' : '') + ')');
    ord.type = 'button';
    ord.onclick = function () { openRecruitOrder(site.id, rerender); };
    wrap.appendChild(ord);
    if (picks.length) wrap.appendChild(el2('div', 'rc-picks', picks.map(function (n, i) { return (i + 1) + '. ' + n; }).join(' · ')));
    if (m.days.length) {
      var go = el2('button', 'rc-go', picks.length ? '모집 시작' : '문자 보낼 사람을 먼저 골라 주세요'); go.type = 'button';
      go.disabled = !picks.length;
      go.onclick = function () { startRecruit(site.id, rerender); };
      wrap.appendChild(go);
    }
    var prog = el2('div', 'rc-prog');
    wrap.appendChild(prog);
    paintRecruitStatus(prog, site.id, rerender);
    return wrap;
  }
  function startRecruit(siteId, rerender) {
    var site = Store.getSite(siteId);
    if (!ownerKeyOn()) { toast('이 기기는 사장님 열쇠가 없어 모집 문자를 보낼 수 없어요'); return; }
    var all = Share.recruitMulti(site, site.days.map(function (d) { return d.date; }).filter(Share.isIsoDate), state.sites, state.settings);
    var picked = all.days.map(function (d) { return d.iso; });
    var html = all.days.map(function (d, i) {
      return '<label class="rc-ck"><input type="checkbox" data-i="' + i + '" checked> ' + esc(d.label) +
        '<span class="rc-ck-r">' + d.slots + '자리</span></label>';
    }).join('') + '<div id="rcPreview"></div>';
    var cur = null;
    var paint = function () {
      cur = Share.recruitMulti(site, picked, state.sites, state.settings);
      var dd = function (ds) { return ds.map(function (iso) { return parseInt(iso.slice(8, 10), 10); }).join('·'); };
      var later = cur.queue.filter(function (c) { return !cur.first.some(function (f) { return f.name === c.name; }); });
      $('rcPreview').innerHTML = !picked.length ? '<p class="rc-warn">날짜를 하나 이상 고르세요</p>' : !cur.first.length
        ? '<p class="rc-warn">그 날에 물어볼 사람이 없습니다 — 문자 보낼 사람을 더 고르거나 직접 구해 주세요</p>'
        : '<div class="rc-pv-h">먼저 보낼 사람 (' + cur.first.length + '명)</div>' +
          cur.first.map(function (c, i) { return '<div class="rc-st">' + (i + 1) + '. ' + esc(c.name) + ' (' + c.pay + ')<span class="rc-t">' + dd(c.dates) + '일</span></div>'; }).join('') +
          (later.length ? '<p class="hint">대기: ' + esc(later.map(function (c) { return c.name + '(' + c.pay + ')'; }).join(' · ')) + ' — 거절·무응답마다 1명씩</p>' : '') +
          '<div class="rc-pv-h">보낼 문자 (사장님 폰에서)</div><div class="rc-pv">' + esc(Share.recruitAskText(picked)) + '</div>' +
          '<p class="hint">다음 사람에게는 아직 빈 날짜만 넣어서 보냅니다.</p>';
    };
    openModal('📨 여러 날 인원 모집', html, [
      { label: '취소', onClick: closeModal },
      { label: '보내기', cls: 'primary', onClick: function () {
        if (!picked.length || !cur.first.length) { toast('보낼 사람이 없어요'); return; }
        closeModal(); toast('보내는 중…');
        crewPost({ action: 'start', siteId: siteId, siteName: Share.titleLine(site), queue: cur.queue,
          days: cur.days.map(function (d) { return { date: d.iso, label: d.label, slots: d.slots, budget: 0, band: Share.buildRecruitText(site) }; }) })
          .then(function (d) { toast('📨 ' + (d.sent || 0) + '명에게 보냈어요 — 답은 텔레그램으로 옵니다'); rerender(); })
          .catch(function (e) { toast('❌ 못 보냈어요 (' + String(e.message || e).slice(0, 80) + ')'); });
      } }
    ]);
    $('modalBody').querySelectorAll('input[type=checkbox]').forEach(function (cb) {
      cb.onchange = function () {
        picked = all.days.filter(function (d, i) { var c = $('modalBody').querySelector('input[data-i="' + i + '"]'); return c && c.checked; }).map(function (d) { return d.iso; });
        paint();
      };
    });
    paint();
  }
  // 진행 상황 — '✅ 서영호 — 15·18일 넣음 / ❌ 이준호 안 됨 / ⏳ 박성민 — 15·16·18일 물음'
  var CREW_ST = { asked: '⏳', yes: '🙋', in: '✅', no: '❌', timeout: '⌛', skip: '➖' };
  var CREW_TXT = { asked: '물음', yes: '가능 — 텔레그램 [넣기] 기다림', in: '넣음', no: '안 됨', timeout: '답 없음', skip: '안 넣음' };
  function paintRecruitStatus(prog, siteId, rerender) {
    if (!ownerKeyOn()) return;
    var dd = function (ds) { return (ds || []).map(function (iso) { return parseInt(String(iso).slice(8, 10), 10); }).join('·'); };
    crewPost({ action: 'status', siteId: siteId }).then(function (d) {
      (d.recruits || []).slice(0, 3).forEach(function (r) {
        prog.appendChild(el2('div', 'rc-prog-h', (r.active ? '📨 모집 중' : '📨 모집 끝') + ' (' + (r.days || []).map(function (x) { return x.label; }).join('·') + ')'));
        (r.people || []).filter(function (p) { return p.st !== 'wait'; }).forEach(function (p) {
          var t = (p.at ? new Date(p.at).toTimeString().slice(0, 5) : '');
          var ds = p.st === 'in' ? dd(p.in) + '일 ' : p.st === 'asked' || p.st === 'yes' ? dd(p.asked) + '일 ' : '';
          var line = el2('div', 'rc-st', (CREW_ST[p.st] || '·') + ' ' + p.name + ' — ' + ds + (CREW_TXT[p.st] || p.st) +
            (p.st === 'yes' && (p.in || []).length ? ' (' + dd(p.in) + '일 넣음)' : '') + (p.st === 'asked' && p.tries > 1 ? ' (2번째)' : ''));
          if (t) line.appendChild(el2('span', 'rc-t', t));
          prog.appendChild(line);
        });
        prog.appendChild(el2('div', 'rc-st rc-left-all', '남은 자리: ' + (r.days || []).map(function (x) {
          return parseInt(x.date.slice(8, 10), 10) + '일 ' + Math.max(0, x.slots - x.in) + (x.exhausted ? '(밴드)' : '');
        }).join(' · ')));
        if (r.active) {
          var stop = el2('button', 'rc-stop', '⏹ 모집 멈추기'); stop.type = 'button';
          stop.onclick = function () {
            modalConfirm('모집 멈추기', '이 모집을 멈춥니다. 더는 문자를 보내지 않습니다 (이미 보낸 사람의 답은 텔레그램으로 알림만).', '멈추기', true)
              .then(function (ok) {
                if (!ok) return;
                crewPost({ action: 'stop', siteId: siteId, id: r.id }).then(function () { toast('멈췄어요'); rerender(); })
                  .catch(function () { toast('못 멈췄어요 — 인터넷을 확인해 주세요'); });
              });
          };
          prog.appendChild(stop);
        }
      });
    }).catch(function () { /* 인터넷 없으면 진행 상황만 안 보임 */ });
  }
  // 🔢 이 현장에 문자 보낼 사람 — 처음엔 기본 명단. 저장하면 이 현장에서만
  function openRecruitOrder(siteId, rerender) {
    var site = Store.getSite(siteId);
    openRecruitPick('🔢 문자 보낼 사람 (이 현장)', Share.recruitPickOf(site, state.settings), function (order) {
      Store.updateSite(siteId, { recruitOrder: order }); rerender(); toast('이 현장에 문자 보낼 ' + order.length + '명을 저장했어요');
    }, [{ label: '기본 명단으로', onClick: function () { Store.updateSite(siteId, { recruitOrder: [] }); closeModal(); rerender(); toast('설정의 기본 명단을 씁니다'); } }]);
  }
  // 고르기 창 — 누른 순서가 문자 순서, 안 고른 사람에게는 안 간다 (사장님 11/6). 목록은 팀원 화면 정렬을 따른다
  function openRecruitPick(title, picked, onSave, extra) {
    var cfg = state.settings;
    var team = Share.teamSorted(cfg.team || [], cfg.people, { pay: !!cfg.teamSortPay, grade: !!cfg.teamSortGrade });
    openTapOrder(title, '문자를 먼저 보낼 사람부터 차례로 누르세요. 번호가 붙은 사람에게만 문자가 갑니다. 다시 누르면 빠집니다.',
      team.map(personOrderItem), onSave, extra, { only: true, picked: picked });
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
    box.innerHTML = '<h3 class="sec-title">AS·추가작업 접수 <span class="sec-hint">— 끝난 현장에 요청이 오면 여기에</span></h3>';
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
    box.innerHTML = '<h3 class="sec-title">현장 후기 <span class="sec-hint">— 다음 현장을 고치려고 남기는 기록</span></h3>';
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

  /* ---------- 📋 결재함 (2026-11-03 사장님, 목업 A안 + C안 카톡) ----------
     n8n 업무일정표가 오후 5시에 만든 '내일 업무일정표' (카톡 김정헌방 링크 #approve/날짜 로도 열림).
     항목마다 [진행해] [다음날로 연기] [내가할께] — 안 누르면 지금처럼. 필름 발주 [진행해]는 거래처·담당자를 고른다
     → 다음 날 9시 그 담당자에게 주문 문자. 인원 모집 [진행해] → 9시 여러 날 모집 시작. [내가할께] → 9시 그날 할 일로.
     설계 songil docs/superpowers/specs/2026-11-03-결재함-design.md */
  var REPORT_URL = 'https://primary-production-a6fa.up.railway.app/webhook/report';
  var apLast = null;   // 지금 그린 결재함 — 우편이 오면 다시 그린다
  var approvePending = 0;   // 결재 안 한 내일 항목 수 — 내 앱 패널 '📋 결재함 (3)'
  function reportPost(body) {
    return fetch(REPORT_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (d) {
          if (!res.ok || !d.ok) throw new Error(d.error || ('HTTP ' + res.status));
          return d;
        });
      });
  }
  var AP_ACT = { go: '진행해', later: '다음날로 연기', mine: '내가할께', done: '완료' };
  // 앱 기록으로 이미 끝난 카드 (2026-11-05) — 비서가 이미 처리한 결재는 그대로 둔다
  function apAutoDone(x, d) {
    var dec = (d.decisions || {})[x.id];
    if (dec && (dec.doneAt || dec.act === 'done')) return false;
    return Share.reportItemDone(x, d.rep.date || d.date, state.sites, state.settings, state.tasks);
  }
  // ⏸ 멈춘 ❓ 카드는 아직 남은 일로 센다 (11/6)
  function apDecided(x, d) {
    var dec = (d.decisions || {})[x.id];
    return !!dec && !(x.kind === 'ask' && dec.act === 'later');
  }
  function countPending(d) {
    var inbox = (d && d.inbox || []).length;   // 🤖 능동 비서 카드 (11/4)
    if (!d || !d.rep || d.date < Share.todayIso()) return inbox;
    return inbox + d.rep.next.filter(function (n) { return !apDecided(n, d) && !apAutoDone(n, d); }).length;
  }
  function refreshApproveCount() {
    if (!ownerKeyOn()) return;
    reportPost({ action: 'get' }).then(function (d) { approvePending = countPending(d); }).catch(function () { /* 다음에 */ });
  }
  function renderApprove(date) {
    var body = $('approveBody');
    if (!ownerKeyOn()) { body.innerHTML = '<p class="sec-empty">이 기기는 사장님 열쇠가 없어 결재함을 볼 수 없어요.</p>'; return; }
    body.innerHTML = '<p class="sec-empty">불러오는 중…</p>';
    reportPost({ action: 'get', date: date || '' }).then(paintApprove).catch(function (e) {
      body.innerHTML = '<p class="sec-empty">못 불러왔어요 — 인터넷을 확인해 주세요 (' + esc(String(e.message || e).slice(0, 60)) + ')</p>';
    });
  }
  // 결재함 업무 종류 — 순서·아이콘·이름, 버튼 4개
  var AP_ORDER = ['film', 'crew', 'selfhire', 'ask', 'as', 'pay', 'task', 'silicone', 'supply', 'stock', 'hold'];
  var AP_ICON = { selfhire: '✋', hello: '👋', review: '⭐', film: '🎞', crew: '👷', ask: '❓', as: '🔧', pay: '💰', task: '📝', silicone: '🧴', supply: '🧰', stock: '🚚', hold: '👥' };
  var AP_TITLE = { selfhire: '직접 구인', hello: '안부 인사', review: '고객 후기 문자', film: '필름 발주', crew: '인원 모집', ask: '출입정보 질문', as: 'AS 방문', pay: '잔금 받기', task: '할 일', silicone: '실리콘 준비', supply: '자재 챙기기', stock: '차 보충', hold: '인원 배정' };
  var AP_BTN = [['go', '▶', '진행해'], ['later', '⏭', '연기'], ['mine', '✋', '내가할께'], ['done', '✔', '완료']];
  // 3안 '오늘의 미션' (사장님 11/3: 산뜻하고 일할 맛 나게) — 남색 머리 + 경험치 막대, 큰 아이콘 미션 카드, 끝내면 CLEAR
  var AP_TILE = { selfhire: '#fef3c7', hello: '#fef9c3', review: '#fef9c3', film: '#ede9fe', crew: '#dcfce7', ask: '#ffedd5', as: '#fee2e2', pay: '#fef9c3', task: '#e0f2fe', silicone: '#f1f5f9', supply: '#f1f5f9', stock: '#f1f5f9', hold: '#dcfce7' };
  function paintApprove(d) {
    var body = $('approveBody'); body.innerHTML = '';
    apLast = d;
    if (d.none || !d.rep) {
      if ((d.inbox || []).length) { approvePending = countPending(d); apInbox(d, body); }
      body.appendChild(el2('p', 'sec-empty', '아직 업무일정표가 없습니다. 매일 오후 5시에 만들어집니다.'));
      var mk = el2('button', 'ap-all', '지금 만들어 보기'); mk.type = 'button';
      mk.onclick = function () { mk.disabled = true; reportPost({ action: 'make' }).then(function () { renderApprove(''); }).catch(function () { toast('못 만들었어요'); mk.disabled = false; }); };
      body.appendChild(mk);
      return;
    }
    if (d.reports && d.date === d.reports[0]) approvePending = countPending(d);
    var all = d.rep.next.length;
    var cleared = d.rep.next.filter(function (x) { return apDecided(x, d) || apAutoDone(x, d); }).length;
    // 머리 — 날짜 칩 · 미션 n개 중 m개 클리어 · 경험치 막대
    var hero = el2('div', 'ap-hero');
    var top = el2('div', 'ap-hero-row');
    top.appendChild(el2('b', '', '🎯 오늘의 미션'));
    var chips = el2('div', 'ap-dates');
    (d.reports || [d.date]).slice(0, 4).forEach(function (iso) {
      var c = el2('button', 'ap-date' + (iso === d.date ? ' on' : ''), Share.dayLabel(iso)); c.type = 'button';
      c.onclick = function () { go('#approve/' + iso); };
      chips.appendChild(c);
    });
    top.appendChild(chips);
    hero.appendChild(top);
    hero.appendChild(el2('div', 'ap-h1', !all ? '오늘은 미션이 없어요 😎' : cleared >= all ? '미션 ' + all + '개 모두 클리어! 🎉' : '미션 ' + all + '개 중 ' + cleared + '개 클리어!'));
    var xp = el2('div', 'ap-xp'), fill = el2('span');
    fill.style.width = (all ? Math.round(cleared / all * 100) : 100) + '%';
    xp.appendChild(fill); hero.appendChild(xp);
    hero.appendChild(el2('div', 'ap-cnt', all - cleared > 0 ? (all - cleared) + '개 남음 — 오늘도 끝까지 가 봅시다 🚀' : '수고하셨습니다! 내일 미션은 오후 5시에 와요 🙌'));
    body.appendChild(hero);
    apInbox(d, body);
    // 미션 카드 — 종류 순서대로
    var list = d.rep.next.slice().sort(function (a, b) { return AP_ORDER.indexOf(a.kind) - AP_ORDER.indexOf(b.kind); });
    list.forEach(function (x) { body.appendChild(apItem(x, (d.decisions || {})[x.id] || null, d)); });
    var rest = d.rep.next.filter(function (x) { return !(d.decisions || {})[x.id] && !apAutoDone(x, d) && x.act !== 'film' && x.kind !== 'hello' && x.kind !== 'selfhire'; });   // 안부 인사는 체크해야 나간다
    if (rest.length && d.date >= Share.todayIso()) {
      var allBtn = el2('button', 'ap-all', '▶ 남은 미션 모두 진행 (' + rest.length + ')'); allBtn.type = 'button';
      allBtn.title = '필름 발주는 담당자를 골라야 해서 빠집니다';
      allBtn.onclick = function () {
        allBtn.disabled = true;
        rest.reduce(function (p, x) { return p.then(function () { return reportPost({ action: 'decide', date: d.date, id: x.id, act: 'go' }); }); }, Promise.resolve())
          .then(function () { toast('모두 진행으로 결재했어요'); renderApprove(d.date); })
          .catch(function () { toast('일부를 못 했어요 — 다시 눌러 주세요'); renderApprove(d.date); });
      };
      body.appendChild(allBtn);
    }
    // 지난 결과 — 한 카드에 줄로
    var res = el2('div', 'ap-card ap-done');
    res.appendChild(el2('div', 'ap-kind', '✅ ' + Share.shortDate(d.rep.today) + ' 결과 ' + d.rep.done.length + '건'));
    if (!d.rep.done.length) res.appendChild(el2('div', 'ap-res', '기록된 결과가 없습니다'));
    d.rep.done.forEach(function (x) {
      var line = el2('div', 'ap-done-line');
      line.appendChild(el2('b', '', (AP_ICON[x.kind] || '✅') + ' ' + x.title));
      if (x.res) line.appendChild(el2('div', 'ap-res', x.res));
      res.appendChild(line);
    });
    body.appendChild(res);
    body.appendChild(el2('p', 'hint ap-hint', '❓ 출입정보 질문은 안 눌러도 오전 9시에 자동으로 나갑니다 (⏸ 멈춤을 누르면 안 나가고 날마다 다시 올라옴) · ▶ 진행해 = 오전 9시에 비서가 함(필름 발주·인원 모집) · ⏭ 연기 = 다음 보고서에 다시 · ✋ 내가 = 내가 마무리, 안 되면 다음 보고서에 다시 물음 · ✔ 완료 = 이미 끝남(앱에 반영). 나머지는 안 누르면 지금처럼.'));
    // 📤 카톡으로 보내기 (11/3 사장님) — 보고서를 지금 다시 만들어 노트북이 카톡 김정헌방에 (5분 안)
    var send = el2('div', 'ap-send');
    [['📤 오늘 할 일 보내기', Share.addDays(Share.todayIso(), -1)], ['📤 내일 일정표 보내기', '']].forEach(function (a) {
      var b = el2('button', 'ap-ib', a[0]); b.type = 'button';
      b.onclick = function () {
        b.disabled = true;
        reportPost({ action: 'make', base: a[1] }).then(function (r) {
          toast('📤 만들었어요 — 노트북이 5분 안에 카톡 김정헌방에 올립니다');
          renderApprove(r.date || '');
        }).catch(function () { toast('못 만들었어요 — 인터넷을 확인해 주세요'); b.disabled = false; });
      };
      send.appendChild(b);
    });
    body.appendChild(send);
  }
  // 🤖 능동 비서 카드 (사장님 11/4): 노트북 카톡 비서가 업체 글에서 받았는데 어느 현장인지 애매한 정보 · '잔금 넣었어요'.
  // 누르기만: 현장 고르기 → 우편함으로 그 현장 칸에 / 완료표시 → 잔금 받음 / 아님 → 버림 (업무일정표 inbox)
  function apInbox(d, body) {
    (d.inbox || []).forEach(function (x) {
      var it = el2('div', 'ap-card ap-mission ap-ai');
      var tile = el2('div', 'ap-tile', x.kind === 'pay' ? '💰' : /필름/.test(x.title) ? '🎞' : '🔑');
      tile.style.background = x.kind === 'pay' ? '#fef9c3' : '#e0e7ff';
      it.appendChild(tile);
      var bd = el2('div', 'ap-bd');
      bd.appendChild(el2('div', 'ap-kind', (x.kind === 'pay' ? '잔금' : '어느 현장?') + ' · 🤖 AI가 받은 정보'));
      bd.appendChild(el2('div', 'ap-name', x.room + (x.kind === 'pay' ? ' "' + x.title + '"' : ' — ' + x.title)));
      if (x.quote) bd.appendChild(el2('div', 'ap-res ap-quote', '"' + x.quote + '"'));
      if (x.kind === 'pay') bd.appendChild(el2('div', 'ap-res', x.name + ' 잔금 받은 걸로 할까요?'));
      var row = el2('div', 'ap-picks');
      var btn = function (label, cls, body2, msg) {
        var b = el2('button', 'ap-pick' + cls, label); b.type = 'button';
        b.onclick = function () {
          row.querySelectorAll('button').forEach(function (k) { k.disabled = true; });
          reportPost(Object.assign({ action: 'inbox', id: x.id }, body2)).then(function () { toast(msg); renderApprove(d.date || ''); })
            .catch(function (e) { toast('못 했어요 — ' + String(e.message || e).slice(0, 40)); renderApprove(d.date || ''); });
        };
        row.appendChild(b);
      };
      if (x.kind === 'pay') btn('✔ 완료표시', '', { act: 'done' }, '잔금 받음으로 표시했어요 — 앱을 다시 열면 반영돼요');
      else (x.cands || []).forEach(function (c) { btn(c.name + ' (' + Share.shortDate(c.date) + ')', '', { act: 'pick', siteId: c.id }, c.name + '에 넣었어요 — 앱을 다시 열면 들어가요'); });
      btn(x.kind === 'pay' ? '아직 안 들어옴' : '다 아님', ' no', { act: 'skip' }, '넘겼어요');
      bd.appendChild(row);
      it.appendChild(bd);
      body.appendChild(it);
    });
  }
  function apItem(x, dec, d) {
    var auto = apAutoDone(x, d);
    var cleared = (dec && dec.act === 'done') || auto;
    var it = el2('div', 'ap-card ap-mission' + (cleared ? ' is-clear' : ''));
    var tile = el2('div', 'ap-tile', AP_ICON[x.kind] || '📝');
    tile.style.background = cleared ? '#dcfce7' : (AP_TILE[x.kind] || '#f1f5f9');
    it.appendChild(tile);
    var bd = el2('div', 'ap-bd');
    var kind = el2('div', 'ap-kind', AP_TITLE[x.kind] || '할 일');
    if (x.again) kind.appendChild(el2('span', 'ap-again', '어제 내가할께 — 아직 안 됨'));
    bd.appendChild(kind);
    var hl = x.kind === 'hello' ? Share.helloList(state.sites, state.clients, Share.todayIso()) : null;
    var t = el2('div', 'ap-name', hl ? (hl.length ? '연락 뜸한 업체 ' + hl.length + '곳' : '지금은 안부 보낼 업체가 없어요') : x.title);
    if (x.siteId && Store.getSite(x.siteId)) { t.classList.add('ap-link'); t.onclick = function () { go('#site/' + x.siteId); }; }
    bd.appendChild(t);
    if (x.res) bd.appendChild(el2('div', 'ap-res', x.res));
    // ❓ 출입정보 질문: 누구에게·카톡/문자 (11/5) — [진행해] 로 고른 것, 아니면 정해 둔 것
    if (x.kind === 'ask') {
      // 노트북·결재함이 이미 물었으면 (11/6, 업무일정표 asked) — 누가·언제
      var was = d && d.asked && d.asked[x.siteId];
      if (was && Date.now() - (was.at || 0) < 7 * 864e5) {
        bd.appendChild(el2('div', 'ap-res ap-asked', '✔ 이미 물어봄 · ' + (was.by === '결재함' ? '결재함' : '노트북') + ' ' + (was.via === 'sms' ? '📨 문자' : '💬 카톡') +
          (was.who ? ' (' + was.who + ')' : '') + ' · ' + Share.shortDate(Share.todayIso(new Date(was.at))) + ' — 답을 기다리는 중'));
      }
      var who = dec && dec.to ? Share.askWho(dec.to) : Share.askWho(askTargetOf(x.siteId));
      var late = apAskNow(d);
      if (dec && dec.act === 'later') { bd.appendChild(el2('div', 'ap-res ap-who', '⏸ 멈춤 — 자동으로 보내지 않고 날마다 다시 올라와요 (보내려면 진행해)')); who = ''; }
      else
      bd.appendChild(el2('div', 'ap-res ap-who', who ? '→ ' + who + (dec && dec.to ? '' : late ? ' (진행해를 누르면 바로 보냅니다)' : ' · 9시에 자동으로 보냅니다 (진행해로 바꿀 수 있어요)') : '→ 물어볼 담당자가 없어요 — 거래처 담당자를 적어 주세요'));
    }
    it.appendChild(bd);
    if (cleared) {
      bd.appendChild(el2('div', 'ap-clear', '🎉 CLEAR' + (auto ? ' — 앱에 이미 반영됨' : x.kind === 'pay' ? ' — 잔금 받음' : ' — 완료')));
      if (auto) return it;   // 앱에서 끝낸 일 — 되돌리려면 그 현장에서 고친다
      var undo = el2('button', 'ap-undo', '되돌리기'); undo.type = 'button';
      undo.onclick = function () {
        modalConfirm('되돌리기', x.title + '\n\n완료를 취소하고, 완료로 앱에 들어간 기록도 되돌립니다.', '되돌리기').then(function (ok) { if (ok) decideApprove(d, x, ''); });
      };
      bd.appendChild(undo);
      return it;
    }
    if (dec && dec.doneAt) { bd.appendChild(el2('div', 'ap-stamp', '✔ ' + AP_ACT[dec.act] + ' — 처리함')); return it; }
    var btns = el2('div', 'ap-btns');
    if (hl) {
      var hlOpen = el2('button', 'ap-ib b-go'); hlOpen.type = 'button';
      hlOpen.appendChild(el2('i', '', '▶')); hlOpen.appendChild(document.createTextNode('목록 보기'));
      hlOpen.onclick = function () { openHello(function () { decideApprove(d, x, 'done'); }); };
      btns.appendChild(hlOpen);
    }
    // ✋ 직접 구인 — 다 채우면 저절로 CLEAR. 못 구하겠으면 문자 모집으로 돌린다
    if (x.kind === 'selfhire') {
      var open = el2('button', 'ap-ib b-go'); open.type = 'button';
      open.appendChild(el2('i', '', '▶')); open.appendChild(document.createTextNode('현장 열기'));
      open.onclick = function () { go('#site/' + x.siteId + '/staff'); };
      btns.appendChild(open);
      var toSms = el2('button', 'ap-ib b-later'); toSms.type = 'button';
      toSms.appendChild(el2('i', '', '📨')); toSms.appendChild(document.createTextNode('문자 모집으로'));
      toSms.onclick = function () {
        var cur = Store.getSite(x.siteId), iso = String(x.id).split(':')[2];
        if (!cur) { toast('이 기기에 그 현장이 없어요'); return; }
        var dp = Object.assign({}, cur.dayPlan || {});
        dp[iso] = Object.assign({}, Share.dayPlanOf(cur, iso), { selfHire: false });
        Store.updateSite(x.siteId, { dayPlan: dp });
        toast('이 날을 문자 모집으로 바꿨어요 — 현장에서 모집을 시작해 주세요');
        go('#site/' + x.siteId + '/staff');
      };
      btns.appendChild(toSms);
    } else
    AP_BTN.filter(function (a) { return !hl || a[0] === 'done'; }).forEach(function (a) {
      var on = dec && dec.act === a[0];
      var pause = x.kind === 'ask' && a[0] === 'later';   // ❓ 출입정보 질문은 자동으로 나가서 연기 대신 멈춤 (11/6)
      var label = pause ? '멈춤' : a[0] === 'go' && on && dec.to ? dec.to.label.split('·')[0] : a[0] === 'mine' ? '내가' : a[2];
      var b = el2('button', 'ap-ib b-' + a[0] + (on ? ' on' : '')); b.type = 'button';
      b.appendChild(el2('i', '', pause ? '⏸' : a[1])); b.appendChild(document.createTextNode(label));
      b.onclick = function () {
        if (on) return decideApprove(d, x, '');   // 다시 누르면 결재 취소
        if (a[0] === 'go' && x.act === 'film') return pickOrderContact(x).then(function (to) { if (to) decideApprove(d, x, 'go', to); });
        if (a[0] === 'go' && x.kind === 'ask') return pickAskTarget(x, d).then(function (to) { if (to) decideApprove(d, x, 'go', to); });
        if (a[0] === 'done') {
          return modalConfirm('✔ 완료표시', x.title + '\n\n이미 끝난 일로 표시합니다' + (x.kind === 'pay' ? ' (잔금 받음).' : '.') + ' 앱 기록에도 반영됩니다.', '완료').then(function (ok) { if (ok) decideApprove(d, x, 'done'); });
        }
        decideApprove(d, x, a[0]);
      };
      btns.appendChild(b);
    });
    bd.appendChild(btns);
    return it;
  }
  /* 👋 안부 인사 (2026-11-05 사장님): 목록에서 체크한 업체에만. 카톡방이 있으면 카톡(노트북), 없으면 담당자 번호로 문자.
     답은 비서 대화에 뜬다 — 카톡은 7일 동안 그 방을 지켜보고(vendor), 문자는 번호를 기억한다. 설계 songil docs/superpowers/specs/2026-11-05-안부인사-design.md */
  function openHello(onSent) {
    var today = Share.todayIso();
    var rows = Share.helloList(state.sites, state.clients, today).map(function (r) {
      return Object.assign(r, { room: BossChat.clientRooms(Store.getClient(r.clientId))[0] || '' });
    });
    var off = state.clients.filter(function (c) { return c && c.helloOff; });
    var html = !rows.length ? '<p class="sec-empty">지금은 안부 보낼 업체가 없어요.</p>' :
      '<div class="hl-head"><b>체크한 곳에만 보냅니다</b><button type="button" id="hlAll" class="hl-link">모두 체크</button></div>' +
      rows.map(function (r, i) {
        var can = r.room || r.phone.length >= 9;
        return '<div class="hl-row"><label class="hl-ck"><input type="checkbox" data-i="' + i + '"' + (can ? '' : ' disabled') + '><span>' +
          '<b>' + esc(r.name) + (r.who ? ' · ' + esc(r.who) : '') + '</b><small>마지막 현장 ' + esc(r.site) + ' · ' + Share.shortDate(r.last) + ' (' + r.days + '일 전)</small>' +
          '<i class="hl-tag' + (r.room ? '' : can ? ' sms' : ' warn') + '">' + (r.room ? '💬 카톡 · ' + esc(r.room) : can ? '📨 문자 · 카톡방 없음' : '카톡방·번호 없음') + '</i>' +
          (r.helloAt ? '<i class="hl-tag warn">지난 안부 ' + Share.shortDate(r.helloAt) + '</i>' : '') + '</span></label>' +
          '<button type="button" class="hl-link hl-off" data-off="' + esc(r.clientId) + '">안 보냄</button></div>';
      }).join('') +
      '<label class="field-label" for="hlText" style="margin-top:12px">보낼 글 — {이름} 은 담당자 이름으로 바뀝니다</label><textarea id="hlText" rows="5" style="width:100%;font-size:15px"></textarea>' +
      '<p class="hint">카톡은 노트북이 한 곳씩 보냅니다. 밤(저녁 8시~아침 9시)에는 보내지 않아요.</p>';
    if (off.length) html += '<p class="hint hl-offs">안 보내는 업체: ' + off.map(function (c) { return '<button type="button" class="hl-link" data-on="' + esc(c.id) + '">' + esc(c.name) + ' 되돌리기</button>'; }).join(' ') + '</p>';
    var picked = function () { return rows.filter(function (r, i) { var c = $('modalBody').querySelector('input[data-i="' + i + '"]'); return c && c.checked; }); };
    openModal('👋 안부 인사', html, [
      { label: '닫기', onClick: closeModal },
      { label: '체크한 곳에 보내기', cls: 'primary', onClick: function () {
        var list = picked(), hour = new Date().getHours();
        if (!list.length) { toast('보낼 업체를 체크해 주세요'); return; }
        if (hour < 9 || hour >= 20) { toast('밤에는 안 보내요 — 아침 9시 이후에 보내 주세요'); return; }
        var text = String($('hlText').value || '').trim();
        if (!text) { toast('보낼 글이 비어 있어요'); return; }
        closeModal(); toast('보내는 중…');
        Promise.all(list.map(function (r) { return helloSend(r, Share.helloText(text, r), today); })).then(function (rs) {
          var okList = rs.filter(function (x) { return x.ok; }), bad = rs.filter(function (x) { return !x.ok; });
          okList.forEach(function (x) { Store.updateClient(x.row.clientId, { helloAt: today }); });
          chatAdd({ role: 'ai', text: '👋 안부 인사', cards: rs.map(function (x) { return x.ok ? { ok: true, text: (x.row.room ? '💬 ' + x.row.room + ' 방에 맡김 — 노트북이 곧 보내요' : '📨 ' + (x.row.who || x.row.name) + '님께 문자 보냄') } : { ok: false, text: '⚠️ ' + x.row.name + ' 못 보냄 (' + x.why + ')' }; }) });
          if (okList.length) workLog(okList.map(function (x) { return { src: 'me', kind: x.row.room ? 'reply' : 'sms', title: x.row.name + ' 안부 인사', detail: x.row.room || (x.row.who || '') }; }));
          toast(bad.length ? '⚠️ ' + bad.length + '곳은 못 보냈어요 — 비서 대화를 봐 주세요' : '✅ ' + okList.length + '곳에 안부를 보냈어요');
          if (okList.length && onSent) onSent();
        });
      } }
    ]);
    if ($('hlText')) $('hlText').value = Share.HELLO_TEXT;
    var body = $('modalBody');
    if ($('hlAll')) $('hlAll').onclick = function () {
      var boxes = [].slice.call(body.querySelectorAll('input[data-i]:not(:disabled)')), on = boxes.some(function (c) { return !c.checked; });
      boxes.forEach(function (c) { c.checked = on; });
      this.textContent = on ? '모두 끄기' : '모두 체크';
    };
    [].forEach.call(body.querySelectorAll('[data-off]'), function (b) { b.onclick = function () { Store.updateClient(b.getAttribute('data-off'), { helloOff: true }); closeModal(); openHello(onSent); }; });
    [].forEach.call(body.querySelectorAll('[data-on]'), function (b) { b.onclick = function () { Store.updateClient(b.getAttribute('data-on'), { helloOff: false }); closeModal(); openHello(onSent); }; });
  }
  function helloSend(r, text, today) {
    var fail = function (e) { return { ok: false, row: r, why: String(e && e.message || e).slice(0, 60) }; };
    if (r.room) {
      var id = 'h' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      return kakaoPost({ action: 'add', id: id, room: r.room, client: '', text: text, watch: { siteId: '', name: r.name, until: Share.addDays(today, 7), keys: [], vendor: true } })
        .then(function () { return { ok: true, row: r }; }).catch(fail);
    }
    var key = '';
    try { key = localStorage.getItem('ownerKey') || ''; } catch (e) { /* 저장소 막힘 */ }
    return fetch(ORDER_URL, { method: 'POST', headers: { 'content-type': 'application/json', 'x-owner-key': key },
      body: JSON.stringify({ siteId: '-', name: '안부 인사', text: text, sendTo: { label: r.who || r.name, phone: r.phone } }) })
      .then(function (res) { return res.json().catch(function () { return {}; }).then(function (d) {
        if (!res.ok || !d.ok) throw new Error(d.error || 'HTTP ' + res.status);
        smsReplyWatch(r.phone, r.who || r.name, '-', r.name, false, []);
        return { ok: true, row: r };
      }); }).catch(fail);
  }
  function decideApprove(d, x, act, to) {
    reportPost({ action: 'decide', date: d.date, id: x.id, act: act, to: to || null })
      .then(function (r) {
        paintApprove(r);
        toast(act === 'later' && x.kind === 'ask' ? '⏸ 멈춤 — 안 보내고, 다음 보고서에 다시 올려요' : act ? AP_ACT[act] + ' — ' + x.title : '결재를 취소했어요');
        // 완료·되돌리기는 우편함을 거쳐 앱에 들어간다 — 5분을 기다리지 않고 바로 받아 온다
        if (act === 'done' || !act) { setTimeout(takeFills, 1500); setTimeout(takeFills, 4000); }
      })
      .catch(function (e) { toast('❌ ' + String(e.message || e).slice(0, 60)); });
  }
  // ❓ 출입정보 질문 [진행해] — 누구에게·카톡/문자 (정해 둔 것이 맨 위). 9시에 이대로 번호 질문을 보낸다 (빈칸 + 업체 확인 질문)
  function askTargetOf(siteId) {
    var s = Store.getSite(siteId);
    return s ? Share.askTarget(s, Store.getClient(s.clientId)) : null;
  }
  // 오늘 카드이고 9시가 지났으면 [진행해] 가 바로 나간다 (11/6)
  function apAskNow(d) { return !!d && d.date === Share.todayIso() && new Date().getHours() >= 9; }
  function pickAskTarget(x, d) {
    var s = Store.getSite(x.siteId);
    if (!s) { toast('이 기기에 그 현장이 없어요'); return Promise.resolve(null); }
    var items = Share.askChoices(s, Store.getClient(s.clientId));
    if (!items.length) { toast('물어볼 담당자가 없어요 — 거래처 화면 담당자에 번호나 카톡방 이름을 적어 주세요'); return Promise.resolve(null); }
    var q = Share.askQuestion(s, state.settings);
    return new Promise(function (resolve) {
      openModal('❓ 누구에게 물을까요? (' + (apAskNow(d) ? '바로 보냄' : '9시에 보냄') + ')', '<div class="sheet-list">' + items.map(function (it, i) {
        return '<button data-i="' + i + '">' + esc(it.label) + '</button>';
      }).join('') + '</div>' + (q ? '<div class="hint" style="margin:10px 0 4px">보낼 질문 (빈칸 + 업체 확인 질문)</div><div class="rc-pv">' + esc(q) + '</div>' : ''),
      [{ label: '닫기', onClick: function () { closeModal(); resolve(null); } }]);
      $('modalBody').querySelectorAll('.sheet-list button').forEach(function (b) {
        b.onclick = function () { closeModal(); var v = items[+b.dataset.i].value; resolve(Object.assign({}, v, { label: Share.askWho(v) })); };
      });
    });
  }
  // 필름 발주 [진행해] — 설정 › 필름 거래처의 담당자 중 번호 있는 사람
  function pickOrderContact(x) {
    var items = [];
    Share.filmVendors(state.settings).forEach(function (v) {
      (v.people || []).forEach(function (p) {
        if (p.phone) items.push({ label: v.name + ' · ' + (p.name || '담당자') + ' (' + p.phone + ')', value: { label: v.name + '·' + (p.name || '담당자'), phone: p.phone } });
      });
    });
    if (!items.length) { toast('설정 › 현장준비 › 필름 거래처에 담당자 번호가 없어요'); return Promise.resolve(null); }
    return modalSheet('📨 어디에 주문할까요? (내일 9시 문자)', items);
  }
  $('btnApproveBack').onclick = function () { go(''); };
  // 내 앱 패널 맨 위 '이 앱에서' — 📋 결재함 (결재 안 한 수)
  (window.AppSwitcherActions = window.AppSwitcherActions || []).push({
    icon: '📋', get name() { return '결재함' + (approvePending ? ' (' + approvePending + ')' : ''); },
    onClick: function () { go('#approve'); }
  });

  /* ---------- 📝 업무지시 보드 (2026-11-04 사장님) ----------
     통화로 들은 현장 정보를 카톡방 대신 여기에 쓴다: '류춘화 미래타운 세대비번 2222 로 바뀜'.
     n8n 카톡_비서(mode boss)가 어느 현장·어느 칸인지 맞추고, 확실하면 이 앱이 바로 칸을 바꾼다 (전 값은 남겨 [되돌리기]).
     애매하면 후보 현장 버튼, 못 찾으면 다시 써 달라고. 처리 내역은 이 기기에 최근 100건 (orderBoard).
     범위: 비번·화장실·필름·잔금 (현장 정보만). 설계 songil docs/superpowers/specs/2026-11-04-업무지시보드-design.md */
  var ASSIST_URL = 'https://primary-production-a6fa.up.railway.app/webhook/kakao-assist';
  var ORDER_KEY = 'orderBoard', orderBusy = false;
  function orderList() { try { return JSON.parse(localStorage.getItem(ORDER_KEY) || '[]'); } catch (e) { return []; } }
  function orderSave(list) { try { localStorage.setItem(ORDER_KEY, JSON.stringify(list.slice(0, 100))); } catch (e) { /* 저장소 막힘 */ } }
  function orderPatch(id, patch) { orderSave(orderList().map(function (o) { return o.id === id ? Object.assign({}, o, patch) : o; })); }
  // 작업자 배정 (11/4): add 넣기 / set 이 사람들로 바꾸기 / remove 빼기 — f.date 가 있으면 그날만, 없으면 모든 날.
  // 바뀌는 게 없으면 null (이미 배정됨). 그 날짜가 현장에 없으면 { nodate }
  function staffPatch(s, f) {
    var days = (s.days || []).map(function (d) { return { date: d.date, staff: (d.staff || []).slice() }; });
    var hit = days.filter(function (d) { return !f.date || d.date === f.date; });
    if (!hit.length) return { nodate: true };
    hit.forEach(function (d) {
      if (f.mode === 'set') d.staff = f.names.slice();
      else if (f.mode === 'remove') d.staff = d.staff.filter(function (n) { return f.names.indexOf(n) === -1; });
      else f.names.forEach(function (n) { if (d.staff.indexOf(n) === -1) d.staff.push(n); });
    });
    return JSON.stringify(days) === JSON.stringify((s.days || []).map(function (d) { return { date: d.date, staff: d.staff || [] }; })) ? null : { days: days };
  }
  // 한 칸 바꾸기 — 바꾸기 전 값을 돌려준다 (되돌리기용). 현장이 이 기기에 없으면 null.
  // 바뀌는 게 없으면 prev.same (이미 그렇게 돼 있음 — 작업자 이미 배정 등), 날짜가 없으면 prev.nodate
  function orderApply(f, siteId) {
    var s = Store.getSite(siteId);
    if (!s) return null;
    var key = f.kind === 'films' ? 'films' : f.kind === 'pay' ? 'payDone' : f.kind === 'staff' ? 'days' : f.field;
    var prev = { key: key, value: s[key] == null ? '' : JSON.parse(JSON.stringify(s[key])), src: (s.fieldSrc || {})[key] || '' };
    var by = '업무비서 ' + Share.shortDate(Share.todayIso());
    var p = f.kind === 'pay' ? (s.payDone ? null : { payDone: Share.todayIso() })
      : f.kind === 'staff' ? staffPatch(s, f) : Kakao.fillPatch(s, f, by);
    if (p && p.nodate) return Object.assign(prev, { nodate: true });
    if (!p) return Object.assign(prev, { same: true });
    Store.updateSite(s.id, p);
    return prev;
  }
  /* 👷 작업자가 바뀌면 그 사람에게 현장 기본정보 문자 (11/4 사장님: 작업자가 바뀌면 현장주소는 당연히 보내야).
     팀원 공유 문구(고객·발주처 번호는 빼고) + 📍 주소. 번호는 설정 › 팀원 연락처(people). 사장님 폰(SMS Gateway)으로 —
     필름 📨 바로 주문과 같은 길(n8n 카톡_버튼 film-order sendTo). 지시에 '문자·보내' 가 있으면 묻지 않고 바로 */
  function workerInfoText(s) { return Share.workerInfoText(s); }
  function workerPhone(name) { var p = (state.settings.people || {})[name]; return Share.phoneDigits((p && p.phone) || ''); }
  // 받는 사람 번호: 팀원 연락처 → 없으면 업체 연락처(거래처 담당자·현장 발주처 담당자, '지인인테리어 김사장') (11/4)
  function anyPhone(name) {
    var p = workerPhone(name);
    if (p) return p;
    var hit = BossChat.contactBook({ clients: state.clients, sites: state.sites }).filter(function (c) { return c.name === String(name || '').replace(/\s+/g, ' ').trim(); })[0];
    return hit ? Share.phoneDigits(hit.phone) : '';
  }
  function sendWorkerInfo(siteId, names) {
    var s = Store.getSite(siteId);
    if (!s) return Promise.resolve([]);
    return smsTo(s.id, Share.titleLine(s), workerInfoText(s), names);
  }
  // 사장님 폰(SMS Gateway)으로 문자 — 사람마다 { name, ok, why }. siteId '-' = 현장 없는 문자 (🤖 비서, 11/4)
  function smsTo(siteId, title, text, names) {
    var key = '';
    try { key = localStorage.getItem('ownerKey') || ''; } catch (e) { /* 저장소 막힘 */ }
    return Promise.all(names.map(function (n) {
      var phone = anyPhone(n);
      if (!phone) return { name: n, ok: false, why: '번호 없음 (설정 › 팀원 연락처 또는 거래처 연락처)' };
      return fetch(ORDER_URL, { method: 'POST', headers: { 'content-type': 'application/json', 'x-owner-key': key },
        body: JSON.stringify({ siteId: siteId, name: title, text: text, sendTo: { label: n, phone: phone } }) })
        .then(function (res) { return res.json().catch(function () { return {}; }).then(function (d) {
          if (res.ok && d.ok) smsReplyWatch(phone, n, siteId, title, (state.settings.team || []).indexOf(n) === -1, []);
          return { name: n, ok: res.ok && !!d.ok, why: d.error || (res.ok ? '' : 'HTTP ' + res.status), id: d.id || '', state: d.state || '' }; }); })
        .catch(function (e) { return { name: n, ok: false, why: String(e.message || e).slice(0, 60) }; });
    }));
  }
  function workerSendResult(id, rs) {
    if (!rs.length) return;
    orderPatch(id, { sms: rs.map(function (r) { return { name: r.name, ok: r.ok, why: r.why || '' }; }) });
    var bad = rs.filter(function (r) { return !r.ok; });
    toast(bad.length ? '📨 ' + bad.map(function (r) { return r.name + ' 못 보냄 (' + r.why + ')'; }).join(', ')
      : '📨 ' + rs.map(function (r) { return r.name; }).join(', ') + '님께 현장 정보 문자를 보냈어요');
    if (!$('viewOrder').hidden) renderOrder();
  }
  // 작업자 처리된 카드 → 새로 들어간 사람에게 문자 (바로 또는 물어보고)
  function offerWorkerInfo(o, direct) {
    var names = o.f.mode === 'remove' ? [] : o.f.names;
    if (!names.length || !Store.getSite(o.siteId)) return;
    if (direct) { sendWorkerInfo(o.siteId, names).then(function (rs) { workerSendResult(o.id, rs); }); return; }
    var s = Store.getSite(o.siteId), miss = names.filter(function (n) { return !workerPhone(n); });
    openModal('👷 현장 정보 문자 보낼까요?', '<p class="hint" style="margin:0 0 6px">' + esc(names.join(', ')) + '님께 사장님 폰으로 보냅니다' +
      (miss.length ? ' — <b>' + esc(miss.join(', ')) + '</b> 번호가 없어요 (설정 › 팀원 연락처)' : '') + '</p><div class="rc-pv">' + esc(workerInfoText(s)) + '</div>', [
      { label: '안 보냄', onClick: function () { closeModal(); } },
      { label: '📨 보내기', cls: 'primary', onClick: function () { closeModal(); sendWorkerInfo(o.siteId, names).then(function (rs) { workerSendResult(o.id, rs); }); } }
    ]);
  }
  function orderStateOf(prev) { return !prev ? 'nosite' : prev.nodate ? 'nodate' : prev.same ? 'same' : 'done'; }
  function orderUndo(o) {
    var s = Store.getSite(o.siteId);
    if (!s || !o.prev) { toast('이 기기에 그 현장이 없어요'); return; }
    var p = {}; p[o.prev.key] = o.prev.value;
    if (o.prev.key !== 'payDone' && o.prev.key !== 'days') { var src = Object.assign({}, s.fieldSrc || {}); if (o.prev.src) src[o.prev.key] = o.prev.src; else delete src[o.prev.key]; p.fieldSrc = src; }
    Store.updateSite(s.id, p);
    orderPatch(o.id, { state: 'undone' });
    toast('↩ 되돌렸어요 — ' + o.siteName);
    renderOrder();
  }
  function orderValue(f) {
    if (f.kind === 'films') return (f.films || []).map(function (x) { return (Share.placeLine(x.place) + ' ' + x.code).trim(); }).join(', ');
    if (f.kind === 'pay') return '잔금 받음';
    if (f.kind === 'staff') return (f.mode === 'remove' ? '빼기 ' : f.mode === 'add' ? '+ ' : '') + f.names.join(', ') + (f.date ? ' (' + Share.shortDate(f.date) + ')' : '');
    return f.value;
  }
  function orderPrevText(prev) {
    if (!prev) return '';
    if (prev.key === 'films') return (prev.value || []).filter(function (x) { return x && x.code; }).map(function (x) { return (Share.placeLine(x.place) + ' ' + x.code).trim(); }).join(', ');
    if (prev.key === 'payDone') return prev.value ? '이미 받음' : '안 받음';
    if (prev.key === 'days') return (prev.value || []).map(function (d) { return (d.date ? Share.shortDate(d.date) + ' ' : '') + ((d.staff || []).join(',') || '없음'); }).join(' / ');
    return String(prev.value || '');
  }
  /* 🤖 대화형 비서 (2026-11-04 사장님: 계산기 말고 저랑 대화하듯 일처리) — 채팅으로 시키고 묻는다.
     AI(n8n kakao-chat)가 할 일을 고르면 앱이 실제로 하고, 결과를 돌려줘 답을 쓰게 한다 (BossChat.run).
     카드는 AI 말이 아니라 실제 결과로 그린다. 4명 이상 받는 문자는 [보내] 를 눌러야 나간다. 대화는 이 기기에 최근 200개.
     설계 songil docs/superpowers/specs/2026-11-04-대화형비서-design.md */
  var CHAT_URL = 'https://primary-production-a6fa.up.railway.app/webhook/kakao-chat';
  var CHAT_KEY = 'bossChat', chatBusy = false;
  var CHAT_LABEL = { pwLobby: '공동현관 비번', pwUnit: '세대 비번', toilet: '화장실' };
  function chatList() { try { return JSON.parse(localStorage.getItem(CHAT_KEY) || '[]'); } catch (e) { return []; } }
  function chatSave(list) { try { localStorage.setItem(CHAT_KEY, JSON.stringify(list.slice(-200))); } catch (e) { /* 저장소 막힘 */ } }
  function chatAdd(m) {
    var list = chatList();
    m.id = 'm' + Date.now().toString(36) + list.length;
    m.at = new Date().toISOString();
    list.push(m);
    chatSave(list);
    return m;
  }
  function chatPatch(id, patch) { chatSave(chatList().map(function (m) { return m.id === id ? Object.assign({}, m, patch) : m; })); }
  function chatUndoable() {
    var out = [];
    chatList().slice(-30).forEach(function (m) { (m.cards || []).forEach(function (c) { if (c.undoId && !c.undone) out.push({ id: c.undoId, text: c.text }); }); });
    return out.slice(-10);
  }
  function chatContext() {
    var today = Share.todayIso(), todo = [];
    try { todo = Share.dailyReport(state.sites, state.settings, state.tasks, today).next; } catch (e) { /* 일정표 없이도 대화는 된다 */ }
    return BossChat.buildContext({ today: today, clients: state.clients, sites: state.sites, settings: state.settings, tasks: state.tasks, todo: todo, undo: chatUndoable() });
  }
  function chatAsk(history) {
    var key = '';
    try { key = localStorage.getItem('ownerKey') || ''; } catch (e) { /* 저장소 막힘 */ }
    return fetch(CHAT_URL, { method: 'POST', headers: { 'content-type': 'application/json', 'x-owner-key': key },
      body: JSON.stringify({ history: history, context: chatContext() }) })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (d) {
          if (!res.ok) throw new Error(d.message || ('HTTP ' + res.status));
          return d;
        });
      });
  }
  function chatUndoId() { return 'u' + Date.now().toString(36) + Math.floor(Math.random() * 1000); }
  // 칸 바꾸기 한 건 (비번·필름·잔금·작업자) — 전 값을 남겨 되돌릴 수 있게
  function chatApply(f, siteId, icon) {
    var s = Store.getSite(siteId);
    var name = s ? Share.titleLine(s) : '';
    var prev = orderApply(f, siteId);
    if (!prev) return { ok: false, why: '이 기기에 그 현장이 없어요' };
    if (prev.nodate) return { ok: false, why: name + ': ' + Share.shortDate(f.date) + ' 은 시공 날짜가 아니에요' };
    if (prev.same) return { ok: true, same: true, text: icon + ' ' + name + ': ' + sameText(f) };
    var was = orderPrevText(prev);
    // 내역에는 비번 값을 안 적는다
    var line = f.kind === 'staff' ? '작업자 ' + orderValue(f) : f.kind === 'pay' ? '잔금 받음' : f.label + ' 바꿈';
    return { ok: true, text: icon + ' ' + name + ' ' + f.label + ': ' + (was ? was + ' → ' : '') + orderValue(f), undoId: chatUndoId(), undo: { kind: 'site', siteId: siteId, prev: prev },
      logs: [{ kind: f.kind === 'staff' ? 'crew' : 'site', title: line, detail: name, siteId: siteId }] };
  }
  // 문자 (사장님 폰). 사람마다 결과 카드 하나
  /* 📨 문자가 폰에서 실제로 나갔나 (11/4): 앱 → n8n → SMS Gateway 서버 → 사장님 폰 → 문자. 서버가 받은 것(Pending)과
     폰이 보낸 것(Sent·Delivered)이 다르다. 카드는 진짜 상태로: 보내는 중 → 보냄/도착 · 2분 넘게 폰이 못 받으면 알려 준다.
     상태는 n8n 문자_상태(sms-status) 로 10초마다, 30분까지 본다 */
  /* 💬 카톡 보내기 (11/4 사장님: 문자는 가는데 왜 카톡은 안 돼) — 카톡은 노트북(카톡 읽기)만 보낼 수 있다.
     앱 → n8n 카톡_보내기(kakao-send) 에 맡김 → 노트북이 30초~1분 안에 가져가 그 방에 보냄 → 결과를 n8n 에 → 앱 카드가 바뀜 */
  var KAKAO_SEND_URL = 'https://primary-production-a6fa.up.railway.app/webhook/kakao-send';
  function kakaoPost(body) {
    var key = '';
    try { key = localStorage.getItem('ownerKey') || ''; } catch (e) { /* 저장소 막힘 */ }
    return fetch(KAKAO_SEND_URL, { method: 'POST', headers: { 'content-type': 'application/json', 'x-owner-key': key }, body: JSON.stringify(body) })
      .then(function (res) { return res.json().catch(function () { return {}; }).then(function (d) { if (!res.ok || !d.ok) throw new Error(d.error || 'HTTP ' + res.status); return d; }); });
  }
  function kakaoCard(x) {
    var where = (x.room || x.client) + ' 방', c = { ok: x.state !== 'failed', kakao: x, sending: false };
    var min = Math.floor((Date.now() - x.at) / 60000);
    if (x.state === 'sent') c.text = '💬 ' + where + '에 카톡 보냄' + (x.doneAt ? ' (' + chatTime(x.doneAt) + ')' : '');
    // 30분 지나 안 보낸 것(노트북 꺼짐)은 텔레그램으로도 안 갔다 — 노트북이 보내다 실패한 것만 텔레그램에 글이 있다
    else if (x.state === 'failed') c.text = '⚠️ ' + where + ' 카톡 못 보냄 — ' + (x.why || '이유 모름') + (/30분/.test(x.why || '') ? ' 필요하면 다시 시켜 주세요' : ' (텔레그램에 글을 보냈어요)');
    else if (x.stale || (x.state === 'wait' && min >= 3)) { c.text = '⏳ ' + where + ' 카톡 — 노트북이 아직 안 가져갔어요 (' + min + '분째). 노트북 카톡 읽기 프로그램이 켜져 있는지 봐 주세요'; c.sending = true; }
    else { c.text = '💬 ' + where + '에 카톡 보내는 중… (노트북이 보내면 바뀌어요)'; c.sending = true; }
    return c;
  }
  function chatKakao(a) {
    var id = 'k' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    var text = String(a.text).trim().slice(0, 1500), client = String(a.client || '').trim(), room = String(a.room || '').trim();
    // 👤 개인고객 현장이면 그 고객 방으로, 이름이 정확히 같은 방에만, 답장은 시공일까지 지켜본다 (11/5)
    var site = a.siteId ? Store.getSite(a.siteId) : null, watch = null;
    if (site && Share.isPrivateClient(Store.getClient(site.clientId))) {
      room = room || customerRoom(site);
      if (!room) return Promise.resolve({ ok: false, why: '고객 이름이나 카톡방 이름이 없어요' });
      client = '';
      var days = (site.days || []).map(function (d) { return d.date; }).filter(Boolean).sort();
      watch = { siteId: site.id, name: Share.titleLine(site), until: days[days.length - 1] || site.date || '', keys: ['pwLobby', 'pwUnit', 'toilet'].filter(function (k) { return Share.isEmpty(site, k); }) };
    }
    if (!room && client) {   // 거래처에 적어 둔 방이 있으면 그 방으로 (없으면 노트북이 이름으로 찾는다)
      var kc = Store.clients().filter(function (c) { return c.name === client; })[0];
      if (kc) room = BossChat.clientRooms(kc)[0] || '';
    }
    return kakaoPost({ action: 'add', id: id, client: client, room: room, text: text, watch: watch }).then(function () {
      return { ok: true, state: 'wait', cards: [kakaoCard({ id: id, client: client, room: room, at: Date.now(), state: 'wait' })],
        logs: [{ kind: 'reply', title: (room || client) + ' 방 카톡 맡김', detail: text }] };
    }).catch(function (e) { return { ok: false, why: '카톡을 못 맡겼어요 (' + String(e.message || e).slice(0, 60) + ')' }; });
  }
  // 업체에 현장 빈칸 묻기 (11/5): 비서가 글을 지어 쓰지 않고, 텔레그램 [시작해] 와 똑같은 번호 매긴 질문 — 빈칸·업체 확인 질문·답 읽어 칸에 넣기·3시간 뒤 다시 묻기까지 노트북이 그대로
  function chatAskSite(a) {
    var s = Store.getSite(a.siteId), c = s && Store.getClient(s.clientId);
    if (!s || !c) return Promise.resolve({ ok: false, why: '그 현장을 못 찾았어요' });
    if (Share.isPrivateClient(c)) return Promise.resolve({ ok: false, why: '개인고객은 현장 화면의 [카톡으로]·[문자로] 로 물어봐 주세요' });
    if (!s.date) return Promise.resolve({ ok: false, why: '시공 날짜가 없어요. 날짜를 먼저 넣어 주세요' });
    var items = Share.siteAskItems(s, state.settings);
    if (!items.missing.length && !items.checks.length) return Promise.resolve({ ok: true, same: true, text: 'ℹ️ ' + Share.titleLine(s) + ': 물어볼 것이 없어요' });
    var id = 'k' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), room = BossChat.clientRooms(c)[0] || '';
    return kakaoPost({ action: 'add', id: id, client: c.name, room: room, text: '빈칸 묻기: ' + Share.titleLine(s),
      ask: { id: s.id, client: c.name, name: Share.titleLine(s), date: s.date, missing: items.missing, checks: items.checks } }).then(function () {
      return { ok: true, state: 'wait', cards: [kakaoCard({ id: id, client: c.name, room: room, at: Date.now(), state: 'wait' })],
        logs: [{ kind: 'reply', title: (room || c.name) + ' 방에 빈칸 묻기 맡김', detail: Share.titleLine(s), siteId: s.id }] };
    }).catch(function (e) { return { ok: false, why: '못 맡겼어요 (' + String(e.message || e).slice(0, 60) + ')' }; });
  }
  var kakaoWatchT = 0, kakaoWatchBusy = false;
  function kakaoWatch() {
    clearTimeout(kakaoWatchT);
    var ids = [];
    chatList().forEach(function (m) { (m.cards || []).forEach(function (c) { if (c.kakao && (c.kakao.state === 'wait' || c.kakao.state === 'taken') && Date.now() - c.kakao.at < 60 * 60000) ids.push(c.kakao.id); }); });
    if (!ids.length || kakaoWatchBusy) return;
    kakaoWatchBusy = true;
    kakaoPost({ action: 'status', ids: ids.slice(0, 30) }).then(function (d) {
      var st = {};
      (d.items || []).forEach(function (x) { st[x.id] = x; });
      var cur = chatList();
      cur.forEach(function (m) {
        m.cards = (m.cards || []).map(function (c) {
          if (!c.kakao) return c;
          var x = st[c.kakao.id], k = Object.assign({}, c.kakao);
          if (x && x.state && x.state !== 'unknown') {
            if (x.state !== k.state && (x.state === 'sent' || x.state === 'failed')) k.doneAt = Date.now();
            k.state = x.state; k.why = x.why || ''; k.stale = !!x.stale;
            if (x.room) k.room = x.room;
          }
          return Object.assign({}, c, kakaoCard(k));
        });
      });
      chatSave(cur);
      if (!$('viewOrder').hidden) renderChat();
    }).catch(function () { /* 다음에 */ }).then(function () { kakaoWatchBusy = false; kakaoWatchT = setTimeout(kakaoWatch, 10000); });
  }
  var SMS_STATUS_URL = 'https://primary-production-a6fa.up.railway.app/webhook/sms-status';
  var SMS_DONE = { Sent: 1, Delivered: 1, Failed: 1 };
  function smsCard(x) {
    var who = nim(x.name) + '께 ' + x.what, c = { ok: x.state !== 'Failed', sms: x, sending: false };
    var min = Math.floor((Date.now() - x.at) / 60000);
    if (x.state === 'Delivered') c.text = '📨 ' + who + ' 보냄 · 받는 폰에 도착 ✓' + (x.doneAt ? ' (' + chatTime(x.doneAt) + ')' : '');
    else if (x.state === 'Sent') c.text = '📨 ' + who + ' 보냄 · 폰에서 나감' + (x.doneAt ? ' (' + chatTime(x.doneAt) + ')' : '');
    else if (x.state === 'Failed') c.text = '⚠️ ' + x.name + ': 폰에서 못 보냈어요' + (x.error ? ' (' + x.error + ')' : '');
    else if (!x.id) c.text = '📨 ' + who + ' 보냄';   // 예전 기록 (상태 모름)
    else if (min >= 2) { c.text = '⏳ ' + who + ' — 폰이 아직 못 받았어요 (' + min + '분째). 폰의 SMS Gateway 앱이 켜져 있는지 봐 주세요'; c.sending = true; }
    else { c.text = '📨 ' + who + ' 보내는 중… (폰에서 나가면 바뀌어요)'; c.sending = true; }
    return c;
  }
  var smsWatchT = 0, smsWatchBusy = false;
  function smsWatch() {
    clearTimeout(smsWatchT);
    var list = chatList(), ids = [];
    list.forEach(function (m) { (m.cards || []).forEach(function (c) { if (c.sms && c.sms.id && !SMS_DONE[c.sms.state] && Date.now() - c.sms.at < 30 * 60000) ids.push(c.sms.id); }); });
    if (!ids.length || smsWatchBusy) return;
    var key = '';
    try { key = localStorage.getItem('ownerKey') || ''; } catch (e) { /* 저장소 막힘 */ }
    smsWatchBusy = true;
    fetch(SMS_STATUS_URL, { method: 'POST', headers: { 'content-type': 'application/json', 'x-owner-key': key }, body: JSON.stringify({ ids: ids.slice(0, 20) }) })
      .then(function (res) { return res.json(); })
      .then(function (d) {
        var st = {};
        (d.items || []).forEach(function (x) { st[x.id] = x; });
        var cur = chatList();
        cur.forEach(function (m) {
          m.cards = (m.cards || []).map(function (c) {
            if (!c.sms || !st[c.sms.id]) return c.sms ? smsCard(c.sms) : c;
            var x = st[c.sms.id], sms = Object.assign({}, c.sms);
            if (x.state && x.state !== 'Unknown' && x.state !== sms.state) { sms.state = x.state; if (SMS_DONE[x.state]) sms.doneAt = Date.now(); }
            if (x.error) sms.error = x.error;
            if (sms.state === 'Failed' && c.sms.state !== 'Failed') workLog([{ kind: 'sms', title: sms.name + '님 문자 못 보냄', detail: sms.error || '폰에서 실패', state: 'need' }]);
            return Object.assign({}, c, smsCard(sms));
          });
        });
        chatSave(cur);
        if (!$('viewOrder').hidden) renderChat();
      })
      .catch(function () { /* 다음에 다시 */ })
      .then(function () { smsWatchBusy = false; smsWatchT = setTimeout(smsWatch, 10000); });
  }
  function chatTime(at) {
    if (!at) return '';
    var d = new Date(at), today = Share.todayIso() === Share.todayIso(d);
    return (today ? '' : (d.getMonth() + 1) + '/' + d.getDate() + ' ') + (d.getHours() < 12 ? '오전 ' : '오후 ') + ((d.getHours() % 12) || 12) + ':' + ('0' + d.getMinutes()).slice(-2);
  }
  // '사장님' 처럼 이미 님이 붙은 이름에 또 붙이지 않는다 ('사장님님께', 11/4)
  function nim(n) { n = String(n || ''); return /님$/.test(n) ? n : n + '님'; }
  function chatSms(siteId, names, text, what) {
    var s = siteId ? Store.getSite(siteId) : null;
    return smsTo(s ? s.id : '-', s ? Share.titleLine(s) : '비서 문자', text, names).then(function (rs) {
      return {
        ok: rs.every(function (r) { return r.ok; }),
        partial: rs.some(function (r) { return r.ok; }),   // 일부만 나감 — 안 나간 걸로 말하면 안 된다
        // state Pending = 폰이 아직 안 받음 (사장님 11/4: 보냈다는데 엄청 늦게 옴) — 카드는 폰에서 실제로 나갈 때까지 '보내는 중'
        people: rs.map(function (r) { return { name: r.name, ok: r.ok, why: r.why || '', state: r.state || '' }; }),
        cards: rs.map(function (r) { return r.ok ? smsCard({ id: r.id, name: r.name, what: what, at: Date.now(), state: r.state || 'Pending' }) : { ok: false, text: '⚠️ ' + r.name + ': ' + r.why }; }),
        logs: rs.map(function (r) {
          var where = s ? Share.titleLine(s) : '';
          return r.ok ? { kind: 'sms', title: nim(r.name) + '께 ' + what, detail: where, siteId: s ? s.id : '' }
            : { kind: 'sms', title: nim(r.name) + ' 문자 못 보냄', detail: r.why, siteId: s ? s.id : '', state: 'need' };
        })
      };
    });
  }
  function chatExec(a) {
    if (a.tool === 'set_field') return Promise.resolve(chatApply({ kind: 'field', field: a.field, value: String(a.value).trim(), label: CHAT_LABEL[a.field] }, a.siteId, a.field === 'toilet' ? '🚻' : '🔑'));
    if (a.tool === 'set_films') return Promise.resolve(chatApply({ kind: 'films', films: a.films.filter(function (x) { return x && x.code; }), label: '필름' }, a.siteId, '🎞'));
    if (a.tool === 'mark_paid') return Promise.resolve(chatApply({ kind: 'pay', label: '잔금' }, a.siteId, '💰'));
    if (a.tool === 'set_film_vendor') {
      var fvs = Store.getSite(a.siteId), fvOn = a.on !== false;
      if (!fvs) return Promise.resolve({ ok: false, why: '이 기기에 그 현장이 없어요' });
      Store.updateSite(fvs.id, Share.filmVendorPatch(fvs, fvOn));
      return Promise.resolve({ ok: true, text: '🚚 ' + Share.titleLine(fvs) + (fvOn ? ': 필름은 업체가 가져옴 — 주문 알림 안 함' : ': 필름 직접 주문으로 되돌림') });
    }
    if (a.tool === 'set_staff') return Promise.resolve(chatApply({ kind: 'staff', names: a.names, mode: a.mode, date: /^\d{4}-\d{2}-\d{2}$/.test(a.date || '') ? a.date : '', label: '작업자' }, a.siteId, '👷'));
    if (a.tool === 'send_site_info') return chatSms(a.siteId, a.names, workerInfoText(Store.getSite(a.siteId)), '현장 정보 문자');
    if (a.tool === 'send_text') return chatSms(a.siteId, a.names, String(a.text).trim().slice(0, 1500), '문자');
    if (a.tool === 'send_kakao') return chatKakao(a);
    if (a.tool === 'ask_site') return chatAskSite(a);
    if (a.tool === 'save_phone') {
      var old = ((state.settings.people || {})[a.name] || {}).phone || '';
      Store.setSettings({ people: Share.mergePerson(state.settings.people, a.name, { phone: a.phone }) });
      return Promise.resolve({ ok: true, text: '📇 ' + a.name + '님 연락처 저장', undoId: chatUndoId(), undo: { kind: 'phone', name: a.name, prev: old }, logs: [{ kind: 'site', title: a.name + '님 연락처 저장' }] });
    }
    if (a.tool === 'add_task') {
      var date = /^\d{4}-\d{2}-\d{2}$/.test(a.date || '') ? a.date : Share.todayIso();
      var t = Store.addTask({ title: String(a.title).trim(), date: date });
      if (!t) return Promise.resolve({ ok: false, why: '할 일을 못 넣었어요' });
      return Promise.resolve({ ok: true, text: '📝 ' + Share.shortDate(date) + ' 할 일: ' + t.title, undoId: chatUndoId(), undo: { kind: 'task', id: t.id }, logs: [{ kind: 'site', title: '할 일 추가', detail: t.title }] });
    }
    if (a.tool === 'undo') return Promise.resolve(chatUndo(a.id));
    if (a.tool === 'find_sites') return Promise.resolve({ ok: true, data: BossChat.findSites(state.sites, state.clients, a.query) });
    return Promise.resolve({ ok: false, why: '비서가 할 줄 모르는 일이에요' });
  }
  function chatUndo(id) {
    var list = chatList(), hit = null;
    list.forEach(function (m) { (m.cards || []).forEach(function (c) { if (c.undoId === id) hit = c; }); });
    if (!hit || !hit.undo) return { ok: false, why: '되돌릴 내역을 못 찾았어요' };
    if (hit.undone) return { ok: true, same: true, text: '↩ 이미 되돌렸어요' };
    var u = hit.undo;
    if (u.kind === 'site') {
      var s = Store.getSite(u.siteId);
      if (!s) return { ok: false, why: '이 기기에 그 현장이 없어요' };
      var p = {}; p[u.prev.key] = u.prev.value;
      if (u.prev.key !== 'payDone' && u.prev.key !== 'days') { var src = Object.assign({}, s.fieldSrc || {}); if (u.prev.src) src[u.prev.key] = u.prev.src; else delete src[u.prev.key]; p.fieldSrc = src; }
      Store.updateSite(s.id, p);
    } else if (u.kind === 'phone') Store.setSettings({ people: Share.mergePerson(state.settings.people, u.name, { phone: u.prev }) });
    else if (u.kind === 'task') Store.deleteTask(u.id);
    hit.undone = true;
    chatSave(list);
    var what = u.kind === 'phone' ? '연락처' : u.kind === 'task' ? '할 일' : (CHAT_LABEL[u.prev.key] || (u.prev.key === 'days' ? '작업자' : u.prev.key === 'payDone' ? '잔금' : '필름'));
    return { ok: true, text: '↩ 되돌림: ' + hit.text, logs: [{ kind: 'site', title: what + ' 되돌림', siteId: u.siteId || '' }] };
  }
  // 실제 결과 → 카드 (AI 말이 아니라 이걸 믿는다)
  function chatCards(results) {
    var out = [];
    results.forEach(function (r) {
      if (r.waiting || r.tool === 'find_sites') return;
      if (r.cards) out = out.concat(r.cards);
      else if (!r.ok) out.push({ ok: false, text: '⚠️ ' + (r.why || '못 했어요') });
      else if (r.text) out.push({ ok: true, text: r.text, undoId: r.undoId, undo: r.undo, same: r.same });
    });
    return out;
  }
  function chatPendingCards(pending) {
    return pending.map(function (a) {
      if (a.tool === 'ask_site') { var as = Store.getSite(a.siteId); return { wait: true, text: '💬 ' + (as ? Share.titleLine(as) : '') + ' — 업체 방에 빈칸·업체 확인 질문 보내기' }; }
      if (a.tool === 'send_kakao') return { wait: true, text: '💬 ' + (a.room || a.client || customerRoom(Store.getSite(a.siteId) || {})) + ' 방에 보낼 카톡\n' + a.text };
      var text = a.tool === 'send_text' ? a.text : workerInfoText(Store.getSite(a.siteId));
      return { wait: true, text: '📨 ' + a.names.join(', ') + ' (' + a.names.length + '명)께 보낼 문자\n' + text };
    });
  }
  /* 📷 비서에게 사진 (2026-11-10 사장님: 위치·필름 번호를 적은 사진 여러 장을 올리고 '위치별로 정리해' ).
     고른 사진은 입력칸 위에 작게 보이고, 보내면 그 말과 같이 AI 에게 간다 (AI 가 사진 글씨를 읽어 set_films 등으로 처리).
     AI 용 사진(1400px)은 이 화면을 쓰는 동안 메모리에만 — 이어지는 대화('덕유주공이야')에도 같이 보낸다. 대화에는 작은 사진만 남긴다 */
  var chatPics = [], chatPicData = {}, CHAT_PICS_MAX = 10;
  function chatPicPrep(file) {
    return readImage(file).then(function (img) {
      if (!(img.width || img.naturalWidth)) throw new Error('이미지 크기를 알 수 없습니다');
      var ai = encode(img, [1400, 1100, 900], [0.8, 0.7, 0.6], 350 * 1024);
      var th = encode(img, [200, 160], [0.6, 0.5], 12 * 1024);
      if (!ai) throw new Error('사진을 변환하지 못했습니다');
      return { ai: ai.dataUrl, thumb: (th || ai).dataUrl };
    });
  }
  function chatPicsPaint() {
    var bar = $('chatPics'); bar.innerHTML = '';
    bar.hidden = !chatPics.length;
    chatPics.forEach(function (p, i) {
      var w = el2('div', 'ch-pic'), im = document.createElement('img'); im.src = p.thumb; im.alt = '';
      var x = el2('button', '', '✕'); x.type = 'button'; x.setAttribute('aria-label', '사진 빼기');
      x.onclick = function () { chatPics.splice(i, 1); chatPicsPaint(); };
      w.appendChild(im); w.appendChild(x); bar.appendChild(w);
    });
    if (chatPics.length) bar.appendChild(el2('span', 'ch-pics-n', '사진 ' + chatPics.length + '장 · 할 말을 적고 📨'));
  }
  function chatPicsAdd(files) {
    files = Array.prototype.slice.call(files || []).filter(function (f) { return /^image\//.test(f.type || ''); });
    if (!files.length) return;
    var room = CHAT_PICS_MAX - chatPics.length;
    if (room <= 0) { toast('사진은 한 번에 ' + CHAT_PICS_MAX + '장까지예요'); return; }
    if (files.length > room) toast('사진은 한 번에 ' + CHAT_PICS_MAX + '장까지예요 — ' + room + '장만 넣었어요');
    toast('사진 준비 중…');
    files.slice(0, room).reduce(function (p, f) {
      return p.then(function () { return chatPicPrep(f).then(function (r) { chatPics.push(r); chatPicsPaint(); }, function () { toast('사진 한 장을 열지 못했어요'); }); });
    }, Promise.resolve());
  }
  // AI 에 보낼 대화: 사진이 있는 내 말에는 사진을 붙인다 (메모리에 있는 것만)
  function chatHistory(list) {
    var hist = BossChat.toHistory(list), tail = list.slice(-hist.length);
    hist.forEach(function (h, i) {
      var d = tail[i] && chatPicData[tail[i].id];
      if (d && d.length) h.photos = d.map(function (u) { return { mime: 'image/jpeg', data: u.split(',')[1] || '' }; });
    });
    return hist;
  }
  function chatSend(text, voice) {
    var box = $('chatText'), value = String(text == null ? box.value : text).trim();
    var pics = chatPics.slice();
    if (!value && pics.length) value = '사진 ' + pics.length + '장 — 사진에 적힌 위치별로 필름 번호 정리해 줘';
    if (!value || chatBusy) return;
    if (!ownerKeyOn()) { toast('이 기기는 사장님 열쇠가 없어 비서를 쓸 수 없어요'); return; }
    chatMicStop();
    chatVoice = !!voice;
    chatSpeak('');
    if (text == null) { box.value = ''; chatGrow(); }
    var mine = chatAdd(pics.length ? { role: 'me', text: value, pics: pics.map(function (p) { return p.thumb; }) } : { role: 'me', text: value });
    if (pics.length) { chatPicData[mine.id] = pics.map(function (p) { return p.ai; }); chatPics = []; chatPicsPaint(); }
    // 문자 확인을 기다리는 중에 '응'·'아니' 라고 하면 [보내]·[안 보냄] 을 누른 것과 같다
    var waiting = chatList().slice(-2)[0];
    if (!pics.length && waiting && waiting.role === 'ai' && (waiting.pending || []).length && BossChat.confirmWord(value)) {
      chatDecide(waiting, BossChat.confirmWord(value) === 'yes');
      return;
    }
    chatBusy = true;
    renderChat();
    var list = chatList();
    BossChat.run(chatHistory(list), {
      ask: chatAsk, exec: chatExec, userText: BossChat.recentUserText(list), confirmSms: chatVoice,
      hasSite: function (id) { return !!Store.getSite(id); }
    }).then(function (r) {
      chatAdd({ role: 'ai', text: r.say, cards: chatPendingCards(r.pending).concat(chatCards(r.results)), chips: r.pending.length ? [] : r.chips, pending: r.pending });
      chatSpeak(r.say);
      workLog(BossChat.logItems(r.results));
      if (r.failed && !r.results.length && !box.value) { box.value = value; chatGrow(); }   // 못 보낸 말은 입력칸에 되돌려 다시 보내기 쉽게
    }).catch(function (e) {
      chatAdd({ role: 'ai', text: '문제가 생겼어요: ' + String(e.message || e).slice(0, 80) });
    }).then(function () {
      chatBusy = false;
      if (!$('viewOrder').hidden) renderChat();
      if (chatAuto) chatAutoListen(500);   // 읽는 중이면 다 읽은 뒤에 (chatAutoOk)
    });
  }
  // 4명 이상 문자 [보내] / [안 보냄] — AI 를 거치지 않고 앱이 바로
  function chatDecide(m, yes) {
    chatPatch(m.id, { pending: [] });
    if (!yes) { chatAdd({ role: 'ai', text: '안 보냈어요.' }); chatSpeak('안 보냈어요.'); renderChat(); if (chatAuto) chatAutoListen(500); return; }
    chatBusy = true;
    renderChat();
    m.pending.reduce(function (p, a) {
      return p.then(function (rs) { return chatExec(a).then(function (x) { return rs.concat([Object.assign({ tool: a.tool }, x)]); }); });
    }, Promise.resolve([])).then(function (rs) {
      var ok = rs.every(function (r) { return r.ok; });
      var kk = m.pending.some(function (a) { return a.tool === 'send_kakao'; });
      var said = !ok ? '일부를 못 보냈어요. 아래 결과를 봐 주세요.' : kk ? '노트북에 카톡 보내기를 맡겼어요. 보내지면 카드가 바뀌어요.' : '보냈어요.';
      chatAdd({ role: 'ai', text: said, cards: chatCards(rs) });
      chatSpeak(said);
      workLog(BossChat.logItems(rs));
    }).catch(function (e) {
      chatAdd({ role: 'ai', text: '보내다 문제가 생겼어요: ' + String(e.message || e).slice(0, 80) });
    }).then(function () { chatBusy = false; if (!$('viewOrder').hidden) renderChat(); if (chatAuto) chatAutoListen(500); });
  }
  function renderChat() {
    var old = orderList(), hist = $('chatOld');
    hist.hidden = !old.length;
    if (old.length) { $('chatOldCount').textContent = old.length; renderOrder(); }
    var body = $('chatMsgs');
    body.innerHTML = '';
    var list = chatList();
    if (!list.length) body.appendChild(chatBubble('무엇을 도와드릴까요? 편하게 말씀해 주세요.\n예: 류춘화 현장 작업자 전체에게 주소 문자 보내줘 / 이번주 잔금 안 받은 현장 어디야?'));
    list.forEach(function (m, i) {
      if (m.role === 'me') {
        var me = el2('div', 'ch-me');
        if ((m.pics || []).length) {
          var ps = el2('div', 'ch-me-pics');
          m.pics.forEach(function (u) { if (!Share.isImageDataUrl(u)) return; var im = document.createElement('img'); im.src = u; im.alt = ''; ps.appendChild(im); });
          me.appendChild(ps);
        }
        var mine = el2('span', '', m.text); chatCopyBtn(mine, m.text); me.appendChild(mine); body.appendChild(me); body.appendChild(el2('div', 'ch-time me', chatTime(m.at))); return; }
      if (m.report) { body.appendChild(reportCard(m.report, m.at)); return; }
      var row = chatBubble(m.text), bub = row.querySelector('.ch-bub');
      chatCopyBtn(bub, [m.text].concat((m.cards || []).map(function (c) { return c.text; })).filter(Boolean).join('\n'));
      (m.cards || []).forEach(function (c) {
        var card = el2('div', 'ch-card' + (c.wait || c.sending ? ' wait' : c.ok ? '' : ' bad') + (c.undone ? ' undone' : ''), c.text);
        bub.appendChild(card);
        if (c.undoId && !c.undone) {
          var u = el2('button', 'ap-undo', '↩ 되돌리기'); u.type = 'button';
          u.onclick = function () {
            var r = chatUndo(c.undoId);
            chatAdd({ role: 'ai', text: r.ok ? '되돌렸어요.' : r.why, cards: r.ok && r.text ? [{ ok: true, text: r.text }] : [] });
            workLog(BossChat.logItems([r]));
            renderChat();
          };
          bub.appendChild(u);
        }
      });
      if (i === list.length - 1 && !chatBusy) {
        var chips = el2('div', 'ap-picks');
        if ((m.pending || []).length) {
          var yes = el2('button', 'ap-pick', '보내'), no = el2('button', 'ap-pick no', '안 보냄');
          yes.type = no.type = 'button';
          yes.onclick = function () { chatDecide(m, true); };
          no.onclick = function () { chatDecide(m, false); };
          chips.appendChild(yes); chips.appendChild(no);
        }
        (m.chips || []).forEach(function (t) {
          var b = el2('button', 'ap-pick', t); b.type = 'button';
          b.onclick = function () { chatSend(t); };
          chips.appendChild(b);
        });
        if (chips.children.length) bub.appendChild(chips);
      }
      body.appendChild(row);
      body.appendChild(el2('div', 'ch-time', chatTime(m.at)));
    });
    if (chatBusy) body.appendChild(chatBubble('생각하는 중…'));
    if (!smsWatchBusy) { clearTimeout(smsWatchT); smsWatchT = setTimeout(smsWatch, 3000); }
    if (!kakaoWatchBusy) { clearTimeout(kakaoWatchT); kakaoWatchT = setTimeout(kakaoWatch, 3000); }
    $('btnChatSend').disabled = chatBusy;
    body.scrollIntoView(false);
    window.scrollTo(0, document.documentElement.scrollHeight);
  }
  /* 📋 업무 내역 (2026-11-04 사장님: 진행 내역을 한곳에) — 비서 화면의 탭. 서버(n8n work-log)에 모아 어느 기기에서나 같다.
     우편함을 거치는 일(칸 넣기·필름 주문·인원·잔금)은 서버가 적고, 비서·앱 바로 주문은 여기서 적는다. 설계 songil docs/superpowers/specs/2026-11-04-업무내역-design.md */
  var WORK_LOG_URL = 'https://primary-production-a6fa.up.railway.app/webhook/work-log';
  var WL_SRC = { me: '내 지시', auto: '비서 자동' };
  var WL_ICON = { sms: '📨', reply: '💬', site: '🔑', crew: '👷', etc: '📌' };
  var WL_CHIPS = [['all', '전체'], ['need', '확인 필요'], ['sms', '문자'], ['site', '현장 정보'], ['crew', '필름·인원']];
  var wlFilter = 'all', wlItems = null;
  function wlPost(body) {
    var key = '';
    try { key = localStorage.getItem('ownerKey') || ''; } catch (e) { /* 저장소 막힘 */ }
    return fetch(WORK_LOG_URL, { method: 'POST', headers: { 'content-type': 'application/json', 'x-owner-key': key }, body: JSON.stringify(body) })
      .then(function (res) { return res.json().catch(function () { return {}; }).then(function (d) { if (!res.ok || !d.ok) throw new Error(d.message || ('HTTP ' + res.status)); return d; }); });
  }
  // 못 적어도 본래 일에는 영향 없다
  function workLog(items) { if (items && items.length) wlPost({ action: 'add', items: items }).catch(function () { /* 다음 일은 계속 */ }); }
  // 예전 내역 옮기기 — 이 기기에서 한 번만 (서버가 id 로 겹치는 걸 막는다)
  var wlMoving = null;
  function wlMigrate() {
    if (wlMoving) return wlMoving;
    var done = '';
    try { done = localStorage.getItem('workLogMoved') || ''; } catch (e) { return Promise.resolve(); }
    if (done || !ownerKeyOn()) return Promise.resolve();
    var items = BossChat.oldLogItems(orderList(), chatList());
    wlMoving = (items.length ? wlPost({ action: 'add', items: items }) : Promise.resolve()).then(function () {
      try { localStorage.setItem('workLogMoved', '1'); } catch (e) { /* 저장소 막힘 */ }
    }).catch(function () { /* 다음에 다시 */ wlMoving = null; });
    return wlMoving;
  }
  function wlMatch(x) { return wlFilter === 'all' ? true : wlFilter === 'need' ? x.state === 'need' : wlFilter === 'sms' ? (x.kind === 'sms' || x.kind === 'reply') : x.kind === wlFilter; }
  function wlTab(on) {
    $('chatPane').hidden = on; $('logPane').hidden = !on;
    $('tabChat').classList.toggle('on', !on); $('tabLog').classList.toggle('on', on);
    if (on) renderWorkLog(true); else renderChat();
    if (on) { clearTimeout(chatAutoT); if (chatRec) chatMicStop(); } else if (chatAuto) chatAutoListen(500);   // 🎤 업무 내역에선 안 들음
  }
  function renderWorkLog(load) {
    var box = $('logList');
    if (load || !wlItems) {
      box.innerHTML = '<p class="sec-empty">불러오는 중…</p>';
      wlMigrate().then(function () { return wlPost({ action: 'list' }); }).then(function (d) { wlItems = d.items || []; paintWorkLog(); }).catch(function (e) {
        box.innerHTML = ''; box.appendChild(el2('p', 'sec-empty', '못 불러왔어요 — 인터넷을 확인해 주세요 (' + String(e.message || e).slice(0, 60) + ')'));
      });
      return;
    }
    paintWorkLog();
  }
  function paintWorkLog() {
    var chips = $('logChips'), box = $('logList'), needs = wlItems.filter(function (x) { return x.state === 'need'; }).length;
    chips.innerHTML = '';
    WL_CHIPS.forEach(function (c) {
      var b = el2('button', 'wl-chip' + (wlFilter === c[0] ? ' on' : ''), c[1] + (c[0] === 'need' && needs ? ' ' + needs : '')); b.type = 'button';
      b.onclick = function () { wlFilter = c[0]; paintWorkLog(); };
      chips.appendChild(b);
    });
    box.innerHTML = '';
    if (needs && wlFilter === 'all') {
      var al = el2('button', 'wl-alert', '⚠️ 확인이 필요한 일 ' + needs + '건'); al.type = 'button';
      al.onclick = function () { wlFilter = 'need'; paintWorkLog(); };
      box.appendChild(al);
    }
    var list = wlItems.filter(wlMatch), day = '';
    if (!list.length) box.appendChild(el2('p', 'sec-empty', wlFilter === 'need' ? '확인할 일이 없어요 👍' : '아직 내역이 없어요.'));
    list.forEach(function (x) {
      var when = new Date(x.t), iso = Share.todayIso(when);
      if (iso !== day) {
        day = iso;
        box.appendChild(el2('div', 'wl-day', (iso === Share.todayIso() ? '오늘 · ' : iso === Share.addDays(Share.todayIso(), -1) ? '어제 · ' : '') + Share.dayLabel(iso)));
      }
      var it = el2('div', 'wl-item' + (x.state === 'need' ? ' bad' : ''));
      it.appendChild(el2('div', 'wl-ic', x.state === 'need' ? '⚠️' : (WL_ICON[x.kind] || WL_ICON.etc)));
      var bd = el2('div', 'wl-bd');
      var site = x.siteId ? Store.getSite(x.siteId) : null;
      var t = el2('div', 'wl-t', x.title);
      bd.appendChild(t);
      var parts = [site ? Share.titleLine(site) : '', x.detail].filter(function (v, i, a) { return v && a.indexOf(v) === i; });
      if (parts.length) bd.appendChild(el2('div', 'wl-d', parts.join(' · ')));
      if (site) { bd.classList.add('ap-link'); bd.onclick = function () { go('#site/' + x.siteId); }; }
      var h = when.getHours(), m = el2('div', 'wl-m', (h < 12 ? '오전 ' : '오후 ') + (h % 12 || 12) + ':' + ('0' + when.getMinutes()).slice(-2) + ' · ');
      m.appendChild(el2('b', '', WL_SRC[x.src] || x.src));
      bd.appendChild(m);
      it.appendChild(bd);
      if (x.state === 'need') {
        var ok = el2('button', 'ap-undo wl-ok', '확인함'); ok.type = 'button';
        ok.onclick = function (e) {
          e.stopPropagation();
          ok.disabled = true;
          wlPost({ action: 'resolve', id: x.id }).then(function () { x.state = ''; paintWorkLog(); }).catch(function () { ok.disabled = false; toast('못 했어요 — 인터넷을 확인해 주세요'); });
        };
        it.appendChild(ok);
      }
      box.appendChild(it);
    });
  }
  $('tabChat').onclick = function () { wlTab(false); };
  $('tabLog').onclick = function () { wlTab(true); };
  // 📋 글 복사 (11/5): PC 는 마우스를 올리면, 폰은 글을 누르면 복사 버튼이 나온다
  function chatCopyBtn(el, text) {
    el.classList.add('ch-copyable');
    var b = el2('button', 'ch-copy', '📋 복사'); b.type = 'button';
    b.onclick = function (e) { e.stopPropagation(); copyText(text, '복사했어요'); el.classList.remove('ch-copy-on'); };
    el.appendChild(b);
    el.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('button')) return;
      var was = el.classList.contains('ch-copy-on');
      document.querySelectorAll('.ch-copy-on').forEach(function (x) { x.classList.remove('ch-copy-on'); });
      if (!was) el.classList.add('ch-copy-on');
    });
  }
  /* 📨 답장 띄우기 (2026-11-05 사장님: 답장을 비서에서 보여 주고 처리 결과도) — 카톡은 노트북이, 문자는 n8n 문자_답장이 알림함(work-log feed)에 넣는다.
     비서 화면을 열어 둔 동안 30초마다, 열 때 한 번 가져와 대화에 붙인다. 설계 songil docs/superpowers/specs/2026-11-05-답장띄우기-design.md */
  var SMS_REPLY_URL = 'https://primary-production-a6fa.up.railway.app/webhook/sms-reply';
  var chatFeedBusy = false;
  // 비서·앱에서 문자를 보낸 번호를 기억 → 그 번호의 답만 본다. fill = 답에서 현장 칸을 채울까 (팀원 답은 글만 띄움)
  function smsReplyWatch(phone, name, siteId, siteName, fill, keys) {
    var key = '', s = Store.getSite(siteId), c = s && Store.getClient(s.clientId);
    try { key = localStorage.getItem('ownerKey') || ''; } catch (e) { /* 저장소 막힘 */ }
    fetch(SMS_REPLY_URL, { method: 'POST', headers: { 'content-type': 'application/json', 'x-owner-key': key },
      body: JSON.stringify({ action: 'watch', items: [{ phone: phone, name: name, siteId: siteId, siteName: siteName, client: c ? c.name : '', fill: !!fill, keys: keys || [] }] }) }).catch(function () { /* 답을 못 띄울 뿐 */ });
  }
  // 📱 업체·발주처 번호부를 n8n 에 (2026-11-11 A안) — 그 번호로 온 문자도 읽어 비번 등을 넣는다. 바뀌었거나 3시간 지났을 때만
  function smsBookSync() {
    if (!ownerKeyOn()) return;
    var items = BossChat.smsBook({ today: Share.todayIso(), clients: state.clients, sites: state.sites });
    var sig = JSON.stringify(items), last = {};
    try { last = JSON.parse(localStorage.getItem('smsBookSent') || '{}'); } catch (e) { /* */ }
    var hash = String(sig.length) + ':' + sig.split('').reduce(function (h, ch) { return (h * 31 + ch.charCodeAt(0)) | 0; }, 7);
    if (last.hash === hash && Date.now() - (last.at || 0) < 3 * 3600e3) return;
    var key = '';
    try { key = localStorage.getItem('ownerKey') || ''; } catch (e) { /* */ }
    fetch(SMS_REPLY_URL, { method: 'POST', headers: { 'content-type': 'application/json', 'x-owner-key': key },
      body: JSON.stringify({ action: 'book', items: items }) })
      .then(function (res) { if (res.ok) try { localStorage.setItem('smsBookSent', JSON.stringify({ hash: hash, at: Date.now() })); } catch (e) { /* */ } })
      .catch(function () { /* 다음에 */ });
  }
  setTimeout(smsBookSync, 4000);
  Store.onChange(function () { clearTimeout(smsBookSync.t); smsBookSync.t = setTimeout(smsBookSync, 15000); });
  function chatFeedPull() {
    if (chatFeedBusy || chatBusy || !ownerKeyOn()) return;
    var after = 0;
    try { after = Number(localStorage.getItem('chatFeedAt')) || 0; } catch (e) { /* 저장소 막힘 */ }
    chatFeedBusy = true;
    wlPost({ action: 'feed_list', after: after }).then(function (d) {
      // 🟢/🔴 노트북 (11/5) — 30분 넘게 신호가 없으면 멈춘 것
      var beat = Number(d.beat) || 0;
      $('chatBeat').textContent = !beat ? '' : Date.now() - beat < 30 * 60000 ? '🟢' : '🔴 노트북 멈춤';
      var items = d.items || [];
      if (!after && !items.length) { try { localStorage.setItem('chatFeedAt', String(d.now || Date.now())); } catch (e) { /* */ } return; }
      if (!items.length) return;
      items.forEach(function (x) {
        // ⏰ 정시 업무보고 (11/7) — 카드로 (일 없는 시간은 회색 한 줄)
        if (x.kind === 'report') { chatAdd({ role: 'ai', text: '', report: { title: x.title, quiet: !!x.quiet, start: x.start, end: x.end, done: x.done || [], replies: x.replies || [], need: x.need || [] } }); return; }
        var head = (x.kind === 'sms' ? '📨 ' : '💬 ') + x.from + '님이 답했어요' + (x.siteName ? ' · ' + x.siteName : '');
        var cards = (x.lines || []).map(function (l) { return { ok: true, text: '✅ ' + l }; });
        if ((x.left || []).length) cards.push({ wait: true, text: '❓ 아직 못 받음: ' + x.left.join(' · ') });
        chatAdd({ role: 'ai', text: head + (x.text ? '\n「' + x.text + '」' : ''), cards: cards });
        // 🎤 켜 둔 동안은 소리로 — 글 원문(비번일 수 있음)은 안 읽는다
        if (chatAuto) { chatVoice = true; chatSpeak(x.from + '님이 답했어요. ' + (x.lines || []).join('. ')); }
      });
      try { localStorage.setItem('chatFeedAt', String(items[items.length - 1].t)); } catch (e) { /* 저장소 막힘 */ }
      if (!$('viewOrder').hidden && !$('chatPane').hidden) renderChat();
    }).catch(function () { /* 다음에 */ }).then(function () { chatFeedBusy = false; });
  }
  setInterval(function () { if (!document.hidden && !$('viewOrder').hidden) chatFeedPull(); }, 30000);
  /* ⏰ 정시 업무보고 (2026-11-07 사장님: 매일 8~17시 정시마다 지난 1시간 일을 폰 알림으로) — n8n 현장관리_빈칸 정시보고(report.js)가
     매시 정각에 업무 내역·답장을 모아 비서 대화 카드(알림함 feed kind 'report')와 폰 알림(웹푸시)을 만든다. 🔔 로 이 폰 등록·시간·요일 설정.
     설계 songil docs/superpowers/specs/2026-11-07-정시보고-design.md */
  var HOURLY_URL = 'https://primary-production-a6fa.up.railway.app/webhook/hourly-report';
  var PUSH_KEY = 'BM8jyhW7o4JcrHNww-B8eaAvXOqRYUJ8uAfXYkscm68RnEOX62ADjydxtcgEpngcpJZG22DYlVgNJTx7f02KdLc';   // 견적 앱과 같은 VAPID 공개키
  function hourPost(body) {
    var key = '';
    try { key = localStorage.getItem('ownerKey') || ''; } catch (e) { /* 저장소 막힘 */ }
    return fetch(HOURLY_URL, { method: 'POST', headers: { 'content-type': 'application/json', 'x-owner-key': key }, body: JSON.stringify(body) })
      .then(function (res) { return res.json().catch(function () { return {}; }).then(function (d) { if (!res.ok || d.ok === false) throw new Error(d.error || 'HTTP ' + res.status); return d; }); });
  }
  function hm(t) { var d = new Date(t); return d.getHours() + ':' + ('0' + d.getMinutes()).slice(-2); }
  function reportCard(r, at) {
    if (r.quiet) { var q = el2('div', 'rp-quiet'); q.appendChild(el2('span', '', r.title + ' · 새 일 없음')); return q; }
    var row = el2('div', 'ch-ai rp-row');
    var av = el2('div', 'ch-av'), face = el2('img'); face.src = 'assistant_face.jpg'; face.alt = ''; av.appendChild(face); row.appendChild(av);
    var col = el2('div', 'rp-col');
    var box = el2('div', 'rp');
    var h = el2('div', 'rp-h');
    h.appendChild(el2('b', '', r.title.replace(/\s*\(.*\)$/, '')));
    if (r.start && r.end) h.appendChild(el2('span', '', hm(r.start) + ' ~ ' + hm(r.end)));
    h.appendChild(el2('em', '', (r.done.length + r.replies.length + r.need.length) + '건'));
    box.appendChild(h);
    var sec = function (cls, title, items, line) {
      if (!items.length) return;
      var sc = el2('div', 'rp-sec ' + cls);
      sc.appendChild(el2('h4', '', title + ' ' + items.length));
      items.forEach(function (x) {
        var it = el2('div', 'rp-it');
        it.appendChild(el2('span', 'rp-tm', x.t ? hm(x.t) : ''));
        var tx = el2('span', 'rp-tx');
        line(tx, x);
        it.appendChild(tx);
        sc.appendChild(it);
      });
      box.appendChild(sc);
    };
    sec('ok', '✅ 처리됨', r.done, function (tx, x) { tx.appendChild(document.createTextNode(x.title)); if (x.detail) tx.appendChild(el2('small', '', x.detail)); });
    sec('re', '💬 받은 답장', r.replies, function (tx, x) { tx.appendChild(document.createTextNode(x.from + (x.site ? ' · ' + x.site : ''))); if ((x.lines || []).length) tx.appendChild(el2('small', '', x.lines.join(' · '))); });
    sec('wn', '⚠️ 확인 필요', r.need, function (tx, x) { tx.appendChild(document.createTextNode(x.title)); if (x.detail) tx.appendChild(el2('small', '', x.detail)); });
    var f = el2('div', 'rp-f');
    var all = el2('button', '', '업무 내역 전체'); all.type = 'button'; all.onclick = function () { wlTab(true); };
    f.appendChild(all);
    if (r.need.length) { var nd = el2('button', 'wn', '확인 필요 보기'); nd.type = 'button'; nd.onclick = function () { wlTab(true); }; f.appendChild(nd); }
    box.appendChild(f);
    col.appendChild(box);
    col.appendChild(el2('div', 'ch-time rp-time', chatTime(at)));
    row.appendChild(col);
    return row;
  }
  // 🔔 이 폰에서 알림 받기 — 앱 서비스워커로 웹푸시 구독 → n8n 에 저장
  function pushSubscribe() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !window.Notification) return Promise.reject(new Error('이 브라우저는 폰 알림이 안 돼요 — 크롬에서, 홈 화면에 설치한 앱으로 열어 주세요'));
    return Notification.requestPermission().then(function (p) {
      if (p !== 'granted') throw new Error('알림이 막혀 있어요 — 주소창 왼쪽 자물쇠 › 권한 › 알림 허용');
      return navigator.serviceWorker.ready;
    }).then(function (reg) {
      return reg.pushManager.getSubscription().then(function (sub) {
        if (sub) return sub;
        var raw = atob(PUSH_KEY.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - PUSH_KEY.length % 4) % 4));
        var key = new Uint8Array(raw.length);
        for (var i = 0; i < raw.length; i++) key[i] = raw.charCodeAt(i);
        return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      });
    }).then(function (sub) { return hourPost({ action: 'sub', subscription: JSON.stringify(sub), device: (navigator.userAgentData && navigator.userAgentData.platform) || 'phone' }); });
  }
  function pushHere() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return Promise.resolve(false);
    return navigator.serviceWorker.ready.then(function (reg) { return reg.pushManager.getSubscription(); }).then(function (sub) { return !!sub && window.Notification && Notification.permission === 'granted'; }).catch(function () { return false; });
  }
  function openHourlySettings() {
    if (!ownerKeyOn()) { toast('이 기기는 사장님 열쇠가 없어요'); return; }
    openModal('🔔 정시 업무보고', '<p class="hint">불러오는 중…</p>', [{ label: '닫기', onClick: closeModal }]);
    Promise.all([hourPost({ action: 'cfg' }), pushHere()]).then(function (res) {
      var c = res[0].cfg || {}, here = res[1];
      var hours = function (sel) { var o = ''; for (var h = 5; h <= 22; h++) o += '<option value="' + h + '"' + (h === sel ? ' selected' : '') + '>' + h + '시</option>'; return o; };
      var html = '<div class="rp-set">' +
        '<label class="rp-opt"><span>정시 보고 받기<small>매 정시에 지난 1시간 일을 알림으로</small></span><input type="checkbox" id="rpOn"' + (c.on !== false ? ' checked' : '') + '></label>' +
        '<div class="rp-opt"><span>시간<small>매일 이 시간 정시마다</small></span><span class="rp-hrs"><select id="rpFrom">' + hours(c.from || 8) + '</select> ~ <select id="rpTo">' + hours(c.to || 17) + '</select></span></div>' +
        '<label class="rp-opt"><span>일 없는 시간도 알림<small>끄면 대화에 회색 한 줄만</small></span><input type="checkbox" id="rpEmpty"' + (c.empty ? ' checked' : '') + '></label>' +
        '<div class="rp-opt"><span>주말<small>토·일요일에도 보고</small></span><span class="rp-days"><label><input type="checkbox" id="rpSat"' + (c.sat !== false ? ' checked' : '') + '> 토</label><label><input type="checkbox" id="rpSun"' + (c.sun ? ' checked' : '') + '> 일</label></span></div>' +
        '<div class="rp-opt"><span>이 폰<small>' + (here ? '✅ 알림 받는 중' : '아직 이 폰은 알림을 안 받아요') + ' · 등록된 기기 ' + (res[0].n || 0) + '대</small></span>' +
        '<button type="button" id="rpSub" class="btn-sm' + (here ? '' : ' primary') + '">' + (here ? '다시 등록' : '이 폰에서 받기') + '</button></div>' +
        '</div>';
      openModal('🔔 정시 업무보고', html, [
        { label: '시험 보내기', onClick: function () { hourPost({ action: 'test' }).then(function () { toast('🔔 시험 알림을 보냈어요 — 몇 초 안에 와요'); }).catch(function (e) { toast('❌ ' + String(e.message || e).slice(0, 60)); }); } },
        { label: '닫기', onClick: closeModal },
        { label: '저장', cls: 'primary', onClick: function () {
          var cfg = { on: $('rpOn').checked, from: +$('rpFrom').value, to: +$('rpTo').value, empty: $('rpEmpty').checked, sat: $('rpSat').checked, sun: $('rpSun').checked };
          hourPost({ action: 'cfg', cfg: cfg }).then(function () { closeModal(); toast('정시 보고 설정을 저장했어요'); }).catch(function (e) { toast('❌ ' + String(e.message || e).slice(0, 60)); });
        } }
      ]);
      $('rpSub').onclick = function () {
        $('rpSub').disabled = true;
        pushSubscribe().then(function () { toast('✅ 이 폰에서 정시 보고 알림을 받아요'); openHourlySettings(); })
          .catch(function (e) { $('rpSub').disabled = false; toast('❌ ' + String(e.message || e).slice(0, 80)); });
      };
    }).catch(function (e) { $('modalBody').innerHTML = '<p class="hint">못 불러왔어요 — 인터넷을 확인해 주세요 (' + esc(String(e.message || e).slice(0, 60)) + ')</p>'; });
  }
  function chatBubble(text) {
    var row = el2('div', 'ch-ai');
    var av = el2('div', 'ch-av'), face = el2('img'); face.src = 'assistant_face.jpg'; face.alt = ''; av.appendChild(face);   // 1분 간편견적의 AI 견적비서 (11/5)
    row.appendChild(av);
    row.appendChild(el2('div', 'ch-bub', text));
    return row;
  }
  /* 👩‍💼 비서실 (11/4 사장님: 실제 비서실처럼 부분마다 비서 그림) — 헤드셋 낀 비서 그림(SVG, 그려서 넣음).
     출입(비번·화장실) / 필름 / 인력(작업자·문자) / 정산(잔금) / 접수(못 찾음·확인 필요) */
  var SECRETARY = {
    door:  { name: '하은', role: '출입 비서', bg: '#e0e7ff', suit: '#4338ca', hair: '#3b2416', long: true,  badge: '🔑' },
    film:  { name: '서연', role: '필름 비서', bg: '#ede9fe', suit: '#7c3aed', hair: '#1f1308', long: true,  badge: '🎞' },
    crew:  { name: '지훈', role: '인력 비서', bg: '#dcfce7', suit: '#15803d', hair: '#111827', long: false, badge: '👷' },
    pay:   { name: '유나', role: '정산 비서', bg: '#fef9c3', suit: '#b45309', hair: '#5b3a1a', long: true,  badge: '💰' },
    desk:  { name: '민준', role: '접수 비서', bg: '#e0f2fe', suit: '#0369a1', hair: '#2d1b0e', long: false, badge: '📋' }
  };
  function secretaryOf(f) {
    if (!f) return 'desk';
    if (f.kind === 'staff') return 'crew';
    if (f.kind === 'films') return 'film';
    if (f.kind === 'pay') return 'pay';
    if (f.kind === 'field') return 'door';
    return 'desk';
  }
  function secretarySvg(key) {
    var c = SECRETARY[key] || SECRETARY.desk;
    var hairBack = c.long ? '<path d="M17 30c-2 12 0 22 4 28h38c4-6 6-16 4-28-2-14-12-21-23-21S19 16 17 30z" fill="' + c.hair + '"/>' : '';
    var hairTop = c.long
      ? '<path d="M22 31c0-12 8-19 18-19s18 7 18 19c-5-6-12-8-19-8-6 0-12 3-17 8z" fill="' + c.hair + '"/>'
      : '<path d="M23 31c-1-12 7-19 17-19s18 6 17 19c-3-5-9-7-17-7s-14 2-17 7z" fill="' + c.hair + '"/>';
    return '<svg viewBox="0 0 80 80" width="100%" height="100%" aria-hidden="true">' +
      '<circle cx="40" cy="40" r="40" fill="' + c.bg + '"/>' + hairBack +
      '<path d="M14 80c2-15 12-22 26-22s24 7 26 22z" fill="' + c.suit + '"/>' +
      '<path d="M33 58l7 9 7-9z" fill="#fff"/><rect x="36" y="48" width="8" height="10" rx="3" fill="#f2c4a0"/>' +
      '<ellipse cx="40" cy="35" rx="15" ry="17" fill="#f8d5b8"/>' + hairTop +
      '<circle cx="34" cy="36" r="1.8" fill="#1f2937"/><circle cx="46" cy="36" r="1.8" fill="#1f2937"/>' +
      '<path d="M35 43q5 4 10 0" stroke="#c2410c" stroke-width="1.8" fill="none" stroke-linecap="round"/>' +
      '<circle cx="31" cy="41" r="2.3" fill="#fca5a5" opacity=".6"/><circle cx="49" cy="41" r="2.3" fill="#fca5a5" opacity=".6"/>' +
      '<path d="M23 35a17 19 0 0 1 34 0" stroke="#334155" stroke-width="3" fill="none"/>' +
      '<rect x="20" y="32" width="6" height="10" rx="3" fill="#334155"/><rect x="54" y="32" width="6" height="10" rx="3" fill="#334155"/>' +
      '<path d="M23 42q2 8 11 8" stroke="#334155" stroke-width="2" fill="none"/><circle cx="35" cy="50" r="2" fill="#334155"/>' +
      '</svg>';
  }
  function secretaryTile(key) {
    var c = SECRETARY[key] || SECRETARY.desk;
    var t = el2('div', 'ap-tile od-sec');
    t.innerHTML = secretarySvg(key);
    t.appendChild(el2('span', 'od-badge', c.badge));
    t.title = c.role;
    return t;
  }
  var ORDER_STATE = { done: ['✅', '처리됨', '#dcfce7'], undone: ['↩', '되돌림', '#f1f5f9'], pick: ['❓', '어느 현장?', '#e0e7ff'],
    missed: ['⚠️', '현장을 못 찾음', '#ffedd5'], same: ['ℹ️', '이미 돼 있음', '#e0f2fe'], nodate: ['⚠️', '그 날짜가 현장에 없음', '#ffedd5'], nosite: ['⚠️', '이 기기에 없는 현장', '#ffedd5'], none: ['🤔', '넣을 정보 없음', '#f1f5f9'], skip: ['–', '넘김', '#f1f5f9'] };
  function sameText(f) {
    if (f.kind !== 'staff') return '이미 ' + f.label + ' ' + orderValue(f) + ' 그대로예요';
    return f.mode === 'remove' ? f.names.join(', ') + ' 은(는) 이미 배정돼 있지 않아요' : f.names.join(', ') + ' 이미 배정돼 있어요';
  }
  function renderOrder() {
    var list = $('orderList');
    list.innerHTML = '';
    var all = orderList();
    if (!all.length) { list.appendChild(el2('p', 'sec-empty', '아직 지시가 없어요. 위에 쓰고 [📨 지시하기] — 예: 류춘화 미래타운 세대비번 2222 로 바뀜')); return; }
    all.forEach(function (o) {
      var st = ORDER_STATE[o.state] || ORDER_STATE.none;
      var it = el2('div', 'ap-card ap-mission od-card od-' + o.state);
      var sk = o.state === 'missed' || o.state === 'none' ? 'desk' : secretaryOf(o.f);
      it.appendChild(secretaryTile(sk));
      var bd = el2('div', 'ap-bd');
      var when = new Date(o.at);
      bd.appendChild(el2('div', 'ap-kind', st[0] + ' ' + st[1] + ' · ' + Share.shortDate(Share.todayIso(when)) + ' ' + ('0' + when.getHours()).slice(-2) + ':' + ('0' + when.getMinutes()).slice(-2)));
      if (o.state === 'same' || o.state === 'nodate') {
        var ts = el2('div', 'ap-name', o.siteName + ' · ' + o.f.label);
        if (Store.getSite(o.siteId)) { ts.classList.add('ap-link'); ts.onclick = function () { go('#site/' + o.siteId); }; }
        bd.appendChild(ts);
        bd.appendChild(el2('div', 'od-chg od-same', o.state === 'same' ? sameText(o.f) : Share.shortDate(o.f.date) + ' 은 이 현장 시공 날짜가 아니에요'));
        if (o.prev && o.prev.key === 'days') bd.appendChild(el2('div', 'ap-res', '지금 배정: ' + orderPrevText(o.prev)));
      } else if (o.state === 'done' || o.state === 'undone' || o.state === 'nosite') {
        var t = el2('div', 'ap-name', o.siteName + ' · ' + o.f.label);
        if (Store.getSite(o.siteId)) { t.classList.add('ap-link'); t.onclick = function () { go('#site/' + o.siteId); }; }
        bd.appendChild(t);
        var was = orderPrevText(o.prev);
        bd.appendChild(el2('div', 'od-chg', (was ? was + ' → ' : '') + orderValue(o.f)));
      } else if (o.state === 'pick') {
        bd.appendChild(el2('div', 'ap-name', o.f.label + ' ' + orderValue(o.f) + ' — 어느 현장인가요?'));
      } else if (o.state === 'missed') {
        bd.appendChild(el2('div', 'ap-name', o.f.label + ' ' + orderValue(o.f)));
        bd.appendChild(el2('div', 'ap-res', '거래처·아파트 이름을 같이 써서 다시 지시해 주세요'));
      }
      bd.appendChild(el2('div', 'ap-res ap-quote', '"' + o.text + '"'));
      (o.sms || []).forEach(function (m) { bd.appendChild(el2('div', 'od-sms' + (m.ok ? '' : ' bad'), (m.ok ? '📨 ' + m.name + '님께 현장 정보 문자 보냄' : '📨 ' + m.name + ' 못 보냄 — ' + m.why))); });
      if (o.f && o.f.kind === 'staff' && o.f.mode !== 'remove' && (o.state === 'done' || o.state === 'same') && Store.getSite(o.siteId)) {
        var sm = el2('button', 'ap-pick od-smsbtn', '📨 ' + o.f.names.join(', ') + '님께 현장 정보 문자'); sm.type = 'button';
        sm.onclick = function () { offerWorkerInfo(o, false); };
        bd.appendChild(sm);
      }
      if (o.state === 'done' && o.prev) {
        var u = el2('button', 'ap-undo', '↩ 되돌리기'); u.type = 'button';
        u.onclick = function () { orderUndo(o); };
        bd.appendChild(u);
      }
      if (o.state === 'pick') {
        var row = el2('div', 'ap-picks');
        o.cands.forEach(function (c) {
          var b = el2('button', 'ap-pick', c.name + ' (' + Share.shortDate(c.date) + ')'); b.type = 'button';
          b.onclick = function () {
            var prev = orderApply(o.f, c.id);
            if (!prev) { toast('이 기기에 그 현장이 없어요'); return; }
            orderPatch(o.id, { state: orderStateOf(prev), siteId: c.id, siteName: c.name, prev: prev });
            if (o.f.kind === 'staff' && orderStateOf(prev) === 'done') offerWorkerInfo(Object.assign({}, o, { siteId: c.id }), /문자|보내|알려/.test(o.text));
            toast(prev.same ? 'ℹ️ ' + c.name + ' ' + sameText(o.f) : prev.nodate ? '⚠️ 그 날짜가 현장에 없어요' : '✅ ' + c.name + ' ' + o.f.label + ' 바꿨어요'); renderOrder();
          };
          row.appendChild(b);
        });
        var no = el2('button', 'ap-pick no', '다 아님'); no.type = 'button';
        no.onclick = function () { orderPatch(o.id, { state: 'skip' }); renderOrder(); };
        row.appendChild(no);
        bd.appendChild(row);
      }
      it.appendChild(bd);
      list.appendChild(it);
    });
  }
  $('btnChatSend').onclick = function () { chatSend(); };
  $('btnChatPhoto').onclick = function () { $('chatPhotoInput').click(); };
  $('chatPhotoInput').onchange = function (e) { chatPicsAdd(e.target.files); e.target.value = ''; };
  // 비서 옆 버전 (11/5) — 앱을 다시 받았는지 눈으로 확인
  (function () {
    var sc = document.querySelector('script[src*="app.js"]'), m = sc && /[?&]v=\d{4}(\w+)/.exec(sc.getAttribute('src'));
    if (m) $('chatVer').textContent = 'v' + m[1];
    // 모든 화면 제목 옆에도 (11/6 사장님: 업데이트됐는지 확인) — 메인·일정·결재함·후기·설정
    if (m) document.querySelectorAll('.topbar-title:not(.sr-only)').forEach(function (h) {
      if (h.querySelector('#chatVer') || h.querySelector('.app-ver')) return;
      // 긴 제목은 글만 줄이고(…) 버전은 늘 보이게
      var txt = el2('span', 'ttl-txt');
      while (h.firstChild) txt.appendChild(h.firstChild);
      h.appendChild(txt);
      h.classList.add('has-ver');
      h.appendChild(el2('small', 'ch-ver app-ver', 'v' + m[1]));
    });
  })();
  /* 🎤 말로 하기 (11/4 사장님: 차 안에서) — 크롬 음성인식(한국어). 말 끝에 '시작해' 라고 하면 바로 보낸다.
     잠깐 쉬어도 다시 듣고(두 번 연속 아무 말 없으면 멈춤), 말로 시킨 일의 답은 소리로 읽어 준다.
     말로 시키면 잘못 들었을 수 있어 문자는 한 명이라도 먼저 묻는다 — '응' 이라고 답하면 나간다 */
  var chatRec = null, chatMicWant = false, chatVoice = false;
  /* 🎤 한 번 누르면 끌 때까지 계속 듣기 (11/5 사장님: 열 때는 꺼진 채로) — 말이 없어도, 시킨 일을 하고 답을 읽은 뒤에도 다시 듣는다.
     ⏹ 를 누르면 그만. 읽는 동안·일하는 동안은 안 듣는다 (자기 목소리를 듣지 않게). 업무 내역 탭·앱을 내리면 잠시 쉰다.
     말한 뒤 '시작해' 라고 해야 보낸다 (그대로). */
  var chatAuto = false, chatAutoT = 0;
  function chatAutoOk() {
    return chatAuto && !chatRec && !chatBusy && !$('viewOrder').hidden && !$('chatPane').hidden && !document.hidden && ownerKeyOn() &&
      !!(window.SpeechRecognition || window.webkitSpeechRecognition) && !(window.speechSynthesis && window.speechSynthesis.speaking);
  }
  function chatAutoListen(delay) {
    clearTimeout(chatAutoT);
    chatAutoT = setTimeout(function () {
      if (!chatAutoOk()) return;
      chatMicWant = true;
      chatListen(2);
    }, delay || 0);
  }
  function chatAutoOff() { chatAuto = false; clearTimeout(chatAutoT); if (chatRec) chatMicStop(); }
  function chatGrow() {
    var box = $('chatText');
    box.style.height = 'auto';
    box.style.height = Math.min(box.scrollHeight + 2, Math.round(window.innerHeight * 0.4)) + 'px';
  }
  function chatSpeak(text) {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    var t = BossChat.speakable(text);
    if (!chatVoice) return;   // 글로 시킨 일은 읽지도, 다시 듣지도 않는다
    if (!t) return;
    var u = new SpeechSynthesisUtterance(t);
    u.lang = 'ko-KR';
    // 다 읽은 뒤 다시 듣는다 (자기 목소리를 듣지 않게 읽는 동안은 안 들음)
    u.onend = u.onerror = function () { if (chatAuto) chatAutoListen(400); };
    window.speechSynthesis.speak(u);
  }
  function chatMicStop() {
    chatMicWant = false;
    if (chatRec) chatRec.abort();
  }
  function chatListen(quiet) {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    var box = $('chatText'), btn = $('btnChatMic'), base = box.value.trim(), rec = new SR(), heard = false, go = false;
    rec.lang = 'ko-KR';
    rec.interimResults = true;
    rec.onresult = function (e) {
      var said = '', final = false;
      for (var i = 0; i < e.results.length; i++) { said += e.results[i][0].transcript; if (e.results[i].isFinal) final = true; }
      heard = true;
      box.value = (base ? base + ' ' : '') + said.trim();
      chatGrow();
      if (final && BossChat.goWord(box.value).go) { go = true; chatMicWant = false; rec.stop(); }
    };
    rec.onerror = function (e) {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { chatMicWant = false; chatAuto = false; toast('마이크 권한을 허용해 주세요 (주소창 왼쪽 자물쇠 › 권한)'); }
      else if (e.error !== 'no-speech' && e.error !== 'aborted') { chatMicWant = false; chatAuto = false; toast('음성인식이 안 됐어요 (' + e.error + ')'); }
    };
    rec.onend = function () {
      chatRec = null;
      if (go) {
        var g = BossChat.goWord(box.value);
        box.value = g.text;
        chatGrow();
        chatMicOff();
        if (g.text) chatSend(null, true); else toast('무엇을 시작할까요? 먼저 말씀해 주세요');
        return;
      }
      if (chatMicWant && chatAuto) { chatMicWant = false; chatAutoListen(300); return; }   // 🎤 켜 둔 동안은 말이 없어도 계속
      var left = heard ? 2 : quiet - 1;
      if (chatMicWant && left > 0) { chatListen(left); return; }   // 잠깐 쉰 것 — 다시 듣는다
      var stopped = chatMicWant;
      chatMicWant = false;
      chatMicOff();
      if (stopped) toast(box.value.trim() ? '보내려면 "시작해" 라고 하거나 📨 를 눌러 주세요' : '못 들었어요 — 다시 눌러 말씀해 주세요');
    };
    chatRec = rec;
    btn.classList.add('on'); btn.textContent = '⏹';
    try { rec.start(); } catch (e) { chatRec = null; chatMicWant = false; chatMicOff(); toast('음성인식을 시작하지 못했어요'); }
  }
  function chatMicOff() { if (chatAuto) return; var btn = $('btnChatMic'); btn.classList.remove('on'); btn.textContent = '🎤'; }   // 켜 둔 동안은 쉬는 사이에도 ⏹
  function chatMic() {
    if (chatRec || chatAuto) {   // ⏹ = 그만 듣기
      chatMicWant = false; chatAuto = false; clearTimeout(chatAutoT);
      if (window.speechSynthesis) window.speechSynthesis.cancel();
      if (chatRec) chatRec.stop(); else chatMicOff();
      return;
    }
    chatAuto = true;
    if (!(window.SpeechRecognition || window.webkitSpeechRecognition)) { toast('이 브라우저는 음성인식이 안 돼요 — 크롬에서 열어 주세요'); return; }
    chatVoice = false;
    chatSpeak('');
    chatMicWant = true;
    chatListen(2);
  }
  $('chatText').addEventListener('input', chatGrow);
  $('btnChatMic').hidden = !(window.SpeechRecognition || window.webkitSpeechRecognition);
  $('btnChatMic').onclick = chatMic;
  $('btnOrderBack').onclick = function () { go(''); };
  $('btnHourly').onclick = openHourlySettings;   // ⏰ 정시 업무보고 설정 (11/7)
  (window.AppSwitcherActions = window.AppSwitcherActions || []).push({
    icon: '📝', name: '업무비서', onClick: function () { go('#order'); }
  });

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
      var pl = Share.placeLine(r.place); if (pl && byCode[k].places.indexOf(pl) === -1) byCode[k].places.push(pl);
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
    // 지울 대상을 먼저 잡아 둔다 — 확인창이 떠 있는 사이 접수 창이 닫히면 svcSheet 가 탭의 빈 접수로 바뀌어
    // 아무것도 안 지우고 '삭제됨' 만 뜨던 문제 (2026-10-28)
    var siteId = svcSheet.siteId, id = svcSheet.id, inline = !!svcSheet.inline;
    modalConfirm('삭제', Share.serviceLabel(c.v) + ' "' + (c.v.request || svcWhen(c.v)) + '" ' + svcWhen(c.v) + ' 을(를) 지웁니다. (현장은 그대로)', '삭제', true).then(function (ok) {
      if (!ok) return;
      Store.removeService(siteId, id);
      var still = Share.servicesOf(Store.getSite(siteId)).some(function (x) { return x.id === id; });
      if (inline && svcSheet.inline) { resetInlineService(still ? '지우지 못했습니다' : '삭제됨'); return; }
      if (svcSheet.id === id) closeServiceSheet();
      else { var sec = $('svcSec'); if (sec) renderServiceSection(sec, siteId); }
      toast(still ? '지우지 못했습니다 — 다시 해 주세요' : '삭제됨');
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
        name.textContent = '' + r.name; row.classList.add('sil-row');
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
    box.appendChild(el2('h3', 'sec-title', '추가작업 ' + plan.rows.length + '건 — 기사앱 사장님 보기에서 적은 일'));
    var list = el2('div', 'ex-list');
    var 표 = { 재시공: '재시공', AS: 'AS', 추가요청: '추가' };
    plan.rows.forEach(function (r) {
      var row = el2('div', 'ex-r' + (r.done ? ' done' : ''));
      var nm = el2('div', 'ex-nm');
      var tag = el2('span', 'ex-t ex-' + (r.kind === 'AS' ? 'as' : r.kind === '재시공' ? 're' : 'add'), 표[r.kind] || r.kind);
      nm.appendChild(tag); nm.appendChild(document.createTextNode(' ' + r.name));
      var sub = el2('small', '', [r.who, r.done ? '끝남' : '약 ' + (r.minutes >= 60 ? Math.round(r.minutes / 6) / 10 + '시간' : r.minutes + '분'),
        r.filmM ? '필름 ' + r.filmM + 'm' + (r.filmCode ? ' ' + r.filmCode : '') : ''].filter(Boolean).join(' · '));
      nm.appendChild(sub);
      row.appendChild(nm);
      list.appendChild(row);
    });
    box.appendChild(list);
    if (!film) {
      var need = Share.needStaffOf(s);
      var st = el2('div', 'ex-plan');
      st.appendChild(el2('b', '', '남은 추가작업 약 ' + 시간 + ' ≈ ' + plan.pum + '품'));
      st.appendChild(el2('span', '', plan.addStaff ? '필요 인원 ' + (need || 0) + '명 → ' + ((need || 0) + plan.addStaff) + '명으로 늘리면 위 날짜별 인원에서 모자란 만큼 보여요'
        : '이미 필요 인원에 넣었어요'));
      if (plan.addStaff) {
        var b = el2('button', 'btn-sm primary', '필요 인원 +' + plan.addStaff + '명 넣기'); b.type = 'button';
        b.onclick = function () {
          var cur = Store.getSite(siteId);
          var doneMap = Object.assign({}, cur.extraDone || {});
          plan.rows.forEach(function (r) { if (!r.done) doneMap[r.id] = Object.assign({}, doneMap[r.id], { staff: 1 }); });
          Store.updateSite(siteId, { extraDone: doneMap });
          if (Share.dayNeedSum(cur)) {   // 날마다 정한 현장 — 마지막 날 필요 인원에 더한다 (11/6)
            var lastIso = cur.days[cur.days.length - 1].date, dp = Object.assign({}, cur.dayPlan || {});
            dp[lastIso] = Object.assign({}, Share.dayPlanOf(cur, lastIso), { need: Share.dayPlanOf(cur, lastIso).need + plan.addStaff });
            Store.updateSite(siteId, { dayPlan: dp });
          } else Store.setNeedStaff(siteId, (Share.needStaffOf(cur) || 0) + plan.addStaff);
          toast('필요 인원 +' + plan.addStaff + '명 — 날짜를 더하거나 그날 사람을 넣으세요');
          var ds = $('daysSec'); if (ds) renderDaysSection(ds, siteId);
          rerender(); paintSiteStatus();
        };
        st.appendChild(b);
      }
      box.appendChild(st);
    }
    var fp = el2('div', 'ex-plan film');
    fp.appendChild(el2('b', '', '추가작업 필름 ' + (plan.films.length ? plan.films.map(function (f) { return f.code + ' +' + f.m + 'm'; }).join(', ') : '없음')));
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
        toast('필름 줄 ' + plan.newFilmRows.length + '개 추가 — 시공위치에 추가분 m 이 적혀 있어요');
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
  var LEDGER_KIND = { 견적: '📄 견적', 추가: '➕ 추가견적', 입금: '💰 입금' };
  function ledgerTitle(l) {
    if (l.견적서) return l.종류 === '입금' ? '견적서 입금' : '견적서 발행' + (l.견적서.조정 ? ' (' + won(l.견적서.견적금액) + '에서 조정' + (l.견적서.사유 ? ' · ' + l.견적서.사유 : '') + ')' : '');
    return l.내용 || (l.종류 === '입금' ? '입금' : l.종류 === '견적' ? '기존 견적' : '추가 견적');
  }
  function settleMemoText(sum) {
    var L = ['[정산 내역] 총액 ' + won(sum.총액) + ' · 납입금 ' + won(sum.납입) + ' · 미수금 ' + won(sum.미수)];
    sum.lines.filter(function (l) { return l.포함; }).forEach(function (l) {
      L.push(l.번 + '. ' + Share.dayLabel(l.날짜) + ' ' + LEDGER_KIND[l.종류].replace(/^\S+ /, '') + ' ' + (l.종류 === '입금' ? '-' : '+') + won(l.금액) + (l.부가세 && l.종류 !== '입금' ? ' (부가세 ' + l.부가세 + ')' : '') + ' — ' + ledgerTitle(l));
    });
    return L.join('\n');
  }
  // 장부 한 줄 적기·고치기 — 종류(견적·추가견적·입금)·날짜·금액·메모
  function openLedgerEdit(siteId, line, kind, onDone, preset) {
    var 새것 = !line;
    line = line || { key: 'm' + Date.now().toString(36), 종류: kind || '추가', 날짜: Share.todayIso(), 금액: preset || '', 내용: '', 포함: true };
    var k = line.종류;
    var v = function (x) { return x === 0 || x ? Math.round(Number(x) || 0).toLocaleString('ko-KR') : ''; };
    var html = '<div class="st-form">' +
      '<div class="lg-kinds">' + ['견적', '추가', '입금'].map(function (x) {
        return '<button type="button" class="lg-kind k-' + x + (x === k ? ' on' : '') + '" data-k="' + x + '">' + LEDGER_KIND[x] + '</button>'; }).join('') + '</div>' +
      '<label>날짜<input type="date" id="lgDate" value="' + esc(line.날짜) + '"></label>' +
      // 견적·추가견적 금액 옆에 부가세 포함/불포함 (2026-10-28 사장님) — 기록용 표시, 금액은 적은 그대로 계산
      '<div class="lg-amt-f"><div class="lg-amt-h"><span id="lgAmtLabel">금액</span>' +
        '<span class="lg-vat" id="lgVat">부가세 ' + ['포함', '불포함'].map(function (x) {
          return '<label><input type="radio" name="lgVat" value="' + x + '"' + ((line.부가세 || '불포함') === x ? ' checked' : '') + '> ' + x + '</label>'; }).join('') + '</span></div>' +
        '<input type="text" inputmode="numeric" class="st-won" id="lgAmt" value="' + esc(v(line.금액)) + '" placeholder="0"></div>' +
      '<label>메모<input type="text" id="lgWhat" value="' + esc(line.내용 || '') + '" placeholder="예: 현관 손잡이 추가, 계좌이체"></label>' +
      (새것 ? '' : '<label class="st-ck"><input type="checkbox" id="lgIn"' + (line.포함 ? ' checked' : '') + '> 합계에 넣기 <small>빼면 기록만 남아요</small></label>') + '</div>';
    var btns = [{ label: '취소', onClick: closeModal }];
    // 지우기는 한 번 더 묻는다 (2026-10-28 사장님) — 취소하면 고치던 창으로 돌아감
    if (!새것) btns.push({ label: '지우기', cls: 'danger', onClick: function () {
      openModal('이 줄을 지울까요?', '<p class="st-q" style="font-size:15px;color:var(--text)">' + esc(Share.dayLabel(line.날짜)) + ' · ' + LEDGER_KIND[line.종류] + ' · <b>' + won(line.금액) + '</b>' +
        (line.내용 ? '<br>' + esc(line.내용) : '') + '</p><p class="hint" style="margin-top:8px">지우면 되돌릴 수 없어요.</p>', [
        { label: '취소', onClick: function () { openLedgerEdit(siteId, line, null, onDone); } },
        { label: '지우기', cls: 'danger', onClick: function () {
          var cur = Store.getSite(siteId);
          Store.updateSite(siteId, { settleManual: (cur.settleManual || []).filter(function (m) { return m.id !== line.key; }) });
          closeModal(); toast('🗑 지웠어요'); onDone();
        } }]);
    } });
    btns.push({ label: '저장', cls: 'primary', onClick: function () {
      var amt = $('lgAmt').value.replace(/[^0-9]/g, '');
      if (!amt || !Number(amt)) { toast('금액을 적어 주세요'); return; }
      var cur = Store.getSite(siteId);
      var row = { id: line.key, 종류: k, 날짜: $('lgDate').value || Share.todayIso(), 금액: Number(amt), 내용: $('lgWhat').value.trim(), 포함: $('lgIn') ? $('lgIn').checked : true };
      if (k !== '입금') { var vt = document.querySelector('#modalBody input[name=lgVat]:checked'); row.부가세 = vt ? vt.value : '불포함'; }
      var list = cur.settleManual || [];
      var at = list.findIndex(function (m) { return m.id === line.key; });
      list = at >= 0 ? list.map(function (m, i) { return i === at ? row : m; }) : list.concat([row]);
      Store.updateSite(siteId, { settleManual: list });
      closeModal(); onDone();
    } });
    openModal(새것 ? '＋ ' + LEDGER_KIND[k].replace(/^\S+ /, '') + ' 적기' : '정산 장부 고치기', html, btns);
    var paint = function () {
      document.querySelectorAll('#modalBody .lg-kind').forEach(function (b) { b.classList.toggle('on', b.dataset.k === k); });
      $('lgAmtLabel').textContent = k === '입금' ? '받은 금액' : k === '견적' ? '견적 금액' : '추가 금액';
      $('lgVat').hidden = k === '입금';
      var t = $('modalTitle');
      if (t && 새것) t.textContent = '＋ ' + LEDGER_KIND[k].replace(/^\S+ /, '') + ' 적기';
    };
    document.querySelectorAll('#modalBody .lg-kind').forEach(function (b) { b.onclick = function () { k = b.dataset.k; paint(); }; });
    paint();
    wonInputs();
  }
  function wonInputs() {
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
    wonInputs();
  }
  function renderSettleSection(box, siteId) {
    var s = Store.getSite(siteId); if (!s) return;
    var adminId = String(s.adminId || '').trim();
    box.innerHTML = ''; box.hidden = false;
    box.classList.add('settle-sec');
    box.appendChild(el2('h3', 'sec-title', '정산 내역 — 견적·추가견적·입금을 날짜순으로'));
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
    var sum = Share.settleLedger(c.list || [], s.settleLog, s.settleManual);
    if (!sum.lines.length) {
      box.appendChild(el2('div', 'sec-empty', '① 기존 견적금액을 먼저 적고, 입금되거나 추가견적이 생길 때마다 아래 버튼으로 한 줄씩 더하세요.' +
        (adminId ? ' 발행한 정산견적도 여기 자동으로 들어와요.' : '')));
    }
    var list = el2('div', 'lg-list');
    sum.lines.forEach(function (l) {
      var row = el2('button', 'lg-r k-' + l.종류 + (l.포함 ? '' : ' old')); row.type = 'button';
      row.appendChild(el2('span', 'lg-no', l.포함 ? String(l.번) : (l.견적서 && l.견적서.자동대체 ? '고친 전' : '뺌')));
      var mid = el2('span', 'lg-mid');
      var top = el2('span', 'lg-top');
      top.appendChild(el2('span', 'lg-d', Share.dayLabel(l.날짜)));
      top.appendChild(el2('span', 'lg-k', LEDGER_KIND[l.종류]));
      if (l.부가세 && l.종류 !== '입금') top.appendChild(el2('span', 'lg-vt' + (l.부가세 === '포함' ? ' in' : ''), '부가세 ' + l.부가세));
      mid.appendChild(top);
      mid.appendChild(el2('span', 'lg-what', ledgerTitle(l)));
      if (l.견적서 && l.종류 === '견적' && l.포함) { var d = settleLine(l.견적서); if (d) mid.appendChild(el2('span', 'lg-sub', d)); }
      row.appendChild(mid);
      var right = el2('span', 'lg-right');
      right.appendChild(el2('b', 'lg-amt', (l.종류 === '입금' ? '−' : '+') + won(l.금액)));
      if (l.포함) right.appendChild(el2('span', 'lg-bal', '미수 ' + won(l.미수)));
      row.appendChild(right);
      row.onclick = function () {
        if (l.견적서) openSettleEdit(siteId, l.견적서, rerender);
        else openLedgerEdit(siteId, l, null, rerender);
      };
      list.appendChild(row);
      if (l.견적서 && l.종류 === '견적') {
        var a = el2('a', 'lg-doc', '견적서 보기'); a.href = 'https://songil.netlify.app/s/' + encodeURIComponent(l.견적서.코드); a.target = '_blank'; a.rel = 'noopener';
        list.appendChild(a);
      }
    });
    box.appendChild(list);
    var adds = el2('div', 'lg-adds');
    var hasBase = sum.lines.some(function (l) { return l.종류 === '견적' && l.포함; });
    [hasBase ? null : '견적', '추가', '입금'].forEach(function (k) {
      if (!k) return;
      var b = el2('button', 'lg-add k-' + k, '＋ ' + (k === '견적' ? '기존 견적금액' : k === '추가' ? '추가견적' : '입금')); b.type = 'button';
      b.onclick = function () { openLedgerEdit(siteId, null, k, rerender); };
      adds.appendChild(b);
    });
    box.appendChild(adds);
    // 맨 아래: 총액 · 납입금 · 미수금 한 번에
    var tot = el2('div', 'lg-tot');
    [['총액', sum.총액, ''], ['납입금', sum.납입, 'paid'], [sum.미수 < 0 ? '더 받음' : '미수금', Math.abs(sum.미수), sum.미수 > 0 ? 'due' : 'ok']].forEach(function (x) {
      var cell = el2('div', 'lg-cell ' + x[2]);
      cell.appendChild(el2('small', '', x[0]));
      cell.appendChild(el2('b', '', won(x[1])));
      tot.appendChild(cell);
    });
    box.appendChild(tot);
    var foot = el2('div', 'st-foot');
    if (sum.미수 > 0) {
      var pay = el2('button', 'btn-sm', '미수금 ' + won(sum.미수) + ' 다 받음'); pay.type = 'button';
      pay.onclick = function () { openLedgerEdit(siteId, null, '입금', rerender, sum.미수); };
      foot.appendChild(pay);
    }
    if (sum.lines.length) {
      var cp = el2('button', 'btn-sm st-memo', '메모에 붙이기'); cp.type = 'button';
      cp.onclick = function () {
        var cur = Store.getSite(siteId);
        var text = settleMemoText(Share.settleLedger(c.list || [], cur.settleLog, cur.settleManual));
        var memo = String(cur.memo || '');
        // 예전에 붙인 정산 내역 덩어리는 새 것으로 바꾼다 (계속 쌓이지 않게)
        memo = memo.replace(/\[정산 내역\][\s\S]*?(?=\n\n|$)/, '').replace(/^\n+/, '');
        Store.updateSite(siteId, { memo: text + (memo ? '\n\n' + memo : '') });
        toast('메모 맨 위에 정산 내역을 붙였어요');
        renderSite(); pickSiteTab('review', false);
      };
      foot.appendChild(cp);
    }
    if (foot.children.length) box.appendChild(foot);
  }

  /* ---------- AS 필름 박스 (2026-10-31 사장님) ----------
     시공 마지막 날 남은 필름 중 가장 긴 것만 박스에 넣고, 롤 테이프에 'ps010 300x2450'(번호 폭x길이)을 적어 사진을 찍는다.
     [📷 박스 사진 올리기] → 사진은 이 현장 사진으로 남고(주인 'filmbox:현장id'), n8n 현장관리_필름라벨(Gemini)이 테이프 글씨를
     읽어 확인 칸에 채운다 → [박스에 넣기]. 줄을 누르면 [다 씀]·[남은 길이]. 필름 탭(boxSec)과 AS 탭(asBoxSec)에 같은 내용.
     찾기는 일정 화면 아래 '📦 AS 박스 찾기' (모든 현장에서 번호로) */
  var FILM_LABEL_URL = 'https://primary-production-a6fa.up.railway.app/webhook/film-label-read';
  function boxOwner(siteId) { return 'filmbox:' + siteId; }
  var boxDraft = {};     // 현장id → { rows: ['PS010 300x2450', …], note } 확인 중인 라벨 (화면용)
  var boxReading = {};   // 현장id → true (AI 읽는 중)
  var boxOpenRow = '';   // 버튼을 펼친 줄 id
  function paintBoxes(siteId) {
    ['boxSec', 'asBoxSec'].forEach(function (id) { var b = $(id); if (b) renderBoxSection(b, siteId); });
  }
  function saveBox(siteId, box) { Store.updateSite(siteId, { filmBox: box }); }
  function boxRow(siteId, it, onChange) {
    var row = el2('div', 'bx-row' + (it.usedAt ? ' used' : '') + (boxOpenRow === it.id ? ' open' : ''));
    var main = document.createElement('button'); main.type = 'button'; main.className = 'bx-main';
    var left = el2('span', 'bx-left');
    left.appendChild(el2('b', 'bx-code', it.code));
    var size = Share.filmSizeText(it);
    if (size) left.appendChild(el2('span', 'bx-size', size));
    main.appendChild(left);
    main.appendChild(el2('span', 'bx-note', Share.filmBoxNote(it)));
    main.onclick = function () { boxOpenRow = boxOpenRow === it.id ? '' : it.id; onChange(); };
    row.appendChild(main);
    if (boxOpenRow !== it.id) return row;
    var acts = el2('div', 'bx-acts');
    var add = function (label, cls, fn) { var b = el2('button', 'btn-sm ' + cls, label); b.type = 'button'; b.onclick = fn; acts.appendChild(b); };
    var cur = function () { return (Store.getSite(siteId) || {}).filmBox; };
    if (it.usedAt) {
      add('↩ 되살리기', '', function () { saveBox(siteId, Share.filmBoxUndoUse(cur(), it.id)); boxOpenRow = ''; onChange(); });
    } else {
      add('✔ 다 씀', 'danger', function () {
        saveBox(siteId, Share.filmBoxUse(cur(), it.id, Share.todayIso())); boxOpenRow = '';
        toast(it.code + ' 다 씀 — 박스에서 뺐어요'); onChange();
      });
      add('✂ 남은 길이', 'primary', function () {
        modalPrompt(it.code + ' 남은 길이 (mm)', String(it.l || ''), '예: 1450').then(function (v) {
          if (v == null) return;
          var n = parseInt(String(v).replace(/[^\d]/g, ''), 10);
          if (!(n >= 0)) { toast('숫자로 적어 주세요'); return; }
          saveBox(siteId, Share.filmBoxSetLength(cur(), it.id, n, Share.todayIso())); boxOpenRow = '';
          toast(n > 0 ? it.code + ' 남은 길이 ' + n : it.code + ' 다 씀'); onChange();
        });
      });
    }
    row.appendChild(acts);
    return row;
  }
  function renderBoxSection(box, siteId) {
    var s = Store.getSite(siteId); if (!s) return;
    var asTab = box.id === 'asBoxSec';
    var all = Share.normalizeFilmBox(s.filmBox);
    var live = all.filter(function (it) { return !it.usedAt; }), used = all.filter(function (it) { return it.usedAt; });
    var photos = Store.photosOf(boxOwner(siteId));
    box.className = 'sec bx-sec' + (asTab ? ' as' : '');
    box.innerHTML = '<h3 class="sec-title">' + (asTab ? '이 현장 AS 박스' : 'AS 박스') + ' <span class="sec-hint">— ' +
      (asTab ? (live.length ? '꺼내 쓰면 줄을 눌러 고치기' : '필름·부자재 탭에서 넣어요') : '마지막 날 가장 긴 필름만 넣고 사진') + '</span></h3>';
    if (photos.length) {
      var strip = el2('div', 'bx-photos');
      photos.forEach(function (p) {
        var b = document.createElement('button'); b.type = 'button'; b.className = 'bx-photo';
        var img = document.createElement('img'); img.alt = '박스 사진'; img.loading = 'lazy';
        if (Share.isImageDataUrl(p.thumb || p.dataUrl)) img.src = p.thumb || p.dataUrl;
        b.appendChild(img);
        b.appendChild(el2('span', 'bx-photo-cap', p.name || ''));
        b.onclick = function () { go('#photo/' + p.id); };
        strip.appendChild(b);
      });
      box.appendChild(strip);
    }
    var again = function () { paintBoxes(siteId); };
    live.forEach(function (it) { box.appendChild(boxRow(siteId, it, again)); });
    if (!live.length && !asTab && !boxDraft[siteId] && !boxReading[siteId]) {
      box.appendChild(el2('div', 'bx-empty', '아직 없음 — 롤 테이프에 "ps010 300x2450" 처럼 적고 사진을 올리세요'));
    }
    if (!live.length && asTab) box.appendChild(el2('div', 'bx-empty', '이 현장 박스에 넣은 필름이 없어요'));
    if (used.length) {
      var det = document.createElement('details'); det.className = 'bx-used';
      det.appendChild(el2('summary', '', '다 쓴 것 ' + used.length));
      used.forEach(function (it) { det.appendChild(boxRow(siteId, it, again)); });
      if (used.some(function (it) { return it.id === boxOpenRow; })) det.open = true;
      box.appendChild(det);
    }
    if (asTab) return;
    if (boxReading[siteId]) { box.appendChild(el2('div', 'bx-reading', '사진 속 테이프 글씨를 읽는 중…')); return; }
    if (boxDraft[siteId]) { renderBoxDraft(box, siteId); return; }
    var btns = el2('div', 'bx-btns');
    var up = el2('button', 'btn-sm primary', '박스 사진 올리기'); up.type = 'button';
    var inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.multiple = true; inp.hidden = true;
    inp.onchange = function () { var f = Array.prototype.slice.call(inp.files || []); inp.value = ''; if (f.length) uploadBoxPhotos(siteId, f); };
    up.onclick = function () { inp.click(); };
    var hand = el2('button', 'btn-sm', '직접 적기'); hand.type = 'button';
    hand.onclick = function () { boxDraft[siteId] = { rows: [''], note: '' }; paintBoxes(siteId); };
    btns.appendChild(up); btns.appendChild(hand); btns.appendChild(inp);
    box.appendChild(btns);
  }
  // 확인 칸: 줄마다 'PS010 300x2450' — 고치거나 지우고 [박스에 넣기]
  function renderBoxDraft(box, siteId) {
    var d = boxDraft[siteId];
    var wrap = el2('div', 'bx-draft');
    if (d.note) wrap.appendChild(el2('div', 'bx-draft-note', d.note));
    d.rows.forEach(function (v, i) {
      var r = el2('div', 'bx-draft-row');
      var t = document.createElement('input'); t.type = 'text'; t.value = v; t.placeholder = 'ps010 300x2450';
      t.autocapitalize = 'characters';
      t.oninput = function () { d.rows[i] = t.value; };
      var x = el2('button', 'x', '✕'); x.type = 'button'; x.title = '이 줄 빼기';
      x.onclick = function () { d.rows.splice(i, 1); paintBoxes(siteId); };
      r.appendChild(t); r.appendChild(x);
      wrap.appendChild(r);
    });
    var more = el2('button', 'bx-draft-add', '＋ 줄 추가'); more.type = 'button';
    more.onclick = function () { d.rows.push(''); paintBoxes(siteId); };
    wrap.appendChild(more);
    var foot = el2('div', 'bx-btns');
    var ok = el2('button', 'btn-sm primary', '📦 박스에 넣기'); ok.type = 'button';
    ok.onclick = function () {
      var labels = Share.parseFilmLabels(d.rows.join('\n'));
      if (!labels.length) { toast('필름 번호를 적어 주세요 (예: ps010 300x2450)'); return; }
      var r = Share.filmBoxPut((Store.getSite(siteId) || {}).filmBox, labels, Share.todayIso(), function (i) { return 'fb' + Date.now().toString(36) + i; });
      saveBox(siteId, r.box);
      delete boxDraft[siteId];
      toast('📦 박스에 ' + (r.added ? r.added + '개 넣음' : '') + (r.added && r.updated ? ', ' : '') + (r.updated ? r.updated + '개 새 치수로' : ''));
      paintBoxes(siteId);
    };
    var no = el2('button', 'btn-sm', '취소'); no.type = 'button';
    no.onclick = function () { delete boxDraft[siteId]; paintBoxes(siteId); };
    foot.appendChild(ok); foot.appendChild(no);
    wrap.appendChild(foot);
    box.appendChild(wrap);
  }
  // 사진을 이 현장 박스 사진으로 저장 → AI 에게 글씨 읽기 → 확인 칸
  function uploadBoxPhotos(siteId, files) {
    boxReading[siteId] = true; paintBoxes(siteId);
    var urls = [];
    var next = function (i) {
      if (i >= files.length) return Promise.resolve();
      return compressImage(files[i]).then(function (r) {
        urls.push(r.dataUrl);
        return Store.addPhoto(boxOwner(siteId), { name: Share.shortDate(Share.todayIso()) + ' 박스', thumb: r.thumb, dataUrl: r.dataUrl, w: r.w, h: r.h, bytes: r.bytes });
      }).catch(function () { /* 이 사진은 건너뛴다 */ }).then(function () { return next(i + 1); });
    };
    next(0).then(function () {
      if (!urls.length) throw new Error('사진을 열 수 없어요');
      return fetch(FILM_LABEL_URL, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ photos: urls.map(function (u) { return { mime: 'image/jpeg', data: u.split(',')[1] || '' }; }) }) })
        .then(function (res) { if (!res.ok) throw new Error('HTTP ' + res.status); return res.json(); });
    }).then(function (data) {
      var rows = ((data && data.labels) || []).map(function (l) {
        return [l.code, l.w && l.l ? l.w + 'x' + l.l : ''].filter(Boolean).join(' ');
      }).filter(Boolean);
      boxDraft[siteId] = rows.length
        ? { rows: rows, note: '사진에서 ' + rows.length + '개 읽었어요 — 맞는지 보고 넣으세요' }
        : { rows: [''], note: '글씨를 못 읽었어요 — 직접 적어 주세요 (사진은 저장됨)' };
    }).catch(function (e) {
      boxDraft[siteId] = { rows: [''], note: '글씨 읽기 실패(' + (e && e.message || '연결') + ') — 직접 적어 주세요' + (urls.length ? ' (사진은 저장됨)' : '') };
    }).then(function () {
      delete boxReading[siteId];
      paintBoxes(siteId);
    });
  }
  // 📦 AS 박스 찾기 — 모든 현장 박스에서 번호로 (다 쓴 것 빼고)
  function openBoxFinder(q) {
    $('taskSheetTitle').textContent = '📦 AS 박스 찾기';
    var body = $('taskBody'); body.innerHTML = '';
    var inp = document.createElement('input'); inp.type = 'search'; inp.className = 'bx-search';
    inp.placeholder = '필름 번호 (예: ps010)'; inp.value = q || '';
    var list = el2('div', 'bx-found');
    body.appendChild(inp); body.appendChild(list);
    var paint = function () {
      list.innerHTML = '';
      var hits = Share.filmBoxSearch(Store.state.sites, inp.value);
      var sites = {}; hits.forEach(function (h) { sites[h.site.id] = 1; });
      list.appendChild(el2('div', 'task-meta', hits.length ? hits.length + '개 · 현장 ' + Object.keys(sites).length + '곳' :
        (inp.value.trim() ? '박스에 없어요 — 주문해야 해요' : '박스가 비어 있어요')));
      hits.forEach(function (h) {
        var g = el2('div', 'fb-grp bx-hit');
        g.appendChild(boxRow(h.site.id, h.item, paint));
        var c = Store.getClient(h.site.clientId);
        var go1 = el2('button', 'bx-site', Share.titleLine(h.site) + (c ? ' (' + c.name + ')' : '') + ' ›'); go1.type = 'button';
        go1.onclick = function () { $('taskSheet').hidden = true; go('#site/' + h.site.id); };
        g.appendChild(go1);
        var ph = Store.photosOf(boxOwner(h.site.id));
        if (ph.length) {
          var strip = el2('div', 'bx-photos');
          ph.slice(-3).forEach(function (p) {
            var b = document.createElement('button'); b.type = 'button'; b.className = 'bx-photo';
            var img = document.createElement('img'); img.alt = '박스 사진';
            if (Share.isImageDataUrl(p.thumb || p.dataUrl)) img.src = p.thumb || p.dataUrl;
            b.appendChild(img);
            b.onclick = function () { $('taskSheet').hidden = true; go('#photo/' + p.id); };
            strip.appendChild(b);
          });
          g.appendChild(strip);
        }
        list.appendChild(g);
      });
    };
    inp.oninput = paint;
    paint();
    $('taskSheet').hidden = false;
  }

  function renderSiliconeSection(box, siteId) {
    var s = Store.getSite(siteId); if (!s) return;
    var sc = Share.siliconeOf(s);
    var rerender = function () { renderSiliconeSection(box, siteId); var sup = box.previousElementSibling; if (sup) renderSuppliesSection(sup, siteId); paintSiteStatus(); };
    box.className = 'sec sil-sec' + (sc.who === 'me' ? ' me' : sc.who === 'other' ? ' other' : '');
    box.innerHTML = '<h3 class="sec-title">실리콘 <span class="sec-hint">— 내가 쏘면 2일 전부터 준비 알림</span></h3>';
    var who = document.createElement('div'); who.className = 'sil-who';
    [['', '없음'], ['me', '내가 쏨'], ['other', '다른 사람']].forEach(function (o) {
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
    b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + (s && s.hide ? "<path d=\"M3 12s3.500-6.500 9-6.500S21 12 21 12s-3.500 6.500-9 6.500S3 12 3 12z\"/><circle cx=\"12\" cy=\"12\" r=\"2.500\"/>" : "<path d=\"M3 12s3.500-6.500 9-6.500S21 12 21 12s-3.500 6.500-9 6.500S3 12 3 12z\"/><path d=\"M4 4l16 16\"/>") + '</svg>';
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
    // 📥 카톡 정리로 채운 칸은 어느 방에서 언제 온 값인지 작게 (2026-10-28)
    if (s.fieldSrc && s.fieldSrc[f.key]) { var srcTag = document.createElement('small'); srcTag.className = 'fsrc'; srcTag.textContent = '' + s.fieldSrc[f.key]; label.appendChild(srcTag); }
    // 현장명 옆 '주소 복사' — 내비에 붙여넣는다 (호수·평형은 빼고 아파트 이름과 동까지)
    if (f.key === 'name') {
      var navBtn = document.createElement('button');
      navBtn.type = 'button'; navBtn.className = 'nav-copy';
      navBtn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="13" height="13" rx="2.5"/><path d="M16 8V5.5A2.5 2.5 0 0 0 13.5 3h-8A2.5 2.5 0 0 0 3 5.5v8A2.5 2.5 0 0 0 5.5 16H8"/></svg>주소 복사';
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
      wl.appendChild(document.createTextNode('기사링크'));
      // 흐린 칸을 누르면 왜 못 고르는지 알려 준다 (비활성 체크박스는 눌러도 아무 일이 없어서)
      if (!연결) wl.onclick = function () { toast('현장업무에 연결된 현장만 기사접속 링크를 넣을 수 있습니다 (위의 현장업무 연결)'); };
      // A안 (11/6 사장님): 현장명 칸 아래 한 줄 — [길안내] [주소 복사] [기사링크] (예전엔 라벨 옆이라 버튼이 다음 줄로 밀림)
      var tools = document.createElement('div'); tools.className = 'name-bar';
      /* 🧭 길안내 (11/6 사장님: 카카오내비·티맵 상관없이) — 안드로이드 geo: 링크. 폰에 깔린 내비·지도 앱(티맵·카카오내비·카카오맵·네이버지도)
         중 고르는 창이 뜨고, '항상' 을 누르면 다음부터 그 앱으로 바로. 앱이 검색 화면으로 열릴 때 붙여넣게 주소도 복사해 둔다 */
      var goBtn = document.createElement('button');
      goBtn.type = 'button'; goBtn.className = 'nav-copy nav-go';
      goBtn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11l18-8-8 18-2-8-8-2z"/></svg>길안내';
      goBtn.onclick = function () {
        var addr = Share.navAddress(Store.getSite(s.id) || s);
        if (!addr) { toast('현장명을 먼저 적어주세요'); return; }
        try { if (navigator.clipboard) navigator.clipboard.writeText(addr); } catch (e) { /* 복사 못 해도 길안내는 */ }
        toast('🧭 ' + addr + ' — 내비 앱을 고르세요 (항상 누르면 다음부터 바로)');
        location.href = 'geo:0,0?q=' + encodeURIComponent(addr);
      };
      tools.appendChild(goBtn); tools.appendChild(navBtn); tools.appendChild(wl);
      wl.classList.toggle('on', wcb.checked);
      wcb.addEventListener('change', function () { wl.classList.toggle('on', wcb.checked); });
    }
    var ctl = document.createElement('div'); ctl.className = 'fctl';
    row.appendChild(cb); row.appendChild(label); row.appendChild(ctl);
    if (f.key === 'name') row.appendChild(tools);   // 칸 아래 한 줄

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
      // ❓ 이 현장은 이 사람에게 묻기 (거래처 질문 담당보다 먼저) · 카톡이면 방 이름
      var ctlRow = askControls(r, function (patch) {
        rows.forEach(function (x, j) { if (j === i) Object.assign(x, patch); else if (patch.ask) x.ask = false; });
        commit(); renderOwners(ctl, Store.getSite(s.id) || s, save);
      });
      if ((r.via || '') === 'kakao') {
        var rm = document.createElement('input'); rm.type = 'text'; rm.className = 'owner-room'; rm.placeholder = '카톡방 이름'; rm.value = r.kakaoRoom || ''; rm.autocomplete = 'off';
        rm.addEventListener('input', function () { r.kakaoRoom = rm.value.trim(); commit(); });
        ctlRow.appendChild(rm);
      }
      list.appendChild(ctlRow);
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
      /* 한 줄 = 카드 (2026-11-10 사장님 C안): 시공위치가 화면 폭 전체, 길면 저절로 줄바꿈해 다 보인다.
         그 아래 필름번호·필요량. 칸마다 작은 이름표를 달아 어느 칸인지 구분 */
      var line = document.createElement('div'); line.className = 'film-row';
      line.innerHTML = '<div class="fr-body">' +
        '<label class="fr-f fr-place"><span>시공위치</span><textarea class="place" rows="1" data-no-stamp placeholder="예: 안방화장실문·문틀 (엔터로 다음 구역)">' + esc(r.place) + '</textarea></label>' +
        '<div class="fr-l2">' +
          '<label class="fr-f fr-code"><span>필름번호</span><input type="text" class="code" placeholder="PS035" value="' + esc(r.code) + '"></label>' +
          // 필요량 (2026-11-01 사장님) — 주문 문자에 번호 뒤로 들어간다. 목록에 없는 옛 값도 그대로 보인다
          '<label class="fr-f fr-qty"><span>필요량</span><select class="qty" title="필요량"><option value="">선택</option>' +
          Share.FILM_QTYS.concat(r.qty && Share.FILM_QTYS.indexOf(r.qty) < 0 ? [r.qty] : []).map(function (q) {
            return '<option' + (q === r.qty ? ' selected' : '') + '>' + esc(q) + '</option>';
          }).join('') + '</select></label>' +
        '</div></div>' +
        '<button type="button" class="x" title="줄 삭제">×</button>';
      var place = line.querySelector('.place');
      var grow = function () { place.style.height = 'auto'; place.style.height = place.scrollHeight + 'px'; };
      // 엔터 = 칸 안에서 다음 줄 (2026-11-10 사장님: 구역마다 줄을 나눠 적기). 문자·공유처럼 한 줄로 나갈 땐 ' · ' 로 이어진다 (Share.placeLine)
      place.addEventListener('input', grow);
      // 탭이 가려진 채 그려지면 높이를 못 잰다 — 보일 때 다시 잰다
      requestAnimationFrame(grow);
      place.addEventListener('focus', grow);
      if (window.IntersectionObserver) new IntersectionObserver(function (es) { if (es.some(function (e) { return e.isIntersecting; })) grow(); }).observe(place);
      // 줄마다 [주문] 버튼은 뺐다 (2026-10-24 사장님: 번거롭다 — 위 단계 띠의 '필름 주문' 으로 충분)
      // 준비됨 ☑ — 줄 맨 앞. 아직 저장 안 된 빈 첫 줄이면 먼저 저장하고 토글한다
      line.insertBefore(checkBtn(r.ready, function () {
        if (!Store.getSite(s.id).films[i]) save({ films: films.slice() });
        var u = Store.toggleFilm(s.id, i);
        films[i].ready = !!(u && u.films[i] && u.films[i].ready);
        return films[i].ready;
      }), line.firstChild);
      var upd = function () {
        films[i] = Object.assign({}, films[i], { place: line.querySelector('.place').value, code: line.querySelector('.code').value,
          qty: line.querySelector('.qty').value, ready: !!films[i].ready });
        save({ films: films.slice() });
      };
      line.querySelector('.place').addEventListener('input', upd);
      line.querySelector('.code').addEventListener('input', upd);
      line.querySelector('.qty').addEventListener('change', function () { upd(); askFilmOrder(s.id); });
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
      // 보낸 주문 기록 — 그 필름 줄 바로 아래 '📦 11/1 멋진필름·주문담당 ps170 1롤 주문' (2026-11-01 사장님). 같은 번호가 여러 줄이면 첫 줄에만
      var firstOfCode = films.findIndex(function (f) { return Share.filmKey(f && f.code) === Share.filmKey(r.code); }) === i;
      if (firstOfCode) Share.filmOrderLines(s, r.code).forEach(function (t) {
        ctl.appendChild(el2('div', 'film-ordered', '📦 ' + t));
      });
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
    // 문자 본문은 💬 를 누르는 순간 만든다 (2026-11-01) — 그려 둔 뒤 고친 필름 번호·필요량도 들어가게
    var 본문Now = function () {
      // 첫 줄 인사 + (퀵서비스용 현장주소 켰을 때만 [현장명]) + 필름 (2026-11-01)
      return Share.filmOrderSms({ name: (site && site.name) || '', unit: site && site.unit, size: site && site.size, films: films },
        !!state.settings.smsSiteName);
    };
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
      var sms = document.createElement(p.phone ? 'a' : 'button');
      sms.className = 'fv-chip-sms'; sms.textContent = '💬';
      if (p.phone) {
        sms.href = smsHref(p.phone, 본문Now());
        sms.title = who + ' 에게 문자 — 필름명·필요량이 채워집니다';
        sms.onclick = function (e) {
          var body = 본문Now();
          if (!body) { e.preventDefault(); toast('적힌 필름 번호가 없습니다'); return; }
          sms.href = smsHref(p.phone, body);   // 누르는 순간의 필름·필요량
          toast('필름명이 채워진 문자창이 열립니다 — 보내기만 누르세요');
        };
      } else {
        sms.type = 'button'; sms.title = '번호 없음';
        sms.onclick = function () { toast(who + ' 번호가 없습니다 — 설정 › 현장준비 › 필름 거래처에서 넣으세요'); };
      }
      pill.appendChild(call); pill.appendChild(sms);
      // 📨 = 바로 주문 (2026-11-01 사장님) — 사장님 폰(SMS Gateway)이 바로 보내고 필름 탭에 기록 (추가 주문도 남게)
      if (p.phone && site) {
        var now = document.createElement('button');
        now.type = 'button'; now.className = 'fv-chip-sms'; now.textContent = '📨';
        now.title = who + ' 에게 바로 주문 문자 (사장님 폰에서 발송, 필름 탭에 기록)';
        now.onclick = function () { sendFilmOrderNow(site, films, vendor.name + '·' + who, p.phone); };
        pill.appendChild(now);
      }
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
    filmAddOrder();   // 필름 추가 주문은 백업과 상관없이 (문자는 바로 나간다)
    if (!state.settings.backupKey) { toast('저장됨 (백업키가 없어 폰에만 저장)'); return; }
    if (!Store.pendingCount()) { toast('저장됨 — 백업까지 완료'); workerNowSend(); return; }
    toast('저장 중...');
    Store.flush().then(function (ok) {
      toast(ok ? '저장됨 — 백업까지 완료' : '폰에 저장됨 — 백업은 잠시 뒤 다시 보냅니다');
      if (ok) workerNowSend();
    });
  }
  /* 🎞 저장하자마자 추가 필름 주문 (2026-11-11 사장님: 주문을 보낸 뒤 필름을 더 넣으면 주문 문자가 안 갔다).
     이 현장에 이미 주문한 적이 있고, 번호·필요량을 다 적은 새 줄이 있으면 지난번 주문처에 그 줄만 '📨 추가 주문' 창으로 (보내기를 눌러야 나감).
     보내면 그 줄에 주문한 날(orderedAt)을 남겨 다시 안 묻는다. 처음 주문은 지금처럼 결재함·텔레그램 버튼으로 */
  function filmAddOrder() {
    var s = Store.getSite(currentSiteId);
    if (!s || !(s.filmOrders || []).length || s.filmVendor) return;
    var rows = Share.filmPendingRows(s);
    if (!rows.length) return;
    var v = Share.filmLastVendor(s, state.settings);
    if (!v || !v.phone) { toast('추가 필름 주문: ' + (v ? v.to + ' 번호가 없어요' : '주문처를 몰라요') + ' — 필름 탭 주문처 📨 로 보내 주세요'); return; }
    var films = rows.map(function (i) { return Object.assign({}, s.films[i], { ready: false }); });
    // [취소] 한 같은 줄들은 저장할 때마다 또 묻지 않는다 (필요하면 필름 탭 주문처 📨)
    var sig = films.map(function (r) { return r.code + ' ' + r.qty + ' ' + r.place; }).join('|'), skipKey = 'filmAddSkip:' + s.id;
    try { if (localStorage.getItem(skipKey) === sig) return; localStorage.setItem(skipKey, sig); } catch (e) { /* */ }
    sendFilmOrderNow(s, films, v.to, v.phone, function () {
      var cur = Store.getSite(s.id); if (!cur) return;
      var today = Share.todayIso();
      Store.updateSite(s.id, { films: (cur.films || []).map(function (r, i) { return rows.indexOf(i) >= 0 ? Object.assign({}, r, { orderedAt: today }) : r; }) });
    }, '🎞 추가 필름 주문');
  }
  /* 📨 저장하자마자 내일 작업자 안내 (2026-11-11 사장님: 낮 12시 일괄 문자 뒤에 인원을 넣으면 문자가 안 갔다).
     낮 12시가 지났고 이 현장에 내일 일하는 사람이 있으면, n8n 업무일정표(workerNow)가 백업을 읽어 아직 안내를 못 받은 사람에게만 바로 보낸다.
     12시에 받은 사람·이미 보낸 사람은 또 안 간다 (n8n 이 보낸 기록을 가진다). 12시 전이면 12시에 같이 간다 */
  function workerNowSend() {
    var s = Store.getSite(currentSiteId);
    if (!s || !ownerKeyOn() || new Date().getHours() < 12) return;
    var tmr = Share.addDays(Share.todayIso(), 1);
    var day = (s.days || []).filter(function (d) { return d && d.date === tmr; })[0];
    if (!day || !(day.staff || []).some(function (n) { return n && n !== '김정헌'; })) return;
    reportPost({ action: 'workerNow', siteId: s.id }).then(function (d) {
      var msg = [];
      if ((d.sent || []).length) msg.push('📨 ' + d.sent.join(', ') + '님께 내일 현장 안내 문자 보냄');
      if ((d.pickup || []).length) msg.push('🚗 ' + d.pickup.join(', ') + '님은 픽업이라 문자 안 보냄');
      if ((d.noPhone || []).length) msg.push('❗ 번호 없어 못 보냄: ' + d.noPhone.join(', '));
      if (msg.length) toast(msg.join(' · '));
    }).catch(function () { toast('내일 작업자 안내 문자를 못 보냈어요 — 잠시 뒤 다시 저장해 주세요'); });
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
    if (team.length > 1) {
      var picks = Share.recruitPickOf(null, state.settings);
      var ob = el2('button', 'team-order-btn', '🔢 문자 보낼 사람 고르기 (' + picks.length + '명)'); ob.type = 'button';
      ob.title = '인원 모집 문자는 고른 사람에게만, 고른 순서대로 갑니다';
      ob.onclick = openTeamOrder;
      // 🚗 차량번호 복사 (2026-11-11 사장님: 내일 일할 사람 차량번호를 관리실에 보낼 때)
      var cb = el2('button', 'team-order-btn', '🚗 차량번호 복사'); cb.type = 'button';
      cb.onclick = openCarCopy;
      var obw = el2('div', 'team-order-btns'); obw.appendChild(cb); obw.appendChild(ob);
      box.appendChild(obw);
      // 정렬 스위치 (사장님 11/6) — 보기용. 다 끄면 명단 순서
      var sws = el2('div', 'team-sorts');
      [['teamSortPay', '페이별'], ['teamSortGrade', '등급별']].forEach(function (a) {
        var sw = document.createElement('label'); sw.className = 'team-sort';
        sw.appendChild(document.createTextNode(a[1]));
        var inp = document.createElement('input'); inp.type = 'checkbox'; inp.setAttribute('role', 'switch'); inp.checked = !!state.settings[a[0]];
        inp.onchange = function () { var p = {}; p[a[0]] = inp.checked; Store.setSettings(p); renderTeamList(); };
        sw.appendChild(inp); sw.appendChild(el2('span', 'team-sort-sw'));
        sws.appendChild(sw);
      });
      box.appendChild(sws);
    }
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
    shown = Share.teamSorted(shown, state.settings.people, { pay: !!state.settings.teamSortPay, grade: !!state.settings.teamSortGrade });
    var pickNo = Share.recruitPickOf(null, state.settings);
    if (team.length && !shown.length) {
      var none = document.createElement('div'); none.className = 'sec-empty';
      none.textContent = teamTab + '등급인 사람이 아직 없습니다. [수정]에서 등급을 정할 수 있습니다.';
      box.appendChild(none);
    }
    // 한 줄 = 이름+등급+페이 · [수정] [전화] [일정] [×] (2026-10-16).
    // 전화번호는 글자로 띄우지 않는다 — [전화]로 바로 걸고, 번호가 없으면 그 버튼이 비활성
    shown.forEach(function (name, shownAt) {
      var i = team.indexOf(name);
      var p = Share.personOf(state.settings.people, name);
      // 한 사람 = 테두리 칸 2줄 (11/2 사장님): 번호 이름(일당) · A B C F · ✕ / 수정 전화 문자 일정
      var row = document.createElement('div'); row.className = 'team-row team-card';
      var main = document.createElement('div'); main.className = 'team-main';
      var t = document.createElement('div'); t.className = 'slist-name';
      t.appendChild(el2('span', 'team-no', String(shownAt + 1)));   // 지금 보이는 차례
      t.appendChild(document.createTextNode(name));
      // 이름 뒤에 일당 — 서영호(23). 없으면 회색 (일당?) — 모집 문자 대상이 안 된다
      var pay = el2('span', 'team-pay' + (p.pay ? '' : ' none'), p.pay ? '(' + p.pay + ')' : '(일당?)');
      pay.title = p.pay ? '일당 ' + p.pay + '만원' : '일당이 없으면 인건비 참고 합계에서 빠집니다 — [수정]에서 페이를 넣으세요';
      t.appendChild(pay);
      var pn = pickNo.indexOf(name);
      if (pn >= 0) t.appendChild(el2('span', 'team-pick', '📨 ' + (pn + 1)));
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
      x.textContent = '✕';
      // 등급 A B C F — 누르면 바로 바뀌고, 같은 등급을 다시 누르면 빠진다(미정)
      var gs = el2('div', 'team-grades');
      Share.PERSON_GRADES.forEach(function (g) {
        var b = el2('button', 'team-g g-' + g + (p.grade === g ? ' on' : ''), g); b.type = 'button';
        b.title = p.grade === g ? '등급 ' + g + ' 빼기' : '등급 ' + g;
        b.onclick = function (e) {
          e.stopPropagation();
          Store.setSettings({ people: Share.mergePerson(state.settings.people, name, { grade: p.grade === g ? '' : g }) });
          renderTeamList();
        };
        gs.appendChild(b);
      });
      var l1 = el2('div', 'team-l1'), l2 = el2('div', 'team-l2');
      l1.appendChild(main); l1.appendChild(gs); l1.appendChild(x);
      l2.appendChild(edit); l2.appendChild(call); l2.appendChild(sms); l2.appendChild(cal);
      row.appendChild(l1); row.appendChild(l2);
      if (sub) row.appendChild(sub);   // 📒 작업내역은 칸 맨 아래
      box.appendChild(row);
    });
  }
  /* 🔢 순서 빠르게 정하기 (11/2 사장님, 할 일 순서와 같은 방식) — 원하는 순서대로 탭하면 1, 2, 3 …, 다시 탭하면 빠진다.
     저장하면 안 누른 것은 누른 것 뒤에 지금 순서대로 붙는다. items = [{ key, label, sub }], onSave(키 순서) */
  // opt.only: 고른 사람만 저장 (안 고른 사람은 뒤에 붙이지 않는다), opt.picked: 처음에 골라 둔 것
  function openTapOrder(title, hint, items, onSave, extra, opt) {
    opt = opt || {};
    var picked = (opt.picked || []).slice();
    openModal(title, '<p class="hint" style="margin:0 0 6px">' + esc(hint) + '</p><div class="order-list"></div><div class="order-count"></div>',
      (extra || []).concat([
        { label: '초기화', onClick: function () { picked = []; paint(); } },
        { label: '💾 저장', cls: 'primary', onClick: function () {
          var rest = items.map(function (it) { return it.key; }).filter(function (k) { return picked.indexOf(k) < 0; });
          closeModal(); onSave(opt.only ? picked.slice() : picked.concat(rest));
        } }
      ]));
    var wrap = $('modalBody').querySelector('.order-list'), count = $('modalBody').querySelector('.order-count');
    var paint = function () {
      wrap.innerHTML = '';
      items.forEach(function (it) {
        var n = picked.indexOf(it.key) + 1;
        var row = el2('button', 'order-row' + (n ? ' on' : '')); row.type = 'button';
        row.onclick = function () { var j = picked.indexOf(it.key); if (j >= 0) picked.splice(j, 1); else picked.push(it.key); paint(); };
        row.appendChild(el2('span', 'order-num', n ? String(n) : ''));
        row.appendChild(el2('span', 'order-title', it.label));
        if (it.sub) row.appendChild(el2('span', 'order-sub', it.sub));
        if (opt.only) row.appendChild(el2('span', 'order-tag' + (n ? '' : ' off'), n ? '문자 감' : '문자 안 감'));
        wrap.appendChild(row);
      });
      count.textContent = opt.only ? picked.length + '명에게 순서대로 문자' : picked.length + ' / ' + items.length + '명 지정됨';
    };
    paint();
  }
  function personOrderItem(n) {
    var p = Share.personOf(state.settings.people, n);
    return { key: n, label: n, sub: [p.grade, p.pay].filter(Boolean).join(' · ') || '일당?' };
  }
  /* 🚗 차량번호 복사 (2026-11-11 사장님) — 사람을 눌러 고르면 고른 순서대로 차량번호만 한 줄에 한 대씩 복사.
     처음엔 내일 현장에 들어가는 사람이 골라져 있다. 차량번호가 없는 사람은 회색 (설정 → 팀원 → 수정 에서 넣기) */
  function openCarCopy() {
    var cfg = state.settings;
    var team = Share.teamSorted(cfg.team || [], cfg.people, { pay: !!cfg.teamSortPay, grade: !!cfg.teamSortGrade });
    var carOf = function (n) { return String(Share.personOf(cfg.people, n).car || '').trim(); };
    var tmr = Share.addDays(Share.todayIso(), 1), picked = [];
    (state.sites || []).forEach(function (st) {
      if (st.hide) return;
      (st.days || []).forEach(function (d) {
        if (d && d.date === tmr) (d.staff || []).forEach(function (n) { if (team.indexOf(n) >= 0 && carOf(n) && picked.indexOf(n) < 0) picked.push(n); });
      });
    });
    var cars = function () {
      var out = [];
      picked.forEach(function (n) { var c = carOf(n); if (c && out.indexOf(c) < 0) out.push(c); });
      return out;
    };
    openModal('🚗 차량번호 복사', '<p class="hint" style="margin:0 0 6px">보낼 사람을 누르세요. 맨 위 \'차량번호 알려드려요\' 아래로 차량번호가 한 줄에 한 대씩 복사됩니다.' +
      (picked.length ? ' 내일(' + esc(Share.shortDate(tmr)) + ') 일하는 사람이 골라져 있어요.' : '') + '</p><div class="order-list"></div><div class="order-count"></div>',
      [{ label: '닫기', onClick: closeModal },
       { label: '초기화', onClick: function () { picked = []; paint(); } },
       { label: '📋 복사', cls: 'primary', onClick: function () {
         var list = cars();
         if (!list.length) { toast('고른 사람 중 차량번호가 있는 사람이 없어요'); return; }
         closeModal(); copyText(['차량번호 알려드려요'].concat(list).join('\n'), '차량번호 ' + list.length + '대 복사됨 — 카톡/문자에 붙여넣기 하세요');
       } }]);
    var wrap = $('modalBody').querySelector('.order-list'), count = $('modalBody').querySelector('.order-count');
    var paint = function () {
      wrap.innerHTML = '';
      team.forEach(function (n) {
        var car = carOf(n), k = picked.indexOf(n) + 1;
        var row = el2('button', 'order-row' + (k ? ' on' : '') + (car ? '' : ' nocar')); row.type = 'button';
        row.onclick = function () {
          if (!car) { toast(n + ' 님은 차량번호가 없어요 — 수정 에서 넣어 주세요'); return; }
          var j = picked.indexOf(n); if (j >= 0) picked.splice(j, 1); else picked.push(n); paint();
        };
        row.appendChild(el2('span', 'order-num', k ? String(k) : ''));
        row.appendChild(el2('span', 'order-title', n));
        row.appendChild(el2('span', 'order-sub', car || '차량번호 없음'));
        wrap.appendChild(row);
      });
      var list = cars();
      count.textContent = list.length ? list.length + '대: ' + list.join(' / ') : '아직 고른 사람이 없어요';
    };
    paint();
  }
  // 기본 문자 명단 — 현장에서 따로 고르지 않으면 이 사람들에게, 이 순서로
  function openTeamOrder() {
    openRecruitPick('🔢 문자 보낼 사람 고르기', Share.recruitPickOf(null, state.settings), function (order) {
      Store.setSettings({ recruitPick: order }); renderTeamList(); toast('문자 보낼 ' + order.length + '명을 저장했어요');
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
  // 📋 여러 명 한꺼번에 넣기 (11/2 사장님 — 문자 기록에서 뽑은 명단). 한 줄에 '이름 구분 번호 일당'
  $('btnTeamPaste').onclick = function () {
    openModal('📋 여러 명 한꺼번에 넣기',
      '<p class="hint" style="margin:0 0 6px">한 줄에 한 사람 — <b>이름 구분 번호 일당</b> (예: 김기사 준기공 010-1234-5678 15). 일당은 없어도 됩니다.</p>' +
      '<textarea id="teamPasteText" rows="9" style="width:100%;font-size:14px" placeholder="여기에 붙여 넣기"></textarea>' +
      '<p id="teamPasteInfo" class="hint" style="margin-top:6px"></p>', [
      { label: '취소', onClick: closeModal },
      { label: '넣기', cls: 'primary', onClick: function () {
        var rows = Share.parseTeamPaste($('teamPasteText').value);
        if (!rows.length) { toast('넣을 사람이 없어요 — 줄마다 이름과 번호가 있어야 합니다'); return; }
        var r = Share.mergeTeamPaste(state.settings.team, state.settings.people, rows);
        Store.setSettings({ team: r.team, people: r.people });
        closeModal(); teamTab = ''; renderTeamList();
        modalConfirm('📋 넣었어요', '새로 넣음 ' + r.added.length + '명' + (r.filled.length ? '\n빈 칸 채움: ' + r.filled.join(', ') : '') +
          (r.skipped.length ? '\n건너뜀 (같은 이름, 다른 번호): ' + r.skipped.join(', ') : '') +
          '\n\n일당이 없는 사람은 [수정]에서 페이를 넣어야 인원 모집 문자 대상이 됩니다.', '확인');
      } }
    ]);
    var ta = $('teamPasteText');
    ta.oninput = function () {
      var rows = Share.parseTeamPaste(ta.value);
      $('teamPasteInfo').textContent = rows.length ? rows.length + '명 읽음 — ' + rows.slice(0, 6).map(function (x) { return x.name + (x.pay ? '(' + x.pay + ')' : ''); }).join(', ') + (rows.length > 6 ? ' …' : '') : '';
    };
  };
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

  /* 업체 확인 질문 (2026-11-01 사장님) — 설정 › 문구. 글을 누르면 고치기, [확답만] 은 '네' 만 받으면 되는 부탁,
     [쉼] 은 잠시 안 묻기, ↑↓ 순서(업체에 가는 번호 순서), × 빼기. id 는 그대로 두어 이미 받은 답이 따라간다 */
  function checksNow() { return Share.normalizeChecks(state.settings.checks); }
  function saveChecks(list) { Store.setSettings({ checks: list }); renderCheckList(); }
  function renderCheckList() {
    var box = $('checkList'), list = checksNow();
    box.innerHTML = '';
    if (!list.length) { var e = el2('div', 'sec-empty', '아직 없음'); box.appendChild(e); }
    list.forEach(function (c, i) {
      var row = el2('div', 'slist-row rvq-row chk-set' + (c.off ? ' off' : ''));
      var nm = el2('button', 'slist-name rvq-name', (i + 1) + '. ' + c.text); nm.type = 'button'; nm.title = '눌러서 고치기';
      nm.onclick = function () {
        modalPrompt('업체 확인 질문 고치기', c.text).then(function (v) {
          var to = String(v == null ? '' : v).trim();
          if (!to || to === c.text) return;
          var next = checksNow(); next[i].text = to; saveChecks(next);
        });
      };
      var ok = el2('button', 'chk-tog' + (c.ok ? ' on' : ''), '확답만'); ok.type = 'button'; ok.title = "'네' 만 받으면 되는 부탁";
      ok.onclick = function () { var next = checksNow(); next[i].ok = !next[i].ok; saveChecks(next); };
      var off = el2('button', 'chk-tog' + (c.off ? ' on' : ''), '쉼'); off.type = 'button'; off.title = '잠시 안 묻기';
      off.onclick = function () { var next = checksNow(); next[i].off = !next[i].off; saveChecks(next); };
      var up = el2('button', 'rvq-mv', '↑'); up.type = 'button'; up.disabled = i === 0;
      up.onclick = function () { var next = checksNow(); next.splice(i - 1, 0, next.splice(i, 1)[0]); saveChecks(next); };
      var dn = el2('button', 'rvq-mv', '↓'); dn.type = 'button'; dn.disabled = i === list.length - 1;
      dn.onclick = function () { var next = checksNow(); next.splice(i + 1, 0, next.splice(i, 1)[0]); saveChecks(next); };
      var x = el2('button', 'x', '×'); x.type = 'button'; x.title = '빼기';
      x.onclick = function () {
        modalConfirm('질문 빼기', '"' + c.text + '" 를 더는 묻지 않습니다. 이미 받은 답은 그 현장에 남습니다.', '빼기', true).then(function (yes) {
          if (!yes) return;
          var next = checksNow(); next.splice(i, 1); saveChecks(next);
        });
      };
      [nm, ok, off, up, dn, x].forEach(function (b) { row.appendChild(b); });
      box.appendChild(row);
    });
  }
  (function () {
    var add = function () {
      var v = $('checkInput').value.trim();
      if (!v) return;
      var list = checksNow();
      if (list.some(function (c) { return c.text === v; })) { toast('이미 있습니다'); return; }
      list.push({ id: 'c' + Date.now().toString(36), text: v, ok: false, off: false });
      $('checkInput').value = '';
      saveChecks(list);
    };
    $('btnAddCheck').onclick = add;
    $('checkInput').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); add(); } });
  })();
  // 현장 › 기본·출입 › 업체 확인 — 질문마다 답 칸. 노트북이 업체 답을 넣으면 '카톡 방 날짜' 가 붙는다. 손으로 적어도 된다
  function renderCheckSection(box, siteId) {
    var s = Store.getSite(siteId), list = checksNow().filter(function (c) { return !c.off || Share.checkAnswer(s, c.id); });
    box.className = 'sec chk-sec';
    box.innerHTML = '';
    if (!list.length) return;
    var asked = list.filter(function (c) { return !Share.checkSkipped(s, c.id); });
    var got = asked.filter(function (c) { return Share.checkAnswer(s, c.id); }).length;
    var head = el2('div', 'chk-head');
    head.appendChild(el2('h3', '', '업체 확인'));
    head.appendChild(el2('span', 'chk-count', got + ' / ' + asked.length + ' 받음'));
    box.appendChild(head);
    var save = function (all) { Store.updateSite(siteId, { checks: all }); renderCheckSection(box, siteId); };
    var checksOf = function () { return Object.assign({}, Store.getSite(siteId).checks || {}); };
    list.forEach(function (c) {
      var a = (s.checks || {})[c.id];
      var v = Share.checkAnswer(s, c.id);
      var skipped = Share.checkSkipped(s, c.id);   // '이 현장은 안 물음' (사장님 11/1). 다시 누르면 묻기로 돌아간다
      var row = el2('div', 'chk-row' + (skipped ? ' skip' : v ? ' done' : ''));
      var mark = el2('span', 'chk-mark');
      mark.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.500 4.500L19 7.500"/></svg>';
      row.appendChild(mark);
      row.appendChild(el2('div', 'chk-q', Share.checkText(c, s)));
      var body = el2('div', 'chk-body');
      row.appendChild(body);
      box.appendChild(row);
      if (skipped) {
        var line = el2('div', 'chk-skipline');
        line.appendChild(el2('span', '', '이 현장은 안 물어요'));
        var again = el2('button', 'chk-again', '다시 묻기'); again.type = 'button';
        again.onclick = function () { var all = checksOf(); delete all[c.id]; save(all); };
        line.appendChild(again);
        body.appendChild(line);
        return;
      }
      var inp = document.createElement('input'); inp.type = 'text'; inp.className = 'chk-ans'; inp.value = v; inp.autocomplete = 'off';
      inp.placeholder = '업체 답을 적어 주세요';
      inp.setAttribute('aria-label', '업체 답');
      inp.addEventListener('change', function () {
        var all = checksOf(), t = inp.value.trim();
        if (t) all[c.id] = { v: t, src: '' }; else delete all[c.id];
        save(all);
      });
      body.appendChild(inp);
      if (v) {
        if (a && a.src) body.appendChild(el2('div', 'chk-src', a.src));
        return;
      }
      var acts = el2('div', 'chk-acts');
      // 전화로 확답 받았을 때 (사장님 11/6) — 답이 있으면 업체에 다시 묻지 않는다
      var yes = el2('button', 'chk-btn chk-yes', '확답 받음'); yes.type = 'button';
      yes.onclick = function () {
        var all = checksOf();
        all[c.id] = { v: '확답 받음', src: '전화 ' + Share.shortDate(Share.todayIso()) };
        save(all);
      };
      var skip = el2('button', 'chk-btn plain', '이 현장은 안 물음'); skip.type = 'button';
      skip.onclick = function () { var all = checksOf(); all[c.id] = { v: '', skip: true }; save(all); };
      acts.appendChild(yes); acts.appendChild(skip);
      body.appendChild(acts);
    });
  }

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
    $('reviewLink').value = state.settings.reviewLink || '';
    $('reviewLink').onchange = function () { Store.setSettings({ reviewLink: this.value.trim() }); toast('후기 링크를 저장했어요'); };
    if ($('appVer')) $('appVer').textContent = '버전 ' + (appVersion() || '—');
    renderSyncStatus();
    renderTeamList();
    renderFilmVendorList();
    renderSupplyDefaultList();
    renderServiceToolList();
    TaskUI.renderTaskRules($('taskRules'));
    renderReviewSettingLists();
    renderCheckList();
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

  /* ---------- 📥 카톡 정리 (2026-10-28 사장님) ----------
     업체 카톡방 대화를 붙여넣으면 AI(n8n 현장관리_카톡정리)가 현장별로 '앱 칸에 넣을 것'을 뽑아 이 카드에 쌓는다.
     방은 거래처 안에 여러 개 (pk디자인: 대표실장 · 대리). 방마다 이미 읽은 메시지를 기억해서 새 것만 보낸다 (kakao.js).
     사장님이 [저장] 을 눌러야 칸에 들어간다. 업체에 보내는 건 항상 사장님이 (복사 → 카톡 열기) */
  var KAKAO_URL = 'https://primary-production-a6fa.up.railway.app/webhook/kakao-digest';
  var kakaoOpen = true;
  function kakaoStamp() { return window.Stamp ? Stamp.stampText() : Share.todayIso(); }
  function kakaoInbox(c) { return Array.isArray(c && c.kakaoInbox) ? c.kakaoInbox : []; }
  function kakaoSetItem(clientId, id, patch) {
    var c = Store.getClient(clientId); if (!c) return;
    Store.updateClient(clientId, { kakaoInbox: kakaoInbox(c).map(function (it) { return it.id === id ? Object.assign({}, it, patch) : it; }) });
  }
  function kakaoAppend(text, add) { text = String(text || '').replace(/\s+$/, ''); return text ? text + '\n' + add : add; }
  // 한 줄 반영 — 칸에 넣고 '처리됨'. AS 는 접수하고 답장 초안을 띄운다
  function kakaoApply(clientId, it, quiet) {
    var s = Store.getSite(it.siteId);
    if (!s) { if (!quiet) toast('현장을 먼저 골라 주세요'); return false; }
    var tag = '[카톡 ' + it.room + ' ' + Share.shortDate(String(it.at || '').slice(0, 10) || Share.todayIso()) + ']';
    var src = Object.assign({}, s.fieldSrc || {});
    if (it.kind === 'field') {
      var p = {};
      p[it.field] = (it.field === 'carReg' || it.field === 'cargoEv') ? Object.assign({}, s[it.field] || {}, { v: it.value }) : it.value;
      src[it.field] = it.room + ' ' + Share.shortDate(Share.todayIso());
      p.fieldSrc = src;
      Store.updateSite(s.id, p);
    } else if (it.kind === 'films') {
      src.films = it.room + ' ' + Share.shortDate(Share.todayIso());
      Store.updateSite(s.id, { films: Kakao.mergeFilms(s.films, it.films), fieldSrc: src });
    } else if (it.kind === 'note') {
      Store.updateSite(s.id, { note: kakaoAppend(s.note, it.value) });
    } else if (it.kind === 'as') {
      Store.addService(s.id, { kind: 'AS', request: it.value, bizContact: it.room });
      kakaoSetItem(clientId, it.id, { status: 'done' });
      if (!quiet) kakaoReply(clientId, it, s);
      return true;
    } else {   // schedule · other → 메모 맨 아래
      Store.updateSite(s.id, { memo: kakaoAppend(s.memo, tag + ' ' + it.value + (it.date ? ' (' + Share.dayLabel(it.date) + ')' : '')) });
    }
    kakaoSetItem(clientId, it.id, { status: 'done' });
    return true;
  }
  function openKakaoApp(text, okMsg) {
    copyText(text, okMsg || '복사했어요 — 카톡에 붙여넣고 보내세요');
    setTimeout(function () { try { location.href = 'kakaotalk://launch'; } catch (e) { /* 카톡 없음 */ } }, 600);
  }
  // AS 답장 초안 — 일정이 빈 날 둘을 넣는다. 사장님이 날짜를 골라 바꿀 수 있다
  function kakaoReply(clientId, it, s) {
    var days = Kakao.freeDays(state.sites, Share.todayIso(), 4, Share.addDays);
    var picked = days.slice(0, 2);
    var text = function () {
      return '네 확인했습니다 🙏\n' + Share.titleLine(s) + ' ' + it.value + ' 건,\n해당 부분 사진 한 장 부탁드려요.\n방문 가능한 날은\n' +
        picked.map(function (d) { return ' · ' + Share.dayLabel(d) + ' 오전'; }).join('\n') + '\n중에 편하신 날 알려주세요!';
    };
    var paint = function () {
      $('kkReply').value = text();
      document.querySelectorAll('#modalBody .kk-day').forEach(function (b) { b.classList.toggle('on', picked.indexOf(b.dataset.d) >= 0); });
    };
    openModal('🛠 AS 접수했어요 — 답장 보내기',
      '<p class="hint">AS·추가 탭에 "' + esc(it.value) + '" 로 들어갔어요. 아래 답장을 ' + esc(it.room) + '님께 보내세요.</p>' +
      '<div class="kk-days">' + days.map(function (d) { return '<button type="button" class="kk-day" data-d="' + d + '">' + esc(Share.dayLabel(d)) + '</button>'; }).join('') + '</div>' +
      '<textarea id="kkReply" rows="8"></textarea>',
      [{ label: '닫기', onClick: closeModal }, { label: '📋 복사하고 카톡 열기', cls: 'primary', onClick: function () { var t = $('kkReply').value; closeModal(); openKakaoApp(t); } }]);
    document.querySelectorAll('#modalBody .kk-day').forEach(function (b) {
      b.onclick = function () {
        var at = picked.indexOf(b.dataset.d);
        if (at >= 0) picked.splice(at, 1); else picked.push(b.dataset.d);
        picked.sort(); paint();
      };
    });
    paint();
  }
  // 아직 못 받은 정보 — 2주 안에 시공하는 현장에서 질문할 칸이 비어 있는 것
  function kakaoMissing(clientId) {
    var today = Share.todayIso(), until = Share.addDays(today, 21);
    return Store.sitesOf(clientId).filter(function (s) { return !s.hide && s.date && s.date >= today && s.date <= until; }).map(function (s) {
      var keys = ['pwLobby', 'pwUnit', 'parking', 'toilet', 'films'].filter(function (k) {
        if (k === 'films') return !(s.films || []).some(function (r) { return r.code; });
        return Share.isEmpty(s, k);
      });
      return { site: s, keys: keys };
    }).filter(function (x) { return x.keys.length; });
  }
  function openKakaoPaste(clientId) {
    var c = Store.getClient(clientId); if (!c) return;
    var rooms = Kakao.rooms(c);
    var room = c.kakaoLastRoom && rooms.indexOf(c.kakaoLastRoom) >= 0 ? c.kakaoLastRoom : rooms[0] || '';
    var seenOf = function (r) { return ((c.kakaoSeen || {})[r] || {}); };
    var html = '<p class="hint">카톡방에서 대화를 길게 눌러 <b>복사</b>(PC 카톡은 Ctrl+A → Ctrl+C) 해서 붙여넣으세요. 이미 정리한 대화는 알아서 건너뛰어요.</p>' +
      '<div class="kk-rooms" id="kkRooms"></div>' +
      '<textarea id="kkText" rows="9" data-no-stamp placeholder="[pk디자인 대리] [오전 9:12] 세대비번 1902*0427이에요&#10;…"></textarea>' +
      '<p class="hint" id="kkMsg"></p>';
    openModal('📥 카톡 붙여넣기 — ' + c.name, html, [
      { label: '닫기', onClick: closeModal },
      { label: '✨ 정리하기', cls: 'primary', onClick: function () { kakaoRun(clientId, room, $('kkText').value); } }]);
    var paintRooms = function () {
      var box = $('kkRooms'); box.innerHTML = '';
      rooms.forEach(function (r) {
        var b = el2('button', 'kk-room' + (r === room ? ' on' : '')); b.type = 'button';
        b.appendChild(el2('b', '', '💬 ' + r));
        var last = seenOf(r).at;
        b.appendChild(el2('small', '', last ? '마지막 정리 ' + last : '처음'));
        b.onclick = function () { room = r; paintRooms(); };
        box.appendChild(b);
      });
      var add = el2('button', 'kk-room add', '＋ 방 추가'); add.type = 'button';
      add.onclick = function () {
        var keep = $('kkText').value;
        modalPrompt('카톡방 이름 (예: 대표실장, 대리)', '', '누구와의 방인가요?').then(function (name) {
          name = String(name || '').trim();
          if (name && rooms.indexOf(name) < 0) { rooms = rooms.concat([name]); Store.updateClient(clientId, { kakaoRooms: rooms }); room = name; }
          openKakaoPaste(clientId); $('kkText').value = keep;
        });
      };
      box.appendChild(add);
    };
    paintRooms();
  }
  function kakaoRun(clientId, room, text) {
    var c = Store.getClient(clientId); if (!c) return;
    if (!room) { $('kkMsg').textContent = '어느 방 대화인지 먼저 골라 주세요 (＋ 방 추가)'; return; }
    var all = Kakao.parse(text, Share.todayIso());
    if (!all.length) { $('kkMsg').textContent = '붙여넣은 대화가 없어요'; return; }
    var seen = ((c.kakaoSeen || {})[room] || {}).keys || [];
    var msgs = Kakao.fresh(all, seen);
    if (!msgs.length) { $('kkMsg').textContent = '모두 전에 정리한 대화예요 — 새 대화가 없어요'; return; }
    var sites = Store.sitesOf(clientId).filter(function (s) { return !s.hide || (s.date && s.date >= Share.addDays(Share.todayIso(), -60)); }).slice(0, 40).map(function (s) {
      var known = {};
      ['pwLobby', 'pwUnit', 'barrier', 'gate', 'parking', 'toilet', 'startTime'].forEach(function (k) { if (s[k]) known[k] = s[k]; });
      if ((s.films || []).length) known.films = s.films.map(function (r) { return (r.place ? Share.placeLine(r.place) + ' ' : '') + r.code; }).join(', ');
      return { id: s.id, name: Share.titleLine(s), date: s.date || '', known: known };
    });
    $('modalBtns').hidden = true;
    $('modalBody').innerHTML = '<div class="kk-wait"><div class="kk-spin"></div><b>' + msgs.length + '개 메시지 읽는 중…</b><p class="hint">10~20초 걸려요</p></div>';
    fetch(KAKAO_URL, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ room: { client: c.name, name: room }, today: Share.todayIso(), sites: sites, messages: msgs.map(function (m) { return { d: m.d, t: m.t, who: m.who, text: m.text }; }) }) })
      .then(function (res) {
        if (res.status === 401 || res.status === 403) throw new Error('이 기기에 사장님 열쇠가 없어요 (관리자 앱에서 등록한 기기만 정리할 수 있어요)');
        if (!res.ok) throw new Error('서버 오류 ' + res.status);
        return res.json();
      })
      .then(function (d) {
        if (!d || !d.ok) throw new Error('AI 가 답을 못 했어요 — 잠시 뒤 다시 해 주세요');
        var cur = Store.getClient(clientId);
        var at = Share.todayIso() + ' ' + kakaoStamp();
        var items = (d.items || []).map(function (it, i) {
          return Object.assign({}, it, { id: 'k' + Date.now().toString(36) + i, room: room, at: at, status: Kakao.sameAsSite(it, Store.getSite(it.siteId)) ? 'same' : 'new' });
        });
        var keep = kakaoInbox(cur).filter(function (it) { return it.status === 'new' || (it.status !== 'same' && String(it.at || '') >= Share.addDays(Share.todayIso(), -7)); });
        var seenAll = Object.assign({}, cur.kakaoSeen || {});
        seenAll[room] = { keys: Kakao.remember(seen, msgs), at: kakaoStamp() };
        Store.updateClient(clientId, { kakaoInbox: keep.concat(items.filter(function (x) { return x.status === 'new'; })), kakaoSeen: seenAll, kakaoLastRoom: room });
        closeModal();
        var n = items.filter(function (x) { return x.status === 'new'; }).length;
        toast(n ? '📥 ' + n + '개 새로 알게 됐어요 — 확인하고 저장하세요' : '새로 적을 현장 정보는 없었어요 (' + msgs.length + '개 메시지)');
        kakaoOpen = true; renderMain();
      })
      .catch(function (e) {
        $('modalBtns').hidden = false;
        $('modalBody').innerHTML = '<p class="admin-err">' + esc(e.message || String(e)) + '</p><p class="hint">붙여넣은 대화는 아직 정리 안 한 걸로 남아 있어요.</p>';
        $('modalBtns').innerHTML = ''; var b = el2('button', 'primary', '닫기'); b.onclick = closeModal; $('modalBtns').appendChild(b);
      });
  }
  function renderKakao(wrap, clientId) {
    if (Share.isPrivateClient(Store.getClient(clientId))) { wrap.innerHTML = ''; return; }
    if (!wrap) return;
    var c = Store.getClient(clientId);
    wrap.innerHTML = ''; wrap.hidden = !c;
    if (!c) return;
    var items = kakaoInbox(c).filter(function (it) { return it.status === 'new'; });
    var missing = kakaoMissing(clientId);
    wrap.className = 'fixed-wrap kk-wrap' + (kakaoOpen ? ' open' : '') + (items.length ? ' has' : '');
    var tg = el2('button', 'fixed-toggle'); tg.type = 'button';
    tg.innerHTML = '<span class="fixed-arrow">▶</span> 📥 카톡 정리 <span class="fixed-sub"></span>';
    tg.querySelector('.fixed-sub').textContent = items.length ? '새로 알게 된 것 ' + items.length + '개' : missing.length ? '못 받은 정보 ' + missing.length + '곳' : '업체 카톡 붙여넣으면 현장 칸에';
    if (items.length) tg.querySelector('.fixed-sub').classList.add('kk-badge');
    tg.onclick = function () { kakaoOpen = !kakaoOpen; renderKakao(wrap, clientId); };
    wrap.appendChild(tg);
    if (!kakaoOpen) return;
    var body = el2('div', 'fixed-body kk-body');
    var paste = el2('button', 'kk-paste', '📋 카톡 붙여넣기'); paste.type = 'button';
    paste.onclick = function () { openKakaoPaste(clientId); };
    body.appendChild(paste);
    var rerender = function () { renderKakao(wrap, clientId); renderCards(); };
    // 현장별로 묶기 (현장 모르는 것은 맨 아래)
    var groups = {}, order = [];
    items.forEach(function (it) {
      var k = Store.getSite(it.siteId) ? it.siteId : '';
      if (!groups[k]) { groups[k] = []; order.push(k); }
      groups[k].push(it);
    });
    order.sort(function (a, b) { return (a ? 0 : 1) - (b ? 0 : 1); });
    var sites = Store.sitesOf(clientId);
    order.forEach(function (sid) {
      var s = Store.getSite(sid);
      var box = el2('div', 'kk-site');
      var h = el2('div', 'kk-sh');
      h.appendChild(el2('b', '', s ? '📍 ' + Share.titleLine(s) : '❔ 어느 현장인지 모름'));
      if (s && s.date) h.appendChild(el2('small', '', Share.dayLabel(s.date)));
      box.appendChild(h);
      groups[sid].forEach(function (it) {
        var row = el2('div', 'kk-it k-' + it.kind);
        var tx = el2('div', 'kk-tx');
        var top = el2('div', 'kk-top');
        top.appendChild(el2('span', 'kk-k', Kakao.label(it)));
        top.appendChild(el2('span', 'kk-room-t', '💬 ' + it.room));
        tx.appendChild(top);
        var cur = s && it.kind === 'field' ? s[it.field] : '';
        if (cur && typeof cur === 'object') cur = cur.v;
        tx.appendChild(el2('div', 'kk-v', it.value));
        if (cur && cur !== '미확인') tx.appendChild(el2('div', 'kk-chg', '지금 적힌 값: ' + cur + ' → 바뀜'));
        if (it.quote) tx.appendChild(el2('q', 'kk-q', it.quote));
        if (!s) {
          var sel = el2('select', 'kk-pick');
          sel.innerHTML = '<option value="">현장 고르기…</option>' + sites.map(function (x) { return '<option value="' + esc(x.id) + '">' + esc(Share.titleLine(x)) + '</option>'; }).join('');
          sel.onchange = function () { kakaoSetItem(clientId, it.id, { siteId: sel.value }); rerender(); };
          tx.appendChild(sel);
        }
        row.appendChild(tx);
        var bt = el2('div', 'kk-bt');
        var ok = el2('button', 'btn-sm ' + (it.kind === 'as' ? 'danger' : 'primary'),
          it.kind === 'as' ? 'AS 접수' : it.kind === 'schedule' || it.kind === 'other' ? '메모에' : it.kind === 'note' ? '특이사항에' : it.kind === 'films' ? '반영' : '저장');
        ok.type = 'button'; ok.disabled = !s;
        ok.onclick = function () { if (kakaoApply(clientId, it)) { if (it.kind !== 'as') toast('✓ 현장 칸에 넣었어요'); rerender(); } };
        var no = el2('button', 'btn-sm kk-x', '✕'); no.type = 'button'; no.title = '버리기';
        no.onclick = function () { kakaoSetItem(clientId, it.id, { status: 'dismissed' }); rerender(); };
        bt.appendChild(ok); bt.appendChild(no);
        row.appendChild(bt);
        box.appendChild(row);
      });
      body.appendChild(box);
    });
    var bulk = items.filter(function (it) { return it.kind !== 'as' && Store.getSite(it.siteId); });
    if (bulk.length > 1) {
      var all = el2('button', 'kk-all', '✓ 모두 저장 (' + bulk.length + ')'); all.type = 'button';
      all.onclick = function () { bulk.forEach(function (it) { kakaoApply(clientId, it, true); }); toast('✓ ' + bulk.length + '개 넣었어요'); rerender(); };
      body.appendChild(all);
    }
    // 아직 못 받은 정보 → 질문 준비
    if (missing.length) {
      var mb = el2('div', 'kk-miss');
      mb.appendChild(el2('div', 'kk-mh', '❓ 아직 못 받은 정보 (3주 안 시공)'));
      missing.forEach(function (x) {
        var r = el2('div', 'kk-mr');
        var t = el2('div', 'kk-tx');
        t.appendChild(el2('b', '', Share.titleLine(x.site) + ' · ' + Share.dayLabel(x.site.date)));
        t.appendChild(el2('div', 'kk-v', x.keys.map(function (k) { return k === 'films' ? '필름 번호' : Kakao.FIELD_LABEL[k]; }).join(' · ')));
        r.appendChild(t);
        var q = el2('button', 'btn-sm kk-ask', '💬 질문'); q.type = 'button';
        q.onclick = function () {
          var text = Share.buildQuestion(x.site, x.keys, state.settings.questions) || ('[' + Share.titleLine(x.site) + ']');
          openModal('💬 질문 보내기', '<p class="hint">복사해서 업체 카톡방에 보내세요. 답이 오면 그 대화를 📋 카톡 붙여넣기 하면 칸에 들어가요.</p><textarea id="kkAsk" rows="8"></textarea>',
            [{ label: '닫기', onClick: closeModal }, { label: '📋 복사하고 카톡 열기', cls: 'primary', onClick: function () { var v = $('kkAsk').value; closeModal(); openKakaoApp(v); } }]);
          $('kkAsk').value = '안녕하세요 섬세한손길입니다 🙂\n' + text;
        };
        r.appendChild(q);
        mb.appendChild(r);
      });
      body.appendChild(mb);
    }
    if (!items.length && !missing.length) body.appendChild(el2('p', 'hint kk-empty', '새로 알게 된 것이 없어요. 업체 카톡방 대화를 복사해서 붙여넣으면 비번·화장실·필름·일정·AS 를 찾아 현장 칸에 넣어 드려요.'));
    wrap.appendChild(body);
  }

  /* ---------- 📬 카톡 우편함 (2026-10-31 카톡 '비서' 4단계) ----------
     노트북(카톡 읽기)이 시공 1주 전 빈칸(공동현관·세대 비번·화장실·필름)을 업체 카톡 방에 묻고, 답에서 뽑은 값을
     n8n 현장관리_빈칸 우편함에 둔다. 앱을 열 때·다시 볼 때·5분마다 가져와 이 기기에 있는 현장 칸에 바로 넣는다 (사장님: 확인 없이).
     이 기기에 없는 현장은 우편함에 남겨 다른 기기를 기다린다. 사장님 열쇠가 있는 기기만 */
  var FILL_URL = 'https://primary-production-a6fa.up.railway.app/webhook/site-fill-take';
  /* 🎞 필름 주문 (2026-11-01 사장님) — 필름 줄마다 필요량을 다 고르면 n8n(카톡_버튼 film-order)이 텔레그램에
     주문처 담당자 버튼을 띄운다. 누르면 사장님 폰(SMS Gateway)이 문자를 보내고, 우편함으로 '필름 주문' 단계가 온다 */
  var ORDER_URL = 'https://primary-production-a6fa.up.railway.app/webhook/film-order';
  function askFilmOrder(siteId) {
    var s = Store.getSite(siteId), body = s && Share.filmOrderAsk(s, state.settings), key = '';
    try { key = localStorage.getItem('ownerKey') || ''; } catch (e) { /* 저장소 막힘 */ }
    if (!body || !key) return;
    fetch(ORDER_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        Store.updateSite(siteId, { filmOrderAsk: body.text });   // 같은 내용은 한 번만
        toast(body.people.length ? '📨 텔레그램에 필름 주문 버튼을 보냈어요' : '📨 텔레그램에 보냈지만 주문처 담당자 번호가 없어요 — 설정 › 필름 주문처');
      })
      .catch(function () { toast('필름 주문 알림을 못 보냈어요 — 인터넷을 확인하고 필요량을 다시 골라 주세요'); });
  }
  // 📨 바로 주문 (2026-11-01 사장님): 필름 주문처 담당자 옆 📨 → 확인 → n8n 이 바로 사장님 폰으로 문자 → 필름 탭에 기록·'필름 주문' 단계.
  // 1롤인 줄 알았는데 더 필요해서 추가 주문할 때도 — ☑ 체크한 줄이 있으면 그 줄만 보낸다 (필름명 복사와 같은 규칙)
  function sendFilmOrderNow(site, films, to, phone, onSent, title) {
    var key = '';
    try { key = localStorage.getItem('ownerKey') || ''; } catch (e) { /* 저장소 막힘 */ }
    if (!key) { toast('이 기기는 사장님 열쇠가 없어 바로 보낼 수 없어요 — 💬 로 보내 주세요'); return; }
    var full = Share.filmOrderSms({ name: site.name || '', unit: site.unit, size: site.size, films: films }, !!state.settings.smsSiteName);
    if (!full) { toast('적힌 필름 번호가 없습니다'); return; }
    // 첫 줄(인사 문구)만 이 창에서 고친다 — 아래 필름·양은 그대로 (11/2 사장님)
    var cut = full.indexOf('\n'), body = full.slice(cut + 1);
    new Promise(function (resolve) {
      openModal(title || '📨 바로 주문', '<p class="hint" style="margin:0 0 6px">' + esc(to) + ' 에게 지금 이 문자를 보냅니다 (사장님 폰에서). 문구는 고칠 수 있어요.</p>' +
        '<textarea id="orderHello" rows="2" style="width:100%;font-size:15px"></textarea>' +
        '<div class="rc-pv" style="margin-top:6px">' + esc(body) + '</div>', [
        { label: '취소', onClick: function () { closeModal(); resolve(''); } },
        { label: '보내기', cls: 'primary', onClick: function () {
          var hello = String($('orderHello').value || '').trim();
          closeModal(); resolve((hello ? hello + '\n' : '') + body);
        } }
      ]);
      $('orderHello').value = full.slice(0, cut);
    }).then(function (text) {
      if (!text) return;
      toast('보내는 중…');
      fetch(ORDER_URL, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ siteId: site.id, name: Share.titleLine(site), text: text, sendTo: { label: to, phone: Share.phoneDigits(phone) } }) })
        .then(function (res) {
          return res.json().catch(function () { return {}; }).then(function (d) {
            if (!res.ok || !d.ok) throw new Error(d.error || ('HTTP ' + res.status));
          });
        })
        .then(function () {
          var cur = Store.getSite(site.id) || site;
          Store.updateSite(site.id, { filmStage: Math.max(Share.filmStageOf(cur), 2),
            filmOrders: (cur.filmOrders || []).concat([{ id: '', at: Share.todayIso(), to: to, items: Share.filmOrderText({ films: films }).split('\n').join(' · ') }]) });
          toast('✅ ' + to + '에게 보냈어요');
          if (onSent) onSent();
          workLog([{ src: 'me', kind: 'crew', title: '필름 주문 문자', detail: to, siteId: site.id }]);
          if (!$('viewSite').hidden) renderSite();
        })
        .catch(function (e) { toast('❌ 못 보냈어요 — 폰의 SMS Gateway 를 확인하고 💬 로 보내 주세요 (' + String(e.message || e).slice(0, 80) + ')'); });
    });
  }
  var fillBusy = false;
  function takeFills() {
    var key = '';
    try { key = localStorage.getItem('ownerKey') || ''; } catch (e) { /* 저장소 막힘 */ }
    if (fillBusy || !key || (typeof navigator !== 'undefined' && navigator.onLine === false)) return;
    fillBusy = true;
    var post = function (body) {
      return fetch(FILL_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
        .then(function (res) { if (!res.ok) throw new Error('HTTP ' + res.status); return res.json(); });
    };
    post({}).then(function (d) {
      var done = [], n = 0, changed = false;
      (d && d.fills || []).forEach(function (f) {
        var quiet = f.room === '결재함' || f.room === '직접 주문';
        // 결재함 [내가할께] → 그날 할 일 (2026-11-03). 현장이 이 기기에 있으면 현장에 이어 둔다
        if (f.kind === 'task') {
          var ts = Store.getSite(f.siteId);
          var exists = Store.tasks().some(function (t) { return t.title === f.title && (t.date === f.date || (f.vendor && !t.done)); });
          if (!exists && Store.addTask({ title: f.title, date: f.date, fromVendor: !!f.vendor, link: ts ? { type: 'site', id: ts.id, siteId: ts.id, label: Share.titleLine(ts) } : null })) n++;
          done.push(f.id);
          return;
        }
        // 결재함 [완료표시] 할 일 → 그 할 일 완료 (2026-11-03)
        if (f.kind === 'done' && f.what === 'task') {
          var tk = Store.getTask(f.taskId);
          if (tk && !tk.done && Store.completeTask(tk.id, '결재함 완료표시')) changed = true;
          done.push(f.id);
          return;
        }
        // 결재함 [되돌리기] 할 일 → 다시 안 한 일로 (2026-11-05)
        if (f.kind === 'undo' && f.what === 'task') {
          var tu = Store.getTask(f.taskId);
          if (tu && tu.done && Store.updateTask(tu.id, { done: false, doneAt: '', result: '' })) changed = true;
          done.push(f.id);
          return;
        }
        var s = Store.getSite(f.siteId);
        if (!s) return;   // 이 기기에 없는 현장
        var p = Kakao.fillPatch(s, f, (f.room || '카톡') + ' ' + Share.shortDate(f.at || Share.todayIso()));
        if (p) { Store.updateSite(s.id, p); changed = true; if (!quiet) n += f.kind === 'films' ? f.films.length : 1; }
        done.push(f.id);
      });
      if (!done.length) return;
      return post({ done: done }).then(function () {
        if (changed && apLast && !$('viewApprove').hidden) paintApprove(apLast);
        if (!n) return;
        toast('📬 카톡에서 ' + n + '칸 채웠어요');
        if (!$('viewSite').hidden) renderSite(); else if (!$('viewMain').hidden) renderMain();
      });
    }).catch(function () { /* 다음에 다시 */ }).then(function () { fillBusy = false; });
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden) { takeFills(); refreshApproveCount(); } });
  // 🎤 앱을 내리면 마이크 끔, 다시 열면 비서 화면이면 다시 듣기 (11/4)
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { clearTimeout(chatAutoT); if (chatRec) chatMicStop(); }
    else if (chatAuto && !$('viewOrder').hidden) chatAutoListen(700);
  });
  setInterval(function () { if (!document.hidden) takeFills(); }, 5 * 60 * 1000);

  // 📨 장문 문자(MMS) 받기 등록 (11/6) — 폰 문자 앱이 긴 답도 서버로 넘기게. 잘 되면 다시 안 한다
  function registerMmsHook() {
    var key = '';
    try {
      if (localStorage.getItem('mmsHookV1')) return;
      key = localStorage.getItem('ownerKey') || '';
    } catch (e) { return; }
    if (!key) return;
    Promise.all(['mms:downloaded', 'mms:received'].map(function (event) {
      return fetch('https://primary-production-a6fa.up.railway.app/webhook/crew-sms-hook', { method: 'POST',
        headers: { 'content-type': 'application/json', 'x-owner-key': key }, body: JSON.stringify({ event: event }) })
        .then(function (res) { return res.json(); })
        .then(function (d) { if (!d || !d.id) throw new Error('등록 안 됨'); });
    })).then(function () { try { localStorage.setItem('mmsHookV1', '1'); } catch (e) { /* 다음에 다시 */ } })
      .catch(function () { /* 다음에 앱을 열 때 다시 */ });
  }
  // ---------- 시작 ----------
  registerMmsHook();
  if (state.settings.backupKey && Store.pendingCount()) Store.flush();
  takeFills();
  refreshApproveCount();
  roomsSync();
  handleAdminLinkHash();
  scheduleAdminSync();   // 앱을 열 때 맞출 게 남은 연결 현장이 있으면 한 번 더
  // 첫 진입: 해시가 없고 마지막에 일정 화면을 봤으면 일정으로 시작
  if ((!location.hash || location.hash === '#') && state.settings.lastView === 'schedule') location.replace('#schedule');
  route();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(function () { /* PWA 미지원 환경 */ });
  }
})();
