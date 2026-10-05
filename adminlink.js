// adminlink.js — 일정 앱 현장 ↔ 현장업무(관리자 앱) 연결
// 순수 계산(화면·네트워크 없음) + fetch/Store 를 주입받는 웹훅 호출. 브라우저에서는 전역 AdminLink, node 에서는 module.exports.
// 연결 값(adminId, adminSynced)은 일정 앱이 자기 현장 객체에 적는다 — 서버 백업은 폰 → 서버 한 방향이라
// 다른 앱이 서버 쪽에 적으면 폰의 다음 백업이 덮어쓴다.
(function (root) {
  'use strict';

  var Share = root.Share || (typeof require === 'function' ? require('./share.js') : null);

  var ADMIN_APP_URL = 'https://jayunsu22.github.io/autoblog/admin.html';
  function adminOpenUrl(adminId) { return ADMIN_APP_URL + '#site=' + adminId; }

  // 비슷함 기준: 숫자 없는 두 글자 조각이 2개 이상 겹침 (견적 앱 QuoteToSite.현장정렬 과 같은 규칙)
  var SIMILAR_MIN = 2;

  function str(v) { return String(v == null ? '' : v).trim(); }

  function adminTitle(site) {
    var t = Share.titleLine(site);
    return t === '(이름없음)' ? '' : t;
  }
  function firstDate(site) {
    var d = site && site.days && site.days[0] && site.days[0].date;
    return Share.isIsoDate(d) ? d : '';
  }
  function rosterOf(site) {
    var out = [];
    ((site && site.days) || []).forEach(function (d) {
      ((d && d.staff) || []).forEach(function (n) {
        var v = str(n);
        if (v && out.indexOf(v) === -1) out.push(v);
      });
    });
    return out;
  }

  function sameSet(a, b) {
    if (a.length !== b.length) return false;
    return a.every(function (x) { return b.indexOf(x) !== -1; });
  }
  function needsSync(site) {
    var none = { name: false, date: false, staff: false, any: false };
    if (!site || !str(site.adminId)) return none;
    var done = site.adminSynced || { name: '', date: '', staff: [] };
    var name = adminTitle(site), date = firstDate(site), staff = rosterOf(site);
    var r = {
      name: !!name && name !== done.name,
      date: !!date && date !== done.date,
      staff: !sameSet(staff, done.staff || [])
    };
    r.any = r.name || r.date || r.staff;
    return r;
  }

  // 관리자 명단(current)을 일정 앱 기준 명단(desired)에 맞춘 결과를 계산한다.
  // 삭제는 "지난번에 우리가 넣은 이름(prevSynced)인데 이제 기준에 없고 배정이 없는" 이름만.
  function planRoster(o) {
    var desired = o.desired || [], current = o.current || [], prev = o.prevSynced || [], assigned = o.assigned || [];
    var added = desired.filter(function (n) { return current.indexOf(n) === -1; });
    var gone = current.filter(function (n) { return desired.indexOf(n) === -1 && prev.indexOf(n) !== -1; });
    var removed = gone.filter(function (n) { return assigned.indexOf(n) === -1; });
    var kept = gone.filter(function (n) { return assigned.indexOf(n) !== -1; });
    var adminOnly = current.filter(function (n) { return desired.indexOf(n) === -1 && prev.indexOf(n) === -1; });
    var next = current.filter(function (n) { return removed.indexOf(n) === -1; }).concat(added);
    return { next: next, added: added, removed: removed, kept: kept, adminOnly: adminOnly };
  }

  function fragments(s) {
    var out = {};
    String(s || '').split(/\s+/).forEach(function (w) {
      for (var i = 0; i + 1 < w.length; i++) {
        var g = w.slice(i, i + 2);
        if (!/\d/.test(g)) out[g] = true;
      }
    });
    return Object.keys(out);
  }
  // 묶을 현장업무 후보 정렬: 안 묶인 것이 위(비슷한 것이 더 위, 나머지는 시공일 최신순), 이미 묶인 것은 맨 뒤
  function rankProjects(projects, siteTitle, linkedIds) {
    var base = fragments(siteTitle), linked = linkedIds || [];
    return (projects || []).map(function (p) {
      var score = 0;
      fragments(p.name).forEach(function (g) { if (base.indexOf(g) !== -1) score++; });
      return { id: p.id, name: p.name, date: p.date || '', workers: p.workers || [],
        linked: linked.indexOf(p.id) !== -1, similar: score >= SIMILAR_MIN, score: score >= SIMILAR_MIN ? score : 0 };
    }).sort(function (a, b) {
      return (a.linked - b.linked) || (b.score - a.score) || String(b.date).localeCompare(String(a.date));
    }).map(function (p) { delete p.score; return p; });
  }

  // 견적 앱이 보내는 주소: #adminlink=<일정 앱 현장 id>:<현장업무 rec id>
  function parseAdminLinkHash(hash) {
    var m = /^#adminlink=([^:]+):(rec[A-Za-z0-9]+)$/.exec(hash || '');
    return m ? { siteId: m[1], adminId: m[2] } : null;
  }

  function createBody(site) {
    return {
      type: 'create_project',
      projectName: adminTitle(site),
      projectDate: firstDate(site),
      address: '',
      notice: '',
      workersText: rosterOf(site).join(',')
    };
  }

  var AdminLink = {
    ADMIN_APP_URL: ADMIN_APP_URL, adminOpenUrl: adminOpenUrl,
    adminTitle: adminTitle, firstDate: firstDate, rosterOf: rosterOf,
    needsSync: needsSync, planRoster: planRoster, rankProjects: rankProjects,
    parseAdminLinkHash: parseAdminLinkHash, createBody: createBody
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = AdminLink;
  else root.AdminLink = AdminLink;
})(typeof window !== 'undefined' ? window : this);
