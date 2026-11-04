/* 🤖 대화형 비서 (2026-11-04 사장님: 계산기 말고 대화하듯 일처리) — 화면·네트워크 없는 순수 부분 (node 테스트: test/boss_chat.test.js).
   한 번 말하면: AI(n8n kakao-chat)가 할 일(actions)을 고르고 → 앱이 실제로 하고 → 결과를 AI 에게 돌려줘 → 진짜 결과로 답을 쓴다.
   AI 가 말한 것이 아니라 실제 결과로 카드를 그린다. 화면·실행은 app.js. 설계 songil docs/superpowers/specs/2026-11-04-대화형비서-design.md */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BossChat = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var MAX_STEPS = 4, MAX_ACTIONS = 8, CONFIRM_OVER = 3, HISTORY = 16;
  var FIELDS = ['pwLobby', 'pwUnit', 'toilet'];
  var str = function (v) { return String(v == null ? '' : v).trim(); };
  var digits = function (v) { return str(v).replace(/[^0-9]/g, ''); };
  var names = function (v) { return (Array.isArray(v) ? v : []).map(str).filter(Boolean).filter(function (n, i, a) { return a.indexOf(n) === i; }); };

  /* 📇 업체 연락처 (11/4 사장님: '지인인테리어 사장님한테 문자 보내' 가 '팀원만 된다' 고 막혔던 것).
     거래처 담당자(client.contacts)와 현장 발주처 담당자(site.owners, 앞뒤 기간 현장) → [{ name: '지인인테리어 김사장', phone }].
     name 은 AI 가 send_text names 에 그대로 쓰는 이름표. AI 에게는 번호 대신 있고 없고만 준다 */
  function contactBook(o) {
    var out = [], seen = {};
    var add = function (label, phone, extra) {
      label = str(label).replace(/\s+/g, ' ');
      if (!label || seen[label]) return;
      seen[label] = true;
      out.push(Object.assign({ name: label, phone: digits(phone) }, extra || {}));
    };
    (o.clients || []).forEach(function (c) {
      (c.contacts || []).forEach(function (ct) {
        if (!ct || (!str(ct.name) && !digits(ct.phone))) return;
        add(str(c.name) + ' ' + (str(ct.name) || '담당자'), ct.phone, { client: str(c.name), kind: '업체' });
      });
    });
    var clients = {};
    (o.clients || []).forEach(function (c) { clients[c.id] = c.name; });
    (o.sites || []).forEach(function (s) {
      if (!s || !s.id || s.hide) return;
      (Array.isArray(s.owners) ? s.owners : []).forEach(function (w) {
        if (!w || (!str(w.name) && !digits(w.phone))) return;
        add(str(s.name) + ' ' + (str(w.name) || str(w.role) || '발주처'), w.phone, { client: str(clients[s.clientId]), kind: '발주처' + (str(w.role) ? '·' + str(w.role) : ''), siteId: s.id });
      });
    });
    return out;
  }
  // AI 에게 줄 지금 앱 상태 — 고객 번호는 넣지 않는다. 팀원·업체 연락처는 번호 대신 있고 없고만
  function buildContext(o) {
    var today = o.today, clients = {};
    (o.clients || []).forEach(function (c) { clients[c.id] = c.name; });
    var gap = function (d) { return Math.round((Date.parse(d + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 864e5); };
    var sites = (o.sites || []).filter(function (s) {
      var d = str(s.date).slice(0, 10);
      if (!s.id || s.hide) return false;
      if (!d) return str(clients[s.clientId]).replace(/\s+/g, '') === '개인고객';   // 날짜 미정 개인고객도 본다 (11/5)
      return gap(d) >= -45 && gap(d) <= 60;
    }).sort(function (a, b) {
      var far = function (s) { var d = str(s.date).slice(0, 10); return d ? Math.abs(gap(d)) : 0; };
      return far(a) - far(b);
    }).slice(0, 60).map(function (s) {
      return siteView(s, clients);
    });
    var people = (o.settings && o.settings.people) || {};
    var team = names(((o.settings && o.settings.team) || []).concat(Object.keys(people))).map(function (n) {
      return { name: n, phone: !!digits((people[n] || {}).phone) };
    });
    return {
      today: today, sites: sites, team: team,
      // 💬 카톡 보낼 수 있는 거래처 (방은 노트북이 거래처 이름으로 찾는다)
      kakaoClients: (o.clients || []).map(function (c) { return str(c.name); }).filter(Boolean).slice(0, 120),
      // 업체 연락처: 거래처 담당자 전부 + 위 현장들의 발주처 담당자 (번호 대신 있고 없고만)
      contacts: contactBook({ clients: o.clients, sites: (o.sites || []).filter(function (s) { return sites.some(function (v) { return v.id === s.id; }); }) })
        .slice(0, 120).map(function (c) { return { name: c.name, client: c.client, kind: c.kind, phone: !!c.phone }; }),
      // 연락처를 하나도 안 적은 거래처 — '번호가 없다' 고 말하게
      noContact: (o.clients || []).filter(function (c) { return !(c.contacts || []).some(function (ct) { return ct && digits(ct.phone); }); }).map(function (c) { return str(c.name); }).filter(Boolean).slice(0, 80),
      todo: (o.todo || []).slice(0, 40).map(function (t) { return { kind: t.kind, title: t.title, res: t.res || '', siteId: t.siteId || '' }; }),
      tasks: (o.tasks || []).filter(function (t) { return !t.done; }).slice(0, 30).map(function (t) { return { title: t.title, date: t.date || '' }; }),
      undo: (o.undo || []).slice(0, 10)
    };
  }
  function siteView(s, clients) {
    return {
      id: s.id, client: (clients && clients[s.clientId]) || '', name: [str(s.name), str(s.unit)].filter(Boolean).join(' '), date: str(s.date).slice(0, 10),
      customer: names((Array.isArray(s.owners) ? s.owners : []).map(function (r) { return r && r.name; })),   // 개인고객 이름 (번호는 안 보냄)
      kakaoRoom: str(s.kakaoRoom),   // 개인고객 카톡방 이름 (11/5)
      pwLobby: str(s.pwLobby), pwUnit: str(s.pwUnit), toilet: str(s.toilet), payDone: !!s.payDone,
      films: (Array.isArray(s.films) ? s.films : []).filter(function (x) { return x && str(x.code); }).map(function (x) { return (str(x.place) + ' ' + str(x.code)).trim(); }),
      days: (Array.isArray(s.days) ? s.days : []).map(function (d) { return { date: str(d && d.date), staff: names(d && d.staff) }; })
    };
  }
  // 이름·아파트로 현장 찾기 (앞뒤 기간 밖 현장도)
  function findSites(sites, clients, query) {
    var map = {};
    (clients || []).forEach(function (c) { map[c.id] = c.name; });
    var squash = function (v) { return str(v).replace(/\s+/g, '').toLowerCase(); };
    var words = str(query).split(/\s+/).map(squash).filter(Boolean);
    if (!words.length) return [];
    return (sites || []).filter(function (s) {
      if (!s.id || s.hide) return false;
      var hay = squash([map[s.clientId], s.name, s.unit].concat((Array.isArray(s.owners) ? s.owners : []).map(function (r) { return r && r.name; })).join(' '));
      return words.every(function (w) { return hay.indexOf(w) !== -1; });
    }).slice(0, 10).map(function (s) { return siteView(s, map); });
  }

  // 할 일 하나 검사 — 실행 전에 앱이 직접 막는 것. userText = 사장님이 최근에 쓴 글
  function check(a, o) {
    var t = a && a.tool;
    var site = function () { return o.hasSite(str(a.siteId)); };
    if (t === 'set_field') {
      if (FIELDS.indexOf(a.field) === -1 || !str(a.value)) return '바꿀 칸이나 값이 없어요';
      return site() ? '' : '그 현장을 못 찾았어요';
    }
    if (t === 'set_films') {
      if (!(Array.isArray(a.films) && a.films.some(function (x) { return x && str(x.code); }))) return '필름 번호가 없어요';
      return site() ? '' : '그 현장을 못 찾았어요';
    }
    if (t === 'mark_paid') return site() ? '' : '그 현장을 못 찾았어요';
    if (t === 'set_staff') {
      if (!names(a.names).length) return '작업자 이름이 없어요';
      if (['add', 'set', 'remove'].indexOf(a.mode) === -1) return '넣기·바꾸기·빼기 중 무엇인지 모르겠어요';
      return site() ? '' : '그 현장을 못 찾았어요';
    }
    if (t === 'send_site_info') {
      if (!names(a.names).length) return '받을 사람이 없어요';
      return site() ? '' : '그 현장을 못 찾았어요';
    }
    if (t === 'send_text') {
      if (!names(a.names).length) return '받을 사람이 없어요';
      return str(a.text) ? '' : '보낼 글이 없어요';
    }
    // 💬 카톡 (11/4): 노트북(카톡 읽기)이 그 업체 방에 보낸다. client = 거래처 이름(방은 노트북이 찾음) 또는 room = 방 이름
    if (t === 'send_kakao') {
      if (!str(a.client) && !str(a.room) && !str(a.siteId)) return '어느 방에 보낼지 모르겠어요';
      return str(a.text) ? '' : '보낼 글이 없어요';
    }
    if (t === 'save_phone') {
      var d = digits(a.phone);
      if (!str(a.name) || d.length < 9) return '이름이나 번호가 없어요';
      // AI 가 번호를 지어내지 못하게 — 사장님이 쓴 글에 있는 번호만
      return digits(o.userText).indexOf(d) === -1 ? '사장님이 알려 주신 번호가 아니에요' : '';
    }
    if (t === 'add_task') return str(a.title) ? '' : '할 일 내용이 없어요';
    if (t === 'undo') return str(a.id) ? '' : '되돌릴 것을 모르겠어요';
    if (t === 'find_sites') return str(a.query) ? '' : '찾을 말이 없어요';
    return '비서가 할 줄 모르는 일이에요';
  }
  // 받는 사람이 많은 문자는 사장님 확인 뒤에
  // 말로 시킨 때(all)는 잘못 들었을 수 있어 문자는 한 명이라도 확인 뒤에 (11/4)
  function needsConfirm(a, all) {
    if (a.tool === 'send_kakao') return !!all;
    return (a.tool === 'send_text' || a.tool === 'send_site_info') && (all || names(a.names).length > CONFIRM_OVER);
  }
  // 말 끝이 '시작해' 면 보내라는 뜻 (사장님 11/4) → { text: 그 말을 뺀 글, go }
  var GO_WORD = /(^|\s)시작\s*해(\s*(요|줘|주세요))?[\s.!?,]*$/;
  function goWord(text) {
    var t = str(text);
    return GO_WORD.test(t) ? { text: str(t.replace(GO_WORD, '')), go: true } : { text: t, go: false };
  }
  // 문자 확인을 기다릴 때 사장님 말 → 'yes' | 'no' | '' (다른 말)
  function confirmWord(text) {
    var t = str(text).replace(/[\s.!?,~]/g, '');
    if (/^(아니|아니요|아니야|아뇨|안돼|안보내|보내지마|취소|취소해|하지마)/.test(t)) return 'no';
    if (/^(응|어|네|예|그래|ㅇㅇ|좋아|보내|보내줘|보내요|보내주세요)+$/.test(t)) return 'yes';   // '보내 보내' — 말은 되풀이돼 찍히기 쉽다
    return '';
  }
  // 소리로 읽을 글 — 이모지·꾸밈은 뺀다
  function speakable(text) {
    return str(str(text).replace(/\p{Extended_Pictographic}|️|‍/gu, '').replace(/[·•]/g, ', ').replace(/[ \t]+/g, ' '));
  }
  // 밖으로 나가는 일의 받는 곳 — 한 번 말에 같은 곳으로 두 번 안 나가게 (11/5: 한 줄 시켰는데 글만 바꿔 카톡 3번 나감)
  function outKeys(a) {
    var norm = function (v) { return str(v).replace(/\s+/g, '').toLowerCase(); };
    if (a.tool === 'send_kakao') return ['kakao:' + norm(a.room || a.client || a.siteId)];
    if (a.tool === 'send_text') return names(a.names).map(function (n) { return 'text:' + norm(n); });
    if (a.tool === 'send_site_info') return names(a.names).map(function (n) { return 'info:' + str(a.siteId) + ':' + norm(n); });
    return [];
  }
  var CLAIM = /(보냈|바꿨|넣었|저장했|되돌렸|처리했|받음으로)/;
  /* 한 번 말한 것 처리. deps: ask(history) → Promise { ok, say, actions, chips }, exec(action) → Promise { ok, why?, ... }, hasSite(id), userText.
     돌려줌 { say, chips, results, pending, failed } — failed 면 AI 답을 못 받음 (results 는 이미 한 일) */
  function run(history, deps) {
    var extra = [], results = [], pending = [], seen = {}, gone = {}, step = 0, retried = false;
    function done(say, chips, failed) { return { say: say, chips: chips || [], results: results, pending: pending, failed: !!failed }; }
    function loop() {
      return deps.ask(history.concat(extra)).then(function (r) {
        if (!r || !r.ok) throw new Error((r && r.error) || 'AI 답 없음');
        var acts = (Array.isArray(r.actions) ? r.actions : []).slice(0, MAX_ACTIONS).filter(function (a) {
          var k = JSON.stringify(a);
          if (seen[k]) return false;
          seen[k] = true;
          return true;
        });
        if (!acts.length) {
          // 아무것도 안 했는데 했다고 말하면 한 번 되묻고, 그래도 그러면 사실을 앞에 붙인다
          var changed = results.some(function (x) { return (x.ok || x.partial) && x.tool !== 'find_sites'; });
          if (CLAIM.test(str(r.say).replace(/(못|안)\s*(보냈|바꿨|넣었|저장했|되돌렸|처리했)/g, '')) && !changed && !pending.length) {
            if (!retried) {
              retried = true;
              extra = extra.concat([{ role: 'tool', text: '[앱] 아직 실제로 실행한 것이 없다. 하려면 actions 에 넣고, 아니면 못 했다고 사실대로 말하라.' }]);
              return loop();
            }
            return done('⚠️ 실제로 처리된 건 없어요.\n' + str(r.say), r.chips);
          }
          return done(str(r.say) || (results.length ? '처리했어요. 아래 결과를 봐 주세요.' : '다시 한번 말씀해 주세요.'), r.chips);
        }
        if (step >= MAX_STEPS) return done((str(r.say) ? str(r.say) + '\n' : '') + '(한 번에 너무 많아 여기까지만 처리했어요. 남은 건 다시 말씀해 주세요.)', r.chips);
        step++;
        var later = [];
        return acts.reduce(function (p, a) {
          return p.then(function (rs) {
            var why = check(a, deps);
            if (why) return rs.concat([{ tool: a.tool, ok: false, why: why }]);
            // 앞 단계에서 이미 내보낸 곳 — 글이 달라도 다시 안 보낸다. 받는 사람이 일부만 겹치면 안 겹친 사람에게만
            var keys = outKeys(a);
            if (keys.length) {
              var fresh = keys.filter(function (k) { return !gone[k]; });
              if (!fresh.length) return rs.concat([{ tool: a.tool, ok: true, same: true, why: '이미 맡긴 일이라 또 보내지 않았다. 다시 넣지 말고 사장님께 결과만 말하라' }]);
              if (a.names && fresh.length < keys.length) a = Object.assign({}, a, { names: names(a.names).filter(function (n, i) { return !gone[keys[i]]; }) });
              later = later.concat(fresh);
            }
            if (needsConfirm(a, deps.confirmSms)) {
              pending.push(a);
              return rs.concat([{ tool: a.tool, ok: false, waiting: true, why: '아직 안 보냄 — 사장님이 [보내] 를 눌러야 나간다' }]);
            }
            return Promise.resolve(deps.exec(a)).catch(function (e) { return { ok: false, why: String((e && e.message) || e).slice(0, 80) }; })
              .then(function (x) { return rs.concat([Object.assign({ tool: a.tool }, x)]); });
          });
        }, Promise.resolve([])).then(function (rs) {
          later.forEach(function (k) { gone[k] = true; });
          results = results.concat(rs);
          extra = extra.concat([{ role: 'tool', text: '[앱 실행 결과] ' + JSON.stringify(rs.map(forAi)) }]);
          return loop();
        });
      }).catch(function (e) {
        if (!results.length) return done('연결이 안 됐어요. 아무것도 처리하지 않았어요. 다시 보내 주세요.', [], true);
        return done('처리는 했는데 답을 못 만들었어요. 아래 결과를 봐 주세요.', [], true);
      });
    }
    return loop();
  }
  function forAi(x) {
    var o = {};
    ['tool', 'ok', 'partial', 'why', 'waiting', 'text', 'data', 'people', 'undoId', 'same', 'state'].forEach(function (k) { if (x[k] !== undefined && x[k] !== '') o[k] = x[k]; });
    return o;
  }
  // 📋 업무 내역: 시킨 일의 실제 결과 → 내역 줄 (비번 값 없음). 실패 중 사장님이 봐야 할 것(문자)은 state need
  function logItems(results) {
    var out = [];
    (results || []).forEach(function (r) {
      if (r.waiting || r.same) return;
      (r.logs || []).forEach(function (l) { out.push(Object.assign({ src: 'me' }, l)); });
    });
    return out;
  }
  // 예전 내역 옮기기 (한 번만): 업무지시 카드·비서 대화의 결과 — 비번 값은 ':' 뒤를 잘라 뺀다
  function oldLogItems(orders, chats) {
    var out = [];
    (orders || []).forEach(function (o) {
      if (o.state !== 'done' || !o.f || !o.f.label) return;
      out.push({ id: 'old-' + o.id, t: Date.parse(o.at) || 0, src: 'me', kind: o.f.kind === 'staff' ? 'crew' : 'site', title: o.f.label + ' 바꿈', detail: o.siteName || '', siteId: o.siteId || '' });
    });
    (chats || []).forEach(function (m) {
      (m.cards || []).forEach(function (c, i) {
        if (!c.ok || c.wait || c.same || /^↩/.test(c.text)) return;
        out.push({ id: 'old-' + m.id + '-' + i, t: Date.parse(m.at) || 0, src: 'me', kind: /문자/.test(c.text) ? 'sms' : 'site', title: str(String(c.text).split(':')[0]).replace(/^\p{Extended_Pictographic}\uFE0F?\s*/u, '') });
      });
    });
    return out;
  }
  // 저장된 대화 → AI 에게 보낼 대화 (최근 것만)
  function toHistory(msgs) {
    return (msgs || []).slice(-HISTORY).map(function (m) {
      if (m.role === 'me') return { role: 'user', text: str(m.text) };
      var did = (m.cards || []).map(function (c) { return (c.wait ? '[사장님 확인 기다림] ' : '[한 일] ' + (c.ok ? '' : '실패: ')) + c.text + (c.undoId ? ' (undoId ' + c.undoId + (c.undone ? ', 되돌림' : '') + ')' : ''); });
      return { role: 'assistant', text: [str(m.text)].concat(did).join('\n') };
    });
  }
  function recentUserText(msgs) {
    return (msgs || []).filter(function (m) { return m.role === 'me'; }).slice(-6).map(function (m) { return m.text; }).join(' ');
  }
  return { contactBook: contactBook, buildContext: buildContext, findSites: findSites, check: check, needsConfirm: needsConfirm, logItems: logItems, oldLogItems: oldLogItems, goWord: goWord, confirmWord: confirmWord, speakable: speakable, run: run, toHistory: toHistory, recentUserText: recentUserText, CONFIRM_OVER: CONFIRM_OVER };
});
