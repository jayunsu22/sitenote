/* quote_link.js — 현장 ↔ 견적서 잇기 (2026-10-18)
   현장 머리줄의 [📄 견적서] 가 쓰는 조각들. 화면은 app.js 에 있고 여기는 계산·통신만 한다.
     - 견적서 받아오기: pro-quote?id=<견적코드> (발행된 견적서 한 장)
     - 내역 요약: 구역별 품목·수량·금액 (인원 몇 명 넣을지 가늠하는 용도)
     - 현장업무 품목 자동 체크: 견적 품목 → 현장관리자 품목명 짝짓기 → toggle_item_create
   짝짓기 규칙은 견적앱(songil/quote_to_site.js)과 같은 규칙을 옮겨 적은 것이다 —
   한쪽을 고치면 다른 쪽도 같이 고쳐야 한다. 순수 계산은 node 테스트: test/quote_link.test.js */
(function (root) {
  'use strict';

  var BASE = 'https://primary-production-a6fa.up.railway.app/webhook';
  var QUOTE_URL = BASE + '/pro-quote';
  var SAVE_URL = BASE + '/film-quality-save';
  var DETAIL_URL = BASE + '/film-quality-get-v2';
  var VIEW_URL = 'https://songil.netlify.app/q/';

  function str(v) { return String(v == null ? '' : v).trim(); }

  // ---------- 견적코드 ----------
  // 'AB12CD34' · '/q/AB12CD34' · 'https://songil.netlify.app/q/AB12CD34?x=1' 다 받는다
  function 코드뽑기(값) {
    var v = str(값);
    if (!v) return '';
    var m = /\/q\/([A-Za-z0-9_-]+)/.exec(v);
    if (m) return m[1];
    return /^[A-Za-z0-9_-]+$/.test(v) ? v : '';
  }
  function 보기주소(code) { return VIEW_URL + str(code); }

  // ---------- 견적 내역 ----------
  // 발행된 견적서의 라인들 → 화면에 그릴 구역별 묶음. 금액은 표시금액(조정까지 반영된 값)
  function 구역별(라인들) {
    var 순서 = [], 묶음 = {};
    (라인들 || []).forEach(function (l) {
      if (!l) return;
      var z = str(l.구역) || '기타';
      if (!묶음[z]) { 묶음[z] = []; 순서.push(z); }
      묶음[z].push({
        품목명: str(l.품목명),
        수량: l.수량 === 0 || l.수량 ? str(l.수량) : '',
        단위: str(l.단위),
        금액: Math.round(l.표시금액 || l.라인금액 || l.직접금액 || 0)
      });
    });
    return 순서.map(function (z) {
      var 줄 = 묶음[z];
      return { 구역: z, 줄: 줄, 합: 줄.reduce(function (s, x) { return s + x.금액; }, 0) };
    });
  }
  function 요약(견적) {
    var 라인 = (견적 && 견적.라인들) || [];
    return {
      현장명: str(견적 && 견적.현장명),
      평형: str(견적 && 견적.평형),
      총액: Math.round((견적 && 견적.총액) || 0),
      줄수: 라인.length,
      발행일시: str(견적 && (견적.발행일시 || 견적.생성일시))
    };
  }

  // ---------- 견적 품목 → 현장관리자 품목명 (견적앱 quote_to_site.js 와 같은 규칙) ----------
  var 몰딩류 = ['몰딩', '크라운몰딩', '걸레받이'];
  function 앞머리(구역) {
    if (구역 === '세탁실') return '거실세탁실';
    if (구역 === '실외기실') return '거실실외기실';
    return 구역;
  }
  function 기본이름(품목명) { return str(품목명).split(' (')[0].trim(); }
  function 몰딩구역(방수) {
    var n = Math.max(1, Math.min(5, parseInt(방수, 10) || 3));
    var out = ['거실', '주방', '현관', '방1'];
    for (var i = 2; i <= n; i++) out.push('방' + i);
    return out;
  }
  function 후보(구역, 품목명, 방수) {
    var 이름 = 기본이름(품목명);
    var P = 앞머리(구역);
    if (몰딩류.indexOf(이름) >= 0) {
      var 끝 = 이름 === '걸레받이' ? '걸레받이' : '몰딩';
      if (구역 === '전체공통') return { 묶음: 몰딩구역(방수).map(function (z) { return z + 끝; }) };
      return { 후보: [P + 끝] };
    }
    if (이름 === '방문' || 이름 === '문짝' || 이름 === '문틀') return { 후보: [P + '문+틀', P + '문'] };
    if (이름 === '샤시1' || 이름 === '샤시2') return { 후보: [P + 이름, P + '샤시'] };
    if (/^(붙박이장|수납장)/.test(이름)) return { 후보: [P + '수납장'] };
    if (이름 === '등박스') return { 후보: [P + '등박스'] };
    if (이름 === '화장실문' || 이름 === '화장실 문짝') return { 후보: [P + '화장실문+틀', P + '화장실문'] };
    if (이름 === '화장대') return { 후보: ['화장대'] };
    if (이름 === '거실베란다 통로문' || 이름 === '베란다 중문') return { 후보: ['거실베란다문'] };
    if (이름 === '아치') return { 후보: [P + '아치문틀'] };
    if (이름 === '아트월') return { 후보: ['아트월'] };
    if (이름 === '가벽') return { 후보: 구역 === '거실' ? ['가벽', '거실가벽'] : [P + '가벽'] };
    if (/^신발장(틀|문짝)$/.test(이름)) return { 후보: ['신발장1'] };
    if (/^싱크대/.test(이름)) return { 후보: ['싱크대'] };
    if (/^냉장고장/.test(이름)) return { 후보: ['냉장고장'] };
    if (이름 === '세탁실문') return { 후보: ['거실세탁실문'] };
    if (이름 === '실외기실문') return { 후보: ['거실실외기실문'] };
    if (/^중문/.test(이름) && 구역 === '현관') return { 후보: ['현관중문'] };
    if (이름 === '신발장1' || 이름 === '신발장2' || 이름 === '현관문') return { 후보: [이름] };
    return { 후보: [P + 이름.replace(/\s+/g, '')] };
  }
  // 라인들 → [{구역, 품목명}] (금액 0 짜리도 시공은 하므로 뺄 이유가 없다)
  function 견적품목들(라인들) {
    var out = [];
    (라인들 || []).forEach(function (l) {
      if (!l) return;
      var z = str(l.구역), n = str(l.품목명);
      if (z && n) out.push({ 구역: z, 품목명: n });
    });
    return out;
  }
  // 방이 몇 개인 집인지는 견적 구역에서 읽는다 (전체공통 몰딩을 방마다 나눠 체크할 때 쓴다)
  function 방수추정(라인들) {
    var n = 0;
    (라인들 || []).forEach(function (l) {
      var m = /^방([1-5])/.exec(str(l && l.구역));
      if (m) n = Math.max(n, +m[1]);
    });
    return n || 3;
  }
  function 짝짓기(견적품목, 방수, 현장품목명들) {
    var 있음 = {};
    (현장품목명들 || []).forEach(function (n) { if (n) 있음[n] = true; });
    var 짝 = [], 짝없음 = [], 넣은품목 = {}, 넣은없음 = {};
    (견적품목 || []).forEach(function (q) {
      var h = 후보(q.구역, q.품목명, 방수);
      var 찾은 = [];
      if (h.묶음) {
        찾은 = h.묶음.filter(function (n) { return 있음[n]; });
      } else {
        for (var i = 0; i < h.후보.length; i++) { if (있음[h.후보[i]]) { 찾은 = [h.후보[i]]; break; } }
      }
      if (!찾은.length) {
        var k = q.구역 + '|' + q.품목명;
        if (!넣은없음[k]) { 넣은없음[k] = true; 짝없음.push({ 구역: q.구역, 견적품목: q.품목명 }); }
        return;
      }
      찾은.forEach(function (n) {
        if (넣은품목[n]) return;
        넣은품목[n] = true;
        짝.push({ 구역: q.구역, 견적품목: q.품목명, 현장품목: n });
      });
    });
    return { 짝: 짝, 짝없음: 짝없음 };
  }

  // ---------- 통신 (fetchFn 주입) ----------
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
  function 견적받기(code, deps) {
    var c = 코드뽑기(code);
    if (!c) return Promise.reject(new Error('견적코드가 없습니다'));
    return request(deps, QUOTE_URL + '?id=' + encodeURIComponent(c), { method: 'GET', cache: 'no-store' })
      .then(function (res) { return res.json(); })
      .then(function (j) {
        if (Array.isArray(j)) j = j[0];
        if (!j || j.error) throw new Error('견적서를 찾지 못했습니다');
        return j;
      });
  }
  function 현장상세받기(adminId, deps) {
    return request(deps, DETAIL_URL + '?code=' + encodeURIComponent(adminId) + '&_t=' + Date.now(), { method: 'GET', cache: 'no-store' })
      .then(function (res) { return res.json(); })
      .then(function (d) { return Array.isArray(d) ? (d[0] || {}) : (d || {}); });
  }
  /* 견적서대로 현장업무 품목을 켠다.
     돌려주는 값: { 켠것, 이미, 짝없음, 실패 } — 이미 켜진 품목은 건드리지 않는다(실수로 꺼지지 않게) */
  function 품목맞추기(adminId, code, deps) {
    var 견적;
    return 견적받기(code, deps).then(function (q) {
      견적 = q;
      return 현장상세받기(adminId, deps);
    }).then(function (d) {
      var 현장품목 = ((d && d.masterItems) || []).map(function (m) { return str(m && m.품목명); }).filter(Boolean);
      var 이미맵 = {};
      ((d && d.activeItems) || []).forEach(function (n) { 이미맵[str(n)] = true; });
      var r = 짝짓기(견적품목들(견적.라인들), 방수추정(견적.라인들), 현장품목);
      var 새것 = r.짝.filter(function (x) { return !이미맵[x.현장품목]; });
      var 이미 = r.짝.filter(function (x) { return 이미맵[x.현장품목]; });
      var 켠것 = [], 실패 = [];
      var 하나씩 = function (i) {
        if (i >= 새것.length) return Promise.resolve();
        var 이름 = 새것[i].현장품목;
        return request(deps, SAVE_URL, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'toggle_item_create', projectCode: adminId, itemName: 이름 })
        }).then(function () { 켠것.push(이름); }, function () { 실패.push(이름); })
          .then(function () { return 하나씩(i + 1); });
      };
      return 하나씩(0).then(function () {
        return { 켠것: 켠것, 이미: 이미.map(function (x) { return x.현장품목; }), 짝없음: r.짝없음, 실패: 실패 };
      });
    });
  }

  var QuoteLink = {
    QUOTE_URL: QUOTE_URL, SAVE_URL: SAVE_URL, DETAIL_URL: DETAIL_URL,
    코드뽑기: 코드뽑기, 보기주소: 보기주소,
    구역별: 구역별, 요약: 요약,
    후보: 후보, 견적품목들: 견적품목들, 방수추정: 방수추정, 짝짓기: 짝짓기,
    견적받기: 견적받기, 현장상세받기: 현장상세받기, 품목맞추기: 품목맞추기
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = QuoteLink;
  else root.QuoteLink = QuoteLink;
})(typeof window !== 'undefined' ? window : this);
