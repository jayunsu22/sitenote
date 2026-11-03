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

  // AI 에게 줄 지금 앱 상태 — 고객 번호는 넣지 않는다. 팀원은 번호 대신 있고 없고만
  function buildContext(o) {
    var today = o.today, clients = {};
    (o.clients || []).forEach(function (c) { clients[c.id] = c.name; });
    var gap = function (d) { return Math.round((Date.parse(d + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 864e5); };
    var sites = (o.sites || []).filter(function (s) {
      var d = str(s.date).slice(0, 10);
      return s.id && !s.hide && d && gap(d) >= -45 && gap(d) <= 60;
    }).sort(function (a, b) { return Math.abs(gap(str(a.date).slice(0, 10))) - Math.abs(gap(str(b.date).slice(0, 10))); }).slice(0, 60).map(function (s) {
      return siteView(s, clients);
    });
    var people = (o.settings && o.settings.people) || {};
    var team = names(((o.settings && o.settings.team) || []).concat(Object.keys(people))).map(function (n) {
      return { name: n, phone: !!digits((people[n] || {}).phone) };
    });
    return {
      today: today, sites: sites, team: team,
      todo: (o.todo || []).slice(0, 40).map(function (t) { return { kind: t.kind, title: t.title, res: t.res || '', siteId: t.siteId || '' }; }),
      tasks: (o.tasks || []).filter(function (t) { return !t.done; }).slice(0, 30).map(function (t) { return { title: t.title, date: t.date || '' }; }),
      undo: (o.undo || []).slice(0, 10)
    };
  }
  function siteView(s, clients) {
    return {
      id: s.id, client: (clients && clients[s.clientId]) || '', name: [str(s.name), str(s.unit)].filter(Boolean).join(' '), date: str(s.date).slice(0, 10),
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
      var hay = squash([map[s.clientId], s.name, s.unit].join(' '));
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
  function needsConfirm(a) {
    return (a.tool === 'send_text' || a.tool === 'send_site_info') && names(a.names).length > CONFIRM_OVER;
  }
  var CLAIM = /(보냈|바꿨|넣었|저장했|되돌렸|처리했|받음으로)/;
  /* 한 번 말한 것 처리. deps: ask(history) → Promise { ok, say, actions, chips }, exec(action) → Promise { ok, why?, ... }, hasSite(id), userText.
     돌려줌 { say, chips, results, pending, failed } — failed 면 AI 답을 못 받음 (results 는 이미 한 일) */
  function run(history, deps) {
    var extra = [], results = [], pending = [], seen = {}, step = 0, retried = false;
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
        return acts.reduce(function (p, a) {
          return p.then(function (rs) {
            var why = check(a, deps);
            if (why) return rs.concat([{ tool: a.tool, ok: false, why: why }]);
            if (needsConfirm(a)) {
              pending.push(a);
              return rs.concat([{ tool: a.tool, ok: false, waiting: true, why: '아직 안 보냄 — 사장님이 [보내] 를 눌러야 나간다' }]);
            }
            return Promise.resolve(deps.exec(a)).catch(function (e) { return { ok: false, why: String((e && e.message) || e).slice(0, 80) }; })
              .then(function (x) { return rs.concat([Object.assign({ tool: a.tool }, x)]); });
          });
        }, Promise.resolve([])).then(function (rs) {
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
    ['tool', 'ok', 'partial', 'why', 'waiting', 'text', 'data', 'people', 'undoId', 'same'].forEach(function (k) { if (x[k] !== undefined && x[k] !== '') o[k] = x[k]; });
    return o;
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
  return { buildContext: buildContext, findSites: findSites, check: check, needsConfirm: needsConfirm, run: run, toHistory: toHistory, recentUserText: recentUserText, CONFIRM_OVER: CONFIRM_OVER };
});
