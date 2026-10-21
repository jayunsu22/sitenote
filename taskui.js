// taskui.js — 할 일 화면 조각 (2026-10-14)
// 일정 화면의 할 일 줄·묶음, 할 일 넣기/고치기 창, 할 일 창(연결 대상별 동작), 거래처 메모 내역, 자동 할 일 기준 설정.
// 설계: docs/superpowers/specs/2026-10-14-할일-design.md
// app.js 가 TaskUI.init(deps) 로 공용 도구(toast·복사·이동 등)를 넘겨준다. Store·Share 는 전역.
(function (root) {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var d = {};   // app.js 가 넘겨주는 도구들
  function init(deps) { d = deps; bindSheet(); }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function btn(cls, text, onClick) {
    var b = el('button', cls, text); b.type = 'button';
    if (onClick) b.onclick = onClick;
    return b;
  }
  function today() { return Share.todayIso(); }
  function refresh() { if (d.refresh) d.refresh(); }

  // ---------- 연결 대상 찾기 ----------
  // 지금 살아 있는 대상 { client | site | service } — 지워졌으면 null
  function resolve(link) {
    if (!link) return null;
    if (link.type === 'client') { var c = Store.getClient(link.id); return c ? { client: c } : null; }
    if (link.type === 'site') { var s = Store.getSite(link.id); return s ? { site: s } : null; }
    if (link.type === 'service') {
      var s2 = Store.getSite(link.siteId);
      var v = s2 && (s2.services || []).find(function (x) { return x.id === link.id; });
      return v ? { site: s2, service: v } : null;
    }
    return null;
  }
  var GONE = { client: '지운 거래처', site: '지운 현장', service: '지운 AS' };
  function linkLabel(t) {
    if (!t.link) return '';
    var r = resolve(t.link);
    if (!r) return '(' + GONE[t.link.type] + ') ' + t.link.label;
    if (r.client) return r.client.name;
    if (r.service) return Share.titleLine(r.site) + ' ' + Share.serviceLabel(r.service);
    return Share.titleLine(r.site);
  }
  function iconOf(t) {
    if (t.auto) return { film: '🎞', staff: '👥', supply: '🧰', hold: '⏳', stock: '🚚' }[t.kind] || '📝';
    if (!t.link) return '📝';
    if (t.link.type === 'client') return t.title.indexOf('통화') !== -1 ? '📞' : '🏢';
    if (t.link.type === 'service') return '🔧';
    return '🏠';
  }

  // ---------- 일정 화면 ----------
  function allTasks() {
    var rules = Store.state.settings.taskRules;
    return Store.tasks().concat(Share.autoTasks(Store.state.sites, today(), rules, Store.state.settings.holds, Store.state.settings));
  }
  // 일정 화면에서 쓸 묶음 한 번에 계산 (자동 할 일 포함)
  function scheduleGroups() { return Share.taskGroups(allTasks(), today()); }
  // 달력 점: 안 끝난 할 일이 있는 날 { iso: 건수 }
  function openTaskDays() {
    var out = {};
    allTasks().forEach(function (t) { if (!t.done && Share.isIsoDate(t.date)) out[t.date] = (out[t.date] || 0) + 1; });
    return out;
  }

  // 할 일 한 줄. 체크칸: 연결 없는 직접 할 일이면 바로 완료, 아니면 할 일 창을 연다
  function renderTaskRow(t) {
    var row = el('div', 'task-row' + (t.done ? ' done' : '') + (t.auto ? ' auto' : ''));
    var ck = btn('task-ck' + (t.done ? ' on' : ''), t.done ? '✓' : '');
    ck.setAttribute('aria-label', t.done ? '완료 취소' : '완료');
    ck.onclick = function (e) {
      e.stopPropagation();
      if (t.done) { Store.uncompleteTask(t.id); refresh(); return; }
      if (t.auto || t.link) { openTaskDetail(t); return; }
      Store.completeTask(t.id, '');
      d.toast('완료: ' + t.title);
      refresh();
    };
    row.appendChild(ck);
    var main = btn('task-main');
    var top = el('div', 'task-top');
    top.appendChild(el('span', 'task-ic', iconOf(t)));
    if (t.time) top.appendChild(el('span', 'task-time', t.time));
    top.appendChild(el('span', 'task-title', t.title));
    if (t.auto) top.appendChild(el('span', 'task-auto', '자동'));
    main.appendChild(top);
    var lab = t.auto ? '' : linkLabel(t);
    if (lab) {
      var ln = el('div', 'task-link' + (t.link && !resolve(t.link) ? ' gone' : ''), lab);
      // 현장·AS 에 연결된 할 일은 업체명과 시공 첫날을 옆에 붙인다 (2026-10-14)
      var rr = resolve(t.link);
      if (rr && rr.site) {
        var cl = Store.getClient(rr.site.clientId);
        if (cl) ln.appendChild(el('span', 'task-link-tag', cl.name));
        if (Share.isIsoDate(rr.site.date)) ln.appendChild(el('span', 'task-link-tag date', '시공 ' + Share.dayLabel(rr.site.date)));
      }
      main.appendChild(ln);
    }
    if (t.done && t.result) main.appendChild(el('div', 'task-result', t.result));
    main.onclick = function () { openTaskDetail(t); };
    row.appendChild(main);
    var tel = personTel(t);
    if (tel) {
      var who = t.link.person.name || t.link.person.phone;
      var call = el('a', 'task-tel', '📞');
      call.href = Share.telHref(tel);
      call.title = who + ' 에게 전화';
      call.setAttribute('aria-label', call.title);
      call.onclick = function (e) { e.stopPropagation(); };
      row.appendChild(call);
      var sms = el('a', 'task-tel sms', '💬');       // 전화 옆에는 늘 문자도 (2026-10-19)
      sms.href = smsHref(tel);
      sms.title = who + ' 에게 문자';
      sms.setAttribute('aria-label', sms.title);
      sms.onclick = function (e) { e.stopPropagation(); };
      row.appendChild(sms);
    }
    return row;
  }
  // 문자창 주소 — 폰마다 본문 구분자가 다르다 (Share.smsHref 가 가려준다)
  function smsHref(phone, body) { return Share.smsHref(phone, body, Share.isIosUA(navigator.userAgent)); }
  function personTel(t) {
    var p = t && t.link && t.link.person;
    return p && p.phone ? String(p.phone).replace(/[^\d+]/g, '') : '';
  }
  // 연결 대상에서 고를 수 있는 담당자 — 거래처: 거래처 담당자 / 현장·AS: 발주처 담당자 + 그 거래처 담당자
  function peopleFor(pick) {
    var out = [];
    var add = function (name, phone, tag) {
      name = String(name || '').trim(); phone = String(phone || '').trim();
      if (!name && !phone) return;
      if (out.some(function (x) { return x.name === name && x.phone === phone; })) return;
      out.push({ name: name, phone: phone, tag: tag });
    };
    if ((pick.type === 'site' || pick.type === 'service') && pick.siteId) {
      var s = Store.getSite(pick.siteId);
      Share.ownerRows(s && s.owners).forEach(function (r) { add(r.name || r.role, r.phone, '🏢 발주처'); });
    }
    var c = pick.clientId && Store.getClient(pick.clientId);
    if (c && (pick.type === 'client' || pick.siteId)) (c.contacts || []).forEach(function (r) { add(r && r.name, r && r.phone, c.name); });
    return out;
  }
  // 날짜 하나의 할 일 묶음 — 머리줄 + 열린 할 일 + '완료 N건' 접기
  var openDone = {};   // 펼친 완료 묶음 { iso: true }
  function renderTaskDay(iso, grp) {
    var box = el('div', 'task-day');
    box.setAttribute('data-run-has', iso);
    var head = el('div', 'task-day-head');
    head.appendChild(el('b', '', Share.dayLabel(iso) + (iso === today() ? ' 오늘' : '')));
    head.appendChild(el('span', '', grp.open.length ? '할 일 ' + grp.open.length + (grp.done.length ? ' · 완료 ' + grp.done.length : '')
      : '다 끝냄 ✓'));
    var add = btn('task-day-add', '＋', function () { openTaskSheet({ date: iso }); });
    add.setAttribute('aria-label', Share.dayLabel(iso) + ' 할 일 넣기');
    head.appendChild(add);
    box.appendChild(head);
    grp.open.forEach(function (t) { box.appendChild(renderTaskRow(t)); });
    if (grp.done.length) {
      var more = btn('task-done-toggle', (openDone[iso] ? '▾' : '▸') + ' 완료 ' + grp.done.length + '건', function () {
        openDone[iso] = !openDone[iso]; refresh();
      });
      box.appendChild(more);
      if (openDone[iso]) grp.done.forEach(function (t) { box.appendChild(renderTaskRow(t)); });
    }
    return box;
  }
  // 맨 위 상자: 밀린 할 일(빨강), 날짜 없는 할 일(회색, 접힘)
  var showUndated = false;
  function renderOverdueBox(list) {
    var box = el('div', 'task-box task-late');
    box.appendChild(el('div', 'task-box-head', '⏰ 밀린 할 일 ' + list.length + '건'));
    list.forEach(function (t) {
      var r = renderTaskRow(t);
      r.querySelector('.task-top').insertBefore(el('span', 'task-was', Share.shortDate(t.date)), r.querySelector('.task-title'));
      box.appendChild(r);
    });
    return box;
  }
  function renderUndatedBox(list) {
    var box = el('div', 'task-box task-undated');
    box.appendChild(btn('task-box-head', (showUndated ? '▾' : '▸') + ' 날짜 없는 할 일 ' + list.length + '건', function () {
      showUndated = !showUndated; refresh();
    }));
    if (showUndated) list.forEach(function (t) { box.appendChild(renderTaskRow(t)); });
    return box;
  }

  // ---------- 바텀시트 ----------
  function bindSheet() {
    $('taskClose').onclick = closeSheet;
    $('taskSheet').addEventListener('click', function (e) { if (e.target === $('taskSheet')) closeSheet(); });
  }
  function openSheet(title, build) {
    $('taskSheetTitle').textContent = title;
    var body = $('taskBody'); body.innerHTML = '';
    build(body);
    $('taskSheet').hidden = false;
  }
  function closeSheet() { $('taskSheet').hidden = true; refresh(); }
  function section(body, label) {
    var s = el('div', 'task-sec');
    if (label) s.appendChild(el('div', 'task-sec-h', label));
    body.appendChild(s);
    return s;
  }
  function chipRow(wrap, items, cur, onPick) {
    var row = el('div', 'chips chips-pick task-chips');
    items.forEach(function (it) {
      var c = btn('chip pick' + (it.value === cur ? ' on' : ''), it.label, function () { onPick(it.value); });
      row.appendChild(c);
    });
    wrap.appendChild(row);
    return row;
  }
  function selectBox(options, cur, onChange, placeholder) {
    var s = el('select', 'task-select');
    var p = el('option', '', placeholder || '고르세요'); p.value = ''; s.appendChild(p);
    options.forEach(function (o) {
      var op = el('option', '', o.label); op.value = o.value;
      if (o.value === cur) op.selected = true;
      s.appendChild(op);
    });
    s.onchange = function () { onChange(s.value); };
    return s;
  }

  /* ---------- 넣기 / 고치기 창 ----------
     opts: { date, link, task } — task 가 있으면 고치기 */
  function openTaskSheet(opts) {
    var o = opts || {};
    var t = o.task || null;
    var f = {
      title: t ? t.title : '',
      date: t ? t.date : (o.date != null ? o.date : today()),
      time: t ? t.time : '',
      link: t ? t.link : (o.link || null)
    };
    // 연결 고르는 중간 상태 (거래처 → 현장 → AS)
    var pick = { type: f.link ? f.link.type : '', clientId: '', siteId: '', svcId: '', person: (f.link && f.link.person) || null };
    if (f.link) {
      var r = resolve(f.link);
      if (r && r.client) pick.clientId = r.client.id;
      if (r && r.site) { pick.clientId = r.site.clientId; pick.siteId = r.site.id; }
      if (r && r.service) pick.svcId = r.service.id;
    }
    openSheet(t ? '할 일 고치기' : '📝 할 일 넣기', function (body) {
      var s1 = section(body, '무엇을');
      var ti = el('textarea', 'task-input'); ti.rows = 3; ti.value = f.title;
      ti.placeholder = '위 버튼을 누르거나 직접 적기 — 예: 한샘 김실장 통화, 단가 확인';
      ti.oninput = function () { f.title = ti.value; };
      // 빠른 버튼 (2026-10-14) — 누르면 칸에 들어간다. 이미 적은 게 있으면 그 앞에 붙인다
      var presetBox = el('div', 'task-presets');
      var editing = false;
      var drawPresets = function () {
        presetBox.innerHTML = '';
        var list = (Store.state.settings.taskPresets || []).slice();
        if (!editing) {
          var row = el('div', 'chips chips-pick task-chips');
          list.forEach(function (p) {
            row.appendChild(btn('chip pick task-preset', p, function () {
              var cur = ti.value.trim();
              ti.value = cur ? p + ' — ' + cur : p + ' ';
              f.title = ti.value;
              // 전화·통화 버튼인데 아직 연결이 없으면 거래처 고르기를 열어 둔다 (담당자 📞 를 바로 고를 수 있게)
              if (/전화|통화/.test(p) && !pick.type && drawLink) { pick.type = 'client'; drawLink(); }
              ti.focus();
              try { ti.setSelectionRange(ti.value.length, ti.value.length); } catch (e) { /* 지원 안 함 */ }
            }));
          });
          row.appendChild(btn('chip pick task-preset-edit', '⚙ 편집', function () { editing = true; drawPresets(); }));
          presetBox.appendChild(row);
          return;
        }
        // 편집: 이름 고치기 · 순서 ▲▼ · 빼기 · 추가
        var save = function (next) { Store.setSettings({ taskPresets: next }); drawPresets(); };
        list.forEach(function (p, i) {
          var r = el('div', 'preset-row');
          var inp = el('input', 'preset-name'); inp.type = 'text'; inp.value = p;
          inp.onchange = function () {
            var v = inp.value.trim();
            if (!v) { inp.value = p; return; }
            var next = list.slice(); next[i] = v; save(next);
          };
          r.appendChild(inp);
          var up = btn('preset-mv', '▲', function () { if (i === 0) return; var n = list.slice(); n.splice(i - 1, 0, n.splice(i, 1)[0]); save(n); });
          var dn = btn('preset-mv', '▼', function () { if (i === list.length - 1) return; var n = list.slice(); n.splice(i + 1, 0, n.splice(i, 1)[0]); save(n); });
          var x = btn('preset-x', '✕', function () { var n = list.slice(); n.splice(i, 1); save(n); });
          up.disabled = i === 0; dn.disabled = i === list.length - 1;
          r.appendChild(up); r.appendChild(dn); r.appendChild(x);
          presetBox.appendChild(r);
        });
        var addRow = el('div', 'preset-row preset-add');
        var ni = el('input', 'preset-name'); ni.type = 'text'; ni.placeholder = '새 버튼 이름 (예: 샘플 보내기)';
        var doAdd = function () {
          var v = ni.value.trim(); if (!v) { ni.focus(); return; }
          if (list.indexOf(v) !== -1) { d.toast('이미 있어요'); return; }
          save(list.concat([v]));
        };
        ni.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); doAdd(); } });
        addRow.appendChild(ni);
        addRow.appendChild(btn('btn-sm primary', '추가', doAdd));
        presetBox.appendChild(addRow);
        presetBox.appendChild(btn('btn-sm preset-done', '✓ 편집 끝', function () { editing = false; drawPresets(); }));
      };
      s1.appendChild(presetBox);
      s1.appendChild(ti);
      var drawLink = null;
      drawPresets();

      var s2 = section(body, '언제');
      var dateIn = el('input', 'task-date'); dateIn.type = 'date';
      var drawDate = function () {
        s2.querySelectorAll('.task-chips').forEach(function (x) { x.remove(); });
        var tm = Share.addDays(today(), 1);
        var cur = f.date === today() ? 'today' : f.date === tm ? 'tomorrow' : f.date ? 'pick' : 'none';
        var row = chipRow(s2, [{ label: '오늘', value: 'today' }, { label: '내일', value: 'tomorrow' },
          { label: '날짜 고르기', value: 'pick' }, { label: '날짜 없음', value: 'none' }], cur, function (v) {
          if (v === 'today') f.date = today();
          else if (v === 'tomorrow') f.date = tm;
          else if (v === 'none') f.date = '';
          else { f.date = f.date || today(); if (dateIn.showPicker) try { dateIn.showPicker(); } catch (e) { /* 지원 안 함 */ } }
          drawDate();
        });
        s2.insertBefore(row, dateIn);
        dateIn.value = f.date; dateIn.hidden = !f.date;
      };
      dateIn.onchange = function () { f.date = Share.isIsoDate(dateIn.value) ? dateIn.value : ''; drawDate(); };
      s2.appendChild(dateIn);
      drawDate();

      var s3 = section(body, '몇 시 (안 넣어도 돼요)');
      var timeIn = el('input', 'task-time-in'); timeIn.type = 'time';
      var drawTime = function () {
        s3.querySelectorAll('.task-chips').forEach(function (x) { x.remove(); });
        var cur = f.time === '' ? '' : (f.time === '오전' || f.time === '오후') ? f.time : 'at';
        var row = chipRow(s3, [{ label: '없음', value: '' }, { label: '오전', value: '오전' }, { label: '오후', value: '오후' },
          { label: '시각', value: 'at' }], cur, function (v) {
          f.time = v === 'at' ? (timeIn.value || '13:00') : v;
          drawTime();
        });
        s3.insertBefore(row, timeIn);
        timeIn.hidden = cur !== 'at';
        if (cur === 'at') timeIn.value = f.time;
      };
      timeIn.onchange = function () { if (/^\d{2}:\d{2}$/.test(timeIn.value)) f.time = timeIn.value; };
      s3.appendChild(timeIn);
      drawTime();

      var s4 = section(body, '무엇과 연결 (안 넣어도 돼요)');
      var linkBox = el('div', 'task-linkbox');
      drawLink = function () {
        s4.querySelectorAll('.task-chips').forEach(function (x) { x.remove(); });
        var row = chipRow(s4, [{ label: '없음', value: '' }, { label: '🏢 거래처', value: 'client' },
          { label: '🏠 현장', value: 'site' }, { label: '🔧 AS', value: 'service' }], pick.type, function (v) {
          pick.type = v; pick.svcId = ''; pick.person = null;
          if (v === 'client') pick.siteId = '';
          drawLink();
        });
        s4.insertBefore(row, linkBox);
        linkBox.innerHTML = '';
        if (!pick.type) return;
        var cs = Store.clients();
        linkBox.appendChild(selectBox(cs.map(function (c) { return { label: c.name, value: c.id }; }), pick.clientId,
          function (v) { pick.clientId = v; pick.siteId = ''; pick.svcId = ''; pick.person = null; drawLink(); }, '거래처 고르기'));
        if (pick.type === 'client') { drawPerson(); return; }
        if (!pick.clientId) return;
        var sites = Store.sitesOf(pick.clientId);
        linkBox.appendChild(selectBox(sites.map(function (s) {
          return { label: Share.titleLine(s) + (Share.isIsoDate(s.date) ? ' · ' + Share.shortDate(s.date) : ''), value: s.id };
        }), pick.siteId, function (v) { pick.siteId = v; pick.svcId = ''; pick.person = null; drawLink(); }, '현장 고르기'));
        if (pick.type !== 'service' || !pick.siteId) { drawPerson(); return; }
        var site = Store.getSite(pick.siteId);
        var svcs = Share.servicesOf(site);
        if (!svcs.length) { linkBox.appendChild(el('p', 'sheet-hint', '이 현장에는 AS·추가작업이 없어요.')); return; }
        linkBox.appendChild(selectBox(svcs.map(function (v) {
          return { label: Share.serviceLabel(v) + ' · ' + (v.request || '(내용 없음)').slice(0, 20) + (v.date ? ' · ' + Share.shortDate(v.date) : ''), value: v.id };
        }), pick.svcId, function (v) { pick.svcId = v; }, 'AS 고르기'));
        drawPerson();
      };
      // 담당자 한 명 고르기 — 고르면 일정 화면 할 일 줄에 📞 가 붙어 바로 건다
      var drawPerson = function () {
        var people = peopleFor(pick);
        if (!people.length) {
          if (pick.type === 'client' && pick.clientId) linkBox.appendChild(el('p', 'sheet-hint', '이 거래처에 담당자가 없어요. 거래처 고정값 → 담당자에 넣으면 여기서 고를 수 있어요.'));
          return;
        }
        var cur = pick.person ? pick.person.name + '|' + pick.person.phone : '';
        var sel = selectBox(people.map(function (p) {
          return { label: '📞 ' + (p.name || '이름 없음') + (p.phone ? ' ' + p.phone : '') + ' · ' + p.tag, value: p.name + '|' + p.phone };
        }), cur, function (v) {
          var hit = people.find(function (p) { return p.name + '|' + p.phone === v; });
          pick.person = hit ? { name: hit.name, phone: hit.phone } : null;
        }, '담당자 고르기 (📞 바로 걸기)');
        sel.classList.add('task-person');
        linkBox.appendChild(sel);
      };
      s4.appendChild(linkBox);
      drawLink();

      var foot = el('div', 'task-foot');
      if (t) {
        foot.appendChild(btn('btn-sm btn-danger', '삭제', function () {
          d.modalConfirm('할 일 삭제', '"' + t.title + '" 을(를) 지울까요?', '삭제', true).then(function (ok) {
            if (!ok) return;
            Store.deleteTask(t.id); d.toast('지웠어요'); closeSheet();
          });
        }));
      }
      foot.appendChild(btn('btn-sm primary task-ok', t ? '저장' : '넣기', function () {
        f.title = ti.value.trim();
        if (!f.title) { ti.focus(); d.toast('무엇을 할지 적어 주세요'); return; }
        var link = buildLink(pick);
        if (pick.type && !link) { d.toast(pick.type === 'client' ? '거래처를 골라 주세요' : pick.type === 'site' ? '현장을 골라 주세요' : 'AS 를 골라 주세요'); return; }
        var patch = { title: f.title, date: f.date, time: f.time, link: link };
        if (t) { Store.updateTask(t.id, patch); d.toast('저장했어요'); }
        else { Store.addTask(patch); d.toast(f.date ? Share.dayLabel(f.date) + ' 할 일로 넣었어요' : '날짜 없는 할 일로 넣었어요'); }
        closeSheet();
      }));
      body.appendChild(foot);
      if (!t) setTimeout(function () { ti.focus(); }, 50);
    });
  }
  function buildLink(pick) {
    var l = buildLinkBase(pick);
    if (l && pick.person && (pick.person.name || pick.person.phone)) l.person = { name: pick.person.name, phone: pick.person.phone };
    return l;
  }
  function buildLinkBase(pick) {
    if (pick.type === 'client' && pick.clientId) {
      var c = Store.getClient(pick.clientId);
      return c ? { type: 'client', id: c.id, siteId: '', label: c.name } : null;
    }
    if (pick.type === 'site' && pick.siteId) {
      var s = Store.getSite(pick.siteId);
      return s ? { type: 'site', id: s.id, siteId: s.id, label: Share.titleLine(s) } : null;
    }
    if (pick.type === 'service' && pick.siteId && pick.svcId) {
      var s2 = Store.getSite(pick.siteId);
      var v = s2 && (s2.services || []).find(function (x) { return x.id === pick.svcId; });
      return v ? { type: 'service', id: v.id, siteId: s2.id, label: Share.titleLine(s2) + ' ' + Share.serviceLabel(v) } : null;
    }
    return null;
  }

  /* ---------- 할 일 창 (줄을 눌렀을 때) ----------
     자동 할 일은 저장된 게 아니라 연결 동작만 보여준다 — 조건이 풀리면 저절로 사라진다 */
  function openTaskDetail(task) {
    var t = task.auto ? task : (Store.getTask(task.id) || task);
    openSheet(iconOf(t) + ' ' + t.title, function (body) {
      var meta = el('div', 'task-meta');
      meta.textContent = [t.date ? Share.dayLabel(t.date) : '날짜 없음', t.time, t.auto ? '' : linkLabel(t)].filter(Boolean).join(' · ');
      body.appendChild(meta);
      if (t.auto) body.appendChild(el('p', 'sheet-hint', '앱이 현장 상태를 보고 만든 할 일이에요. 아래에서 처리하면 저절로 사라져요.'));
      renderContacts(body, t);

      // 차 보충 — 현장이 아니라 내 차에 채울 것들. 여기서 바로 '채웠음' 으로 끌 수 있다
      if (t.kind === 'stock') {
        var ss = section(body, '🚚 차에 채울 것');
        (t.stockLow || []).forEach(function (n) {
          var row = el('div', 'task-film');
          row.appendChild(el('span', '', n));
          var done = btn('btn-sm', '채웠음', function () {
            Store.setSettings({ stockLow: Share.setStockLow(Store.state.settings, n, false) });
            $('taskSheet').hidden = true;
            d.toast(n + ' 채움으로 바꿨습니다');
            d.refresh();
          });
          row.appendChild(done);
          ss.appendChild(row);
        });
        ss.appendChild(el('p', 'sheet-hint', '본드·장갑처럼 차에 싣고 다니는 상비품이에요. 설정 › 현장준비 › 내 차 재고에서도 바꿀 수 있어요.'));
      }
      if (t.kind === 'hold') {
        var hs = section(body, '⏳ ' + Share.dayLabel(t.holdDate) + ' 대기 인원');
        Share.heldOpen(Store.state.settings.holds, Store.state.sites, t.holdDate).forEach(function (n) {
          hs.appendChild(el('div', 'task-film', n));
        });
        var ha = el('div', 'task-actions');
        ha.appendChild(btn('btn-sm primary', '📅 그날 일정 보기', function () { $('taskSheet').hidden = true; d.openDay(t.holdDate); }));
        hs.appendChild(ha);
        hs.appendChild(el('p', 'sheet-hint', '현장 화면의 그날 인원에서 ⏳ 대기 묶음을 누르면 배정돼요.'));
      }
      var r = resolve(t.link);
      if (t.link && !r) body.appendChild(el('p', 'sheet-hint', '연결했던 ' + GONE[t.link.type].replace('지운 ', '') + '이(가) 지워졌어요.'));
      if (r && r.client) renderClientPart(body, t, r.client);
      if (r && r.site && !r.service) renderSitePart(body, t, r.site);
      if (r && r.service) renderServicePart(body, t, r.site, r.service);

      if (t.auto) return;
      var res = null;
      var s = section(body, t.link && t.link.type === 'client' ? '결과 메모 (거래처 메모 내역에 남아요)' : '결과 메모');
      res = el('textarea', 'task-input'); res.rows = 3; res.value = t.result || '';
      res.placeholder = t.link && t.link.type === 'client' ? '예: 다음 주부터 단가 3% 인상. 샘플 2개 보내기로' : '';
      s.appendChild(res);
      var foot = el('div', 'task-foot');
      foot.appendChild(btn('btn-sm', '고치기', function () { openTaskSheet({ task: Store.getTask(t.id) }); }));
      if (t.done) {
        foot.appendChild(btn('btn-sm', '완료 취소', function () {
          Store.uncompleteTask(t.id);
          if (res.value.trim() !== (t.result || '')) Store.updateTask(t.id, { result: res.value.trim() });
          d.toast('완료를 취소했어요'); closeSheet();
        }));
      } else {
        var isClient = r && r.client;
        foot.appendChild(btn('btn-sm primary task-ok', isClient && res.value.trim() ? '완료 · 메모에 남기기' : '완료', function () {
          Store.completeTask(t.id, res.value);
          d.toast(isClient && res.value.trim() ? '완료 — ' + r.client.name + ' 메모 내역에 남겼어요' : '완료했어요');
          closeSheet();
        }));
        res.oninput = function () {
          var b = foot.querySelector('.task-ok');
          if (b && isClient) b.textContent = res.value.trim() ? '완료 · 메모에 남기기' : '완료';
        };
      }
      body.appendChild(foot);
      body.appendChild(btn('btn-sm task-del', '🗑 할 일 삭제하기', function () {
        d.modalConfirm('할 일 삭제', '"' + t.title + '" 을(를) 지울까요?', '삭제', true).then(function (ok) {
          if (!ok) return;
          Store.deleteTask(t.id); d.toast('지웠어요'); closeSheet();
        });
      }));
    });
  }

  /* 할 일에 관련된 사람 모두의 연락처 (2026-10-14) — 눌러서 바로 전화.
     현장: 발주처 담당자 · 거래처 담당자 · 그 현장 팀원 / AS: + 고객 · 담당 기사 /
     거래처: 거래처 담당자 · 진행 중인 현장들의 발주처 담당자. 이 할 일에 고른 담당자가 맨 위. 같은 번호는 한 번만 */
  function digits(v) { return String(v || '').replace(/[^\d+]/g, ''); }
  function contactsFor(t) {
    var out = [], seen = {};
    var add = function (name, phone, tag, mine) {
      var tel = digits(phone);
      if (!tel || seen[tel]) return;
      seen[tel] = 1;
      out.push({ name: String(name || '').trim(), phone: String(phone).trim(), tel: tel, tag: tag, mine: !!mine });
    };
    var p = t.link && t.link.person;
    if (p) add(p.name, p.phone, '이 할 일 담당', true);
    var r = resolve(t.link);
    if (!r) return out;
    var people = Store.state.settings.people || {};
    var team = function (names, tag) {
      names.forEach(function (n) { add(n, Share.personOf(people, n).phone, tag); });
    };
    var siteParts = function (s) {
      Share.ownerRows(s.owners).forEach(function (o) { add(o.name || o.role, o.phone, '🏢 발주처' + (o.role ? ' · ' + o.role : '')); });
      var c = Store.getClient(s.clientId);
      if (c) (c.contacts || []).forEach(function (x) { if (x) add(x.name, x.phone, '거래처 ' + c.name); });
      var staff = [];
      Share.daysOf(s).forEach(function (dd) { (dd.staff || []).forEach(function (n) { if (staff.indexOf(n) === -1) staff.push(n); }); });
      team(staff, '👷 팀원');
    };
    if (r.service) {
      add(r.service.customer || '고객', r.service.phone, '🙋 AS 고객');
      team(r.service.staff || [], '🔧 AS 기사');
      siteParts(r.site);
    } else if (r.site) {
      siteParts(r.site);
    } else if (r.client) {
      (r.client.contacts || []).forEach(function (x) { if (x) add(x.name, x.phone, '거래처 ' + r.client.name); });
      // 진행 중인 현장(마지막 날이 2주 안 지났거나 날짜 없음)의 발주처 담당자
      var cut = Share.addDays(today(), -14);
      Store.sitesOf(r.client.id).forEach(function (s) {
        var ds = Share.daysOf(s).map(function (dd) { return dd.date; }).filter(Share.isIsoDate).sort();
        if (ds.length && ds[ds.length - 1] < cut) return;
        Share.ownerRows(s.owners).forEach(function (o) { add(o.name || o.role, o.phone, '🏢 ' + Share.titleLine(s)); });
      });
    }
    return out;
  }
  function renderContacts(body, t) {
    var list = contactsFor(t);
    if (!list.length) return;
    var s = section(body, '📞 연락처 — 눌러서 전화·문자');
    list.forEach(function (x) {
      var wrap = el('div', 'task-contact' + (x.mine ? ' mine' : ''));
      var a = el('a', 'task-contact-main');
      a.href = Share.telHref(x.tel);
      a.title = (x.name || x.phone) + ' 에게 전화';
      var txt = el('span', 'task-contact-txt');
      txt.appendChild(el('b', '', x.name || x.phone));
      txt.appendChild(el('span', '', x.tag + ' · ' + x.phone));
      a.appendChild(txt);
      a.appendChild(el('span', 'task-contact-ic', '📞'));
      wrap.appendChild(a);
      var m = el('a', 'task-contact-ic sms', '💬');   // 전화 옆에는 늘 문자도 (2026-10-19)
      m.href = smsHref(x.tel);
      m.title = (x.name || x.phone) + ' 에게 문자';
      wrap.appendChild(m);
      s.appendChild(wrap);
    });
  }
  function renderClientPart(body, t, c) {
    var s = section(body, '거래처');
    var row = el('div', 'task-actions');
    row.appendChild(btn('btn-sm', '🏢 ' + c.name + ' 열기', function () { $('taskSheet').hidden = true; d.openClient(c.id); }));
    if (!t.auto) row.appendChild(btn('btn-sm', '＋ 후속 할 일', function () {
      openTaskSheet({ link: { type: 'client', id: c.id, siteId: '', label: c.name }, date: Share.addDays(today(), 1) });
    }));
    s.appendChild(row);
    if ((c.notes || []).length) {
      s.appendChild(el('div', 'task-sub', '최근 메모'));
      c.notes.slice(0, 2).forEach(function (n) { s.appendChild(noteLine(n)); });
    }
  }
  function renderSitePart(body, t, site) {
    // 필름
    var films = (site.films || []).filter(function (x) { return x && String(x.code || '').trim(); });
    var stage = Share.filmStageOf(site);
    var fs = section(body, '🎞 필름 — ' + Share.FILM_STAGES[stage]);
    if (films.length) {
      films.forEach(function (x) {
        var fl = el('div', 'task-film', [x.place, x.code].filter(Boolean).join(' · '));
        if (Share.isIsoDate(x.orderedAt)) fl.appendChild(el('span', 'task-ord', '✓ 주문 ' + Share.shortDate(x.orderedAt)));
        fs.appendChild(fl);
        Share.filmOverlaps(Store.state.sites, site, x.code).forEach(function (o) {
          fs.appendChild(el('div', 'film-warn', '⚠ ' + Share.titleLine(o.site) + ' · ' + Share.dayLabel(o.date) + ' 에도 있음 · ' + (o.orderedAt ? '그쪽은 주문 ' + Share.shortDate(o.orderedAt) : '그쪽 미주문')));
        });
      });
    } else fs.appendChild(el('p', 'sheet-hint', '아직 필름 번호가 없어요. 현장 화면에서 적어 주세요.'));
    var fa = el('div', 'task-actions');
    if (films.length) fa.appendChild(btn('btn-sm', '📋 번호 복사', function () { d.copyText(Share.filmOrderText(site), '필름 번호 복사 — 대리점에 붙여넣기'); }));
    var oc = Share.filmOrderCount(site);
    if (stage < 2 || oc.ordered < oc.total) fa.appendChild(btn('btn-sm primary', oc.total ? '안 시킨 줄 모두 주문함' : '주문함 → 필름 주문', function () {
      Store.markFilmOrdered(site.id);
      if (!t.auto && !t.done && /필름|주문/.test(t.title)) Store.completeTask(t.id, '');
      d.toast('필름 단계를 "필름 주문"으로 바꿨어요');
      closeSheet();
    }));
    fs.appendChild(fa);
    // 인원
    var st = Share.staffStatus(site);
    if (st.need || t.kind === 'staff') {
      var ss = section(body, '👥 인원 ' + Share.staffTotalLabel(site));
      if (st.short) ss.appendChild(el('div', 'task-short', st.short + '명 더 필요해요'));
      var sa = el('div', 'task-actions');
      if (st.short) sa.appendChild(btn('btn-sm', '📋 모집 문구 복사', function () { d.copyText(Share.buildRecruitText(site), '모집 문구 복사 — 밴드에 붙여넣기'); }));
      ss.appendChild(sa);
    }
    // 부자재
    var sup = site.supplies || [];
    if (sup.some(function (x) { return x && x.name; })) {
      var su = section(body, '🧰 부자재');
      sup.forEach(function (x, i) {   // i 는 원래 목록 자리 — toggleSupply 가 자리로 찾는다
        if (!x || !x.name) return;
        su.appendChild(checkLine(x.name, x.ready, function () { Store.toggleSupply(site.id, i); openTaskDetail(t); }));
      });
    }
    var go = el('div', 'task-actions');
    go.appendChild(btn('btn-sm', '🏠 현장 열기', function () { $('taskSheet').hidden = true; d.go('#site/' + site.id); }));
    body.appendChild(go);
  }
  function renderServicePart(body, t, site, v) {
    var s = section(body, '🔧 ' + Share.serviceLabel(v) + (v.date ? ' · ' + Share.dayLabel(v.date) : ''));
    if (v.request) s.appendChild(el('div', 'task-film', v.request));
    s.appendChild(el('div', 'task-sub', '챙길 부자재·공구'));
    if (!(v.tools || []).length) s.appendChild(el('p', 'sheet-hint', 'AS 접수에 챙길 것이 없어요. AS 열기에서 골라 주세요.'));
    (v.tools || []).forEach(function (name) {
      var on = (v.toolsReady || []).indexOf(name) !== -1;
      s.appendChild(checkLine(name, on, function () { Store.setServiceToolReady(site.id, v.id, name, !on); openTaskDetail(t); }));
    });
    var a = el('div', 'task-actions');
    a.appendChild(btn('btn-sm', '🔧 AS 열기', function () { $('taskSheet').hidden = true; d.openService(site.id, v.id); }));
    s.appendChild(a);
  }
  function checkLine(label, on, onToggle) {
    var b = btn('task-check' + (on ? ' on' : ''));
    b.appendChild(el('span', 'task-ck' + (on ? ' on' : ''), on ? '✓' : ''));
    b.appendChild(el('span', '', label));
    b.onclick = onToggle;
    return b;
  }

  // ---------- 거래처 메모 내역 ----------
  var notesOpen = false;
  function noteLine(n) {
    var line = el('div', 'note-line');
    var h = el('div', 'note-h');
    h.appendChild(el('span', 'note-date', Share.dayLabel(n.date) || n.date));
    if (n.kind) h.appendChild(el('span', 'note-kind', n.kind));
    if (n.taskId) h.appendChild(el('span', 'note-from', '할 일에서'));
    line.appendChild(h);
    line.appendChild(el('div', 'note-text', n.text));
    return line;
  }
  function renderClientNotes(wrap, clientId) {
    wrap.innerHTML = '';
    var c = Store.getClient(clientId);
    wrap.hidden = !c;
    if (!c) return;
    var notes = c.notes || [];
    wrap.className = 'fixed-wrap notes-wrap' + (notesOpen ? ' open' : '');
    var tg = btn('fixed-toggle');
    tg.innerHTML = '<span class="fixed-arrow">▶</span> 메모 내역 <span class="fixed-sub"></span>';
    tg.querySelector('.fixed-sub').textContent = notes.length
      ? notes.length + '건 · 최근 ' + Share.shortDate(notes[0].date) + ' ' + notes[0].text.split('\n')[0].slice(0, 14)
      : '통화·확인한 내용을 날짜별로';
    tg.onclick = function () { notesOpen = !notesOpen; renderClientNotes(wrap, clientId); };
    wrap.appendChild(tg);
    if (!notesOpen) return;
    var body = el('div', 'fixed-body notes-body');
    var inRow = el('div', 'note-add');
    // 적는 칸은 폭을 다 쓰고, 버튼은 그 아래 한 줄에 (2026-10-14)
    var ta = el('textarea'); ta.rows = 3; ta.placeholder = '직접 적기 — 오늘 날짜로 쌓여요';
    inRow.appendChild(ta);
    var col = el('div', 'note-add-btns');
    col.appendChild(btn('btn-sm', '＋ 할 일', function () {
      openTaskSheet({ link: { type: 'client', id: c.id, siteId: '', label: c.name }, date: Share.addDays(today(), 1) });
    }));
    col.appendChild(btn('btn-sm primary', '메모 추가', function () {
      if (!Store.addClientNote(clientId, { text: ta.value })) { ta.focus(); return; }
      d.toast('메모를 남겼어요');
      renderClientNotes(wrap, clientId);
    }));
    inRow.appendChild(col);
    body.appendChild(inRow);
    if (!notes.length) body.appendChild(el('p', 'sheet-hint', '아직 메모가 없어요. 할 일을 끝낼 때 적은 결과도 여기로 와요.'));
    notes.forEach(function (n) {
      var line = noteLine(n);
      line.title = '눌러서 고치기·지우기';
      line.onclick = function () {
        d.modalSheet(Share.dayLabel(n.date) + ' 메모', [{ label: '✏️ 고치기', value: 'edit' }, { label: '🗑 지우기', value: 'del', cls: 'danger' }])
          .then(function (v) {
            if (v === 'edit') return d.modalPrompt('메모 고치기', n.text).then(function (txt) {
              if (txt != null && Store.updateClientNote(clientId, n.id, txt)) renderClientNotes(wrap, clientId);
            });
            if (v === 'del') return d.modalConfirm('메모 지우기', n.text.slice(0, 40), '지우기', true).then(function (ok) {
              if (ok) { Store.deleteClientNote(clientId, n.id); renderClientNotes(wrap, clientId); }
            });
          });
      };
      body.appendChild(line);
    });
    wrap.appendChild(body);
  }

  // ---------- 설정: 자동 할 일 기준 ----------
  function renderTaskRules(wrap) {
    wrap.innerHTML = '';
    var r = Store.state.settings.taskRules;
    [['filmDays', '🎞 필름 주문', '시공'], ['staffDays', '👥 인원 모집', '시공'], ['supplyDays', '🧰 부자재 준비', '시공·AS']].forEach(function (x) {
      var row = el('label', 'rule-row');
      row.appendChild(el('span', 'rule-name', x[1]));
      row.appendChild(el('span', 'rule-pre', x[2]));
      var inp = el('input', 'rule-num'); inp.type = 'number'; inp.min = 0; inp.max = 14; inp.inputMode = 'numeric';
      inp.value = r[x[0]];
      inp.onchange = function () {
        var p = Object.assign({}, Store.state.settings.taskRules); p[x[0]] = inp.value;
        Store.setSettings({ taskRules: p });
        inp.value = Store.state.settings.taskRules[x[0]];
        d.toast('저장했어요');
      };
      row.appendChild(inp);
      row.appendChild(el('span', 'rule-post', '일 전부터'));
      wrap.appendChild(row);
    });
    wrap.appendChild(el('p', 'sheet-hint', '0 이면 당일에만 떠요. 조건이 풀리면(주문함·인원 채움·체크) 저절로 사라져요.'));
  }

  /* ---------- 필름 모아보기 (2026-10-22) ----------
     위: 주문 내역 — 최근 30일 주문을 '주문한 날짜별로'(최근 먼저). 같은 번호를 다른 현장에서도 주문했으면 빨간 ⚠.
     아래: 아직 안 시킨 필름 — 2주 안에 시작하는 현장. 최근 30일 안 다른 현장에서 주문한 번호면 바로 알려 준다.
     줄을 누르면 그 현장으로. 맨 아래 '미주문만 번호 복사' 로 대리점에 한 번에 */
  var FILM_BOARD_DAYS = 14, FILM_LOG_DAYS = 30;
  function openFilmBoard() {
    var sites = Store.state.sites;
    var log = Share.filmOrderLog(sites, today(), FILM_LOG_DAYS);
    var board = Share.filmBoard(sites, today(), FILM_BOARD_DAYS);
    var goSite = function (site) { return function () { $('taskSheet').hidden = true; d.go('#site/' + site.id); }; };
    openSheet('🎞 필름 주문 내역', function (body) {
      var s1 = section(body, '주문한 날짜별 (최근 ' + FILM_LOG_DAYS + '일)');
      if (!log.length) s1.appendChild(el('p', 'sheet-hint', '최근 ' + FILM_LOG_DAYS + '일 동안 주문 표시한 필름이 없어요. 현장 필름 칸의 [주문] 을 누르면 여기에 쌓여요.'));
      log.forEach(function (day) {
        var box = el('div', 'fb-grp');
        box.appendChild(el('div', 'fb-code', Share.dayLabel(day.date) + (day.date === today() ? ' 오늘' : '') + ' 주문 · ' + day.items.length + '건'));
        day.items.forEach(function (it) {
          var r = btn('fb-use' + (it.dup ? ' dup' : ''));
          var left = el('span', 'fb-site');
          left.appendChild(el('b', 'fb-num', it.code));
          left.appendChild(el('span', 'fb-sub', Share.titleLine(it.site) + (it.places ? ' · ' + it.places : '')));
          r.appendChild(left);
          r.appendChild(el('span', 'fb-st' + (it.dup ? ' warn' : ' ok'),
            it.dup ? '⚠ ' + it.dup + '곳 주문' : (Share.isIsoDate(it.siteDate) ? '시공 ' + Share.shortDate(it.siteDate) : '')));
          r.onclick = goSite(it.site);
          box.appendChild(r);
        });
        s1.appendChild(box);
      });

      var pending = [];
      board.forEach(function (g) { g.uses.forEach(function (u) { if (!u.orderedAt) pending.push({ code: g.code, site: u.site, date: u.date }); }); });
      var s2 = section(body, '아직 안 시킨 필름 (' + FILM_BOARD_DAYS + '일 안 시공)');
      if (!pending.length) s2.appendChild(el('p', 'sheet-hint', '2주 안에 시작하는 현장의 필름은 모두 주문했어요.'));
      var box2 = el('div', 'fb-grp');
      pending.forEach(function (p) {
        var before = Share.filmOrderedBefore(sites, p.site, p.code, today(), FILM_LOG_DAYS);
        var r = btn('fb-use' + (before.length ? ' dup' : ''));
        var left = el('span', 'fb-site');
        left.appendChild(el('b', 'fb-num', p.code));
        left.appendChild(el('span', 'fb-sub', Share.titleLine(p.site) + ' · 시공 ' + Share.shortDate(p.date)));
        r.appendChild(left);
        r.appendChild(el('span', 'fb-st' + (before.length ? ' warn' : ''),
          before.length ? '⚠ ' + Share.shortDate(before[0].orderedAt) + ' ' + Share.titleLine(before[0].site) + '에 주문함' : '미주문'));
        r.onclick = goSite(p.site);
        box2.appendChild(r);
      });
      if (pending.length) s2.appendChild(box2);

      var text = Share.filmBoardText(board);
      var foot = el('div', 'task-foot');
      foot.appendChild(btn('btn-sm primary task-ok', text ? '📋 미주문만 번호 복사' : '모두 주문했어요', function () {
        if (!text) return;
        d.copyText(text, '미주문 필름 번호 복사 — 대리점에 붙여넣기');
      }));
      body.appendChild(foot);
    });
  }

  root.TaskUI = {
    openFilmBoard: openFilmBoard,
    init: init,
    scheduleGroups: scheduleGroups,
    openTaskDays: openTaskDays,
    renderTaskRow: renderTaskRow,
    renderTaskDay: renderTaskDay,
    renderOverdueBox: renderOverdueBox,
    renderUndatedBox: renderUndatedBox,
    openTaskSheet: openTaskSheet,
    openTaskDetail: openTaskDetail,
    renderClientNotes: renderClientNotes,
    renderTaskRules: renderTaskRules
  };
})(window);
