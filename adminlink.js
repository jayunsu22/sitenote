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

  // ---------- 웹훅 호출 (fetch·Store 는 deps 로 주입: { fetchFn, Store }) ----------
  var BASE = 'https://primary-production-a6fa.up.railway.app/webhook';
  var URLS = { save: BASE + '/film-quality-save', list: BASE + '/film-admin-get-v2', detail: BASE + '/film-quality-get-v2' };
  var TIMEOUT_MS = 15000;

  function request(deps, url, opt) {
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, TIMEOUT_MS) : null;
    var o = Object.assign({}, opt || {});
    if (ctrl) o.signal = ctrl.signal;
    return Promise.resolve(deps.fetchFn(url, o)).then(function (res) {
      if (timer) clearTimeout(timer);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res;
    }, function (e) { if (timer) clearTimeout(timer); throw e; });
  }
  function post(deps, body) {
    return request(deps, URLS.save, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  }
  function getJson(deps, url) {
    return request(deps, url, { method: 'GET', cache: 'no-store' }).then(function (res) { return res.json(); })
      .then(function (d) { return Array.isArray(d) ? (d[0] || {}) : (d || {}); });
  }
  function rawProjects(deps) {
    return getJson(deps, URLS.list + '?_t=' + Date.now()).then(function (d) { return d.projects || []; });
  }

  function listProjects(deps) {
    return rawProjects(deps).then(function (arr) {
      return arr.map(function (p) { return { id: p.id, f: p.fields || p }; })
        .filter(function (p) { return !p.f.보관함; })
        .map(function (p) {
          return { id: p.id, name: str(p.f.현장명), date: str(p.f.시공일자),
            workers: String(p.f.시공기사 || '').split(',').map(str).filter(Boolean) };
        });
    });
  }

  var creating = {};
  function createProject(siteId, deps) {
    var site = deps.Store.getSite(siteId);
    if (!site) return Promise.reject(new Error('현장을 찾을 수 없습니다'));
    if (str(site.adminId)) return Promise.resolve(site.adminId);
    if (creating[siteId]) return creating[siteId];
    var body = createBody(site);
    if (!body.projectName) return Promise.reject(new Error('현장명을 먼저 적어주세요'));
    var roster = rosterOf(site);
    var p = post(deps, body).then(function (res) { return res.json().catch(function () { return null; }); })
      .then(function (d) {
        if (Array.isArray(d)) d = d[0];
        var id = d && (d.id || (d.fields && d.fields.id));
        if (id) return id;
        // 응답에 id 가 없으면 목록을 다시 받아 방금 만든 이름 중 가장 새 것을 찾는다
        return rawProjects(deps).then(function (arr) {
          var same = arr.filter(function (x) { return str((x.fields || x).현장명) === body.projectName; })
            .sort(function (a, b) { return String((b.fields || b).createdTime || '').localeCompare(String((a.fields || a).createdTime || '')); });
          if (!same.length) throw new Error('새 현장업무 id 를 찾지 못했습니다');
          return same[0].id;
        });
      })
      .then(function (id) {
        // id 를 얻은 뒤에만 저장한다 (반쪽 상태 금지)
        deps.Store.updateSite(siteId, { adminId: id, adminSynced: { name: body.projectName, date: body.projectDate, staff: roster } });
        return id;
      })
      .then(function (id) { delete creating[siteId]; return id; }, function (e) { delete creating[siteId]; throw e; });
    creating[siteId] = p;
    return p;
  }

  // 이미 있는 현장업무에 묶는다. 관리자 앱의 현장명을 덮어쓰지 않도록 이름은 맞춘 것으로 기록하고,
  // 날짜·인원은 첫 맞춤 대상으로 남긴다.
  function linkExisting(siteId, adminId, deps) {
    var site = deps.Store.getSite(siteId);
    return deps.Store.updateSite(siteId, { adminId: adminId, adminSynced: { name: adminTitle(site), date: '', staff: [] } });
  }
  function unlink(siteId, deps) {
    return deps.Store.updateSite(siteId, { adminId: '', adminSynced: null });
  }

  var syncing = {};
  function syncSite(siteId, deps) {
    if (syncing[siteId]) return syncing[siteId];
    var site = deps.Store.getSite(siteId);
    var need = needsSync(site);
    var result = { ok: true, meta: 'skip', staff: 'skip', kept: [], adminOnly: [], error: '' };
    if (!need.any) return Promise.resolve(result);

    var adminId = site.adminId;
    var synced = { name: '', date: '', staff: [] };
    Object.assign(synced, site.adminSynced || {});
    synced.staff = (synced.staff || []).slice();
    var name = adminTitle(site), date = firstDate(site), roster = rosterOf(site);

    function metaStep() {
      if (!need.name && !need.date) return Promise.resolve();
      var body = { type: 'update_project_name', projectCode: adminId };
      if (need.name) body.newName = name;
      if (need.date) body.newDate = date;
      return post(deps, body).then(function () {
        if (need.name) synced.name = name;
        if (need.date) synced.date = date;
        result.meta = 'ok';
      }, function (e) { result.ok = false; result.meta = 'fail'; result.error = e.message; });
    }
    function staffStep() {
      if (!need.staff) return Promise.resolve();
      return getJson(deps, URLS.detail + '?code=' + encodeURIComponent(adminId) + '&_t=' + Date.now()).then(function (d) {
        var current = (d.workers || []).map(str).filter(Boolean);
        var assigned = [];
        (d.tasks || []).forEach(function (t) {
          var f = t.fields || t;
          [f.밑작업기사, f.시공기사].forEach(function (n) { n = str(n); if (n) assigned.push(n); });
        });
        var plan = planRoster({ desired: roster, current: current, prevSynced: synced.staff, assigned: assigned });
        result.kept = plan.kept; result.adminOnly = plan.adminOnly;
        var same = plan.next.length === current.length && plan.next.every(function (n, i) { return n === current[i]; });
        if (same) return;
        return post(deps, { type: 'update_workers', projectCode: adminId, workersText: plan.next.join(',') });
      }).then(function () {
        synced.staff = roster; result.staff = 'ok';
      }, function (e) { result.ok = false; result.staff = 'fail'; result.error = result.error || e.message; });
    }

    var p = metaStep().then(staffStep).then(function () {
      deps.Store.updateSite(siteId, { adminSynced: synced });
      delete syncing[siteId];
      return result;
    }, function (e) { delete syncing[siteId]; throw e; });
    syncing[siteId] = p;
    return p;
  }

  var AdminLink = {
    ADMIN_APP_URL: ADMIN_APP_URL, adminOpenUrl: adminOpenUrl,
    adminTitle: adminTitle, firstDate: firstDate, rosterOf: rosterOf,
    needsSync: needsSync, planRoster: planRoster, rankProjects: rankProjects,
    parseAdminLinkHash: parseAdminLinkHash, createBody: createBody,
    URLS: URLS, listProjects: listProjects, createProject: createProject,
    linkExisting: linkExisting, unlink: unlink, syncSite: syncSite
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = AdminLink;
  else root.AdminLink = AdminLink;
})(typeof window !== 'undefined' ? window : this);
