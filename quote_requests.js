/* 견적요청 내역 (2026-10-17) — 거래처 화면의 '견적요청 내역' 칸.
   카톡으로 온 견적요청은 방문견적(songil.netlify.app/quote_pro.html)에서 받아 적고 발행한다.
   이 앱은 그 결과를 같은 백업키로 읽어 보여주기만 한다 (고치기·지우기는 방문견적에서).
     - 저장함 건 중 요청.거래처ID 가 이 거래처인 것 → 답장 전 / 작성 중 / 발행
     - 발행목록 중 현장관리_거래처ID 가 이 거래처인 것 → 발행 (저장함에서 지웠어도 남는다)
   [＋ 견적요청 작성하기] 는 방문견적을 ?req=1&client=<거래처ID> 로 연다.
   순수 계산(요청내역·답장전수)은 node 테스트: test/quote_requests.test.js */
(function (root) {
  'use strict';

  var 순위 = { '답장 전': 0, '작성 중': 1, '발행': 2 };

  function 요약글(원문) {
    var 줄 = String(원문 || '').split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean);
    return 줄.slice(0, 3).join(' · ');
  }

  function 요청내역(박스항목, 발행, 거래처ID) {
    var 발행맵 = {};
    (발행 || []).forEach(function (p) { if (p && p.견적코드) 발행맵[p.견적코드] = p; });
    var 쓴코드 = {};
    var out = [];
    (박스항목 || []).forEach(function (it) {
      if (!it) return;
      var 요 = it.요청 || (it.상태 && it.상태.요청);
      if (!요 || 요.거래처ID !== 거래처ID) return;
      var 코드 = it.현장코드 || '';
      var 상태 = 코드 ? '발행' : (it.건수 > 0 ? '작성 중' : '답장 전');
      if (코드) 쓴코드[코드] = true;
      var p = 코드 && 발행맵[코드];
      out.push({
        상태: 상태, 이름: it.이름 || '', 요약: 요약글(요.원문),
        날짜: (p && p.발행일시) || 요.접수일시 || it.저장일시 || '',
        금액: 상태 === '답장 전' ? 0 : (p ? p.총액 : it.총액) || 0,
        견적코드: 코드,
      });
    });
    (발행 || []).forEach(function (p) {
      if (!p || !p.견적코드 || 쓴코드[p.견적코드] || p.현장관리_거래처ID !== 거래처ID) return;
      out.push({ 상태: '발행', 이름: p.현장명 || '', 요약: '', 날짜: p.발행일시 || '', 금액: p.총액 || 0, 견적코드: p.견적코드 });
    });
    out.sort(function (a, b) {
      return (순위[a.상태] - 순위[b.상태]) || String(b.날짜).localeCompare(String(a.날짜));
    });
    return out;
  }

  function 답장전수(목록) {
    return (목록 || []).filter(function (x) { return x.상태 === '답장 전'; }).length;
  }

  var QuoteRequests = { 요청내역: 요청내역, 답장전수: 답장전수 };

  /* ---------- 화면 (브라우저에서만) ---------- */
  if (typeof document !== 'undefined') {
    var RESTORE = 'https://primary-production-a6fa.up.railway.app/webhook/pro-box-restore';
    var QUOTE_APP = 'https://songil.netlify.app/quote_pro.html';
    var VIEW = 'https://songil.netlify.app/q/';
    var 새로받기_MS = 2 * 60 * 1000;
    var 열림 = false;
    var 받은 = null;     // { 시각, items, published }
    var 받는중 = null;
    var 오류 = '';

    function el(tag, cls, text) {
      var e = document.createElement(tag);
      if (cls) e.className = cls;
      if (text != null) e.textContent = text;
      return e;
    }
    function 원(n) { return Math.round(n || 0).toLocaleString('ko-KR') + '원'; }
    function 짧은날(iso) {
      var d = new Date(iso);
      if (isNaN(d)) return '';
      return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    }
    function 키() { return (root.Store && root.Store.state && root.Store.state.settings.backupKey) || ''; }

    function 받기() {
      if (받는중) return 받는중;
      if (!키()) { 오류 = '백업키가 없어요 · 설정에서 백업키를 넣어 주세요'; return Promise.resolve(); }
      받는중 = fetch(RESTORE + '?key=' + encodeURIComponent(키()))
        .then(function (res) {
          if (!res.ok) throw new Error(res.status === 401 || res.status === 403 ? '이 기기는 등록이 안 됐어요' : 'HTTP ' + res.status);
          return res.json();
        })
        .then(function (j) {
          받은 = { 시각: Date.now(), items: (j && j.items) || [], published: (j && j.published) || [] };
          오류 = '';
        })
        .catch(function (e) { 오류 = '내역을 못 받았어요 (' + (e.message || e) + ')'; })
        .then(function () { 받는중 = null; });
      return 받는중;
    }

    function render(wrap, clientId) {
      wrap.innerHTML = '';
      if (!clientId) { wrap.hidden = true; return; }
      wrap.hidden = false;
      wrap.className = 'fixed-wrap qreq-wrap' + (열림 ? ' open' : '');
      var 목록 = 받은 ? 요청내역(받은.items, 받은.published, clientId) : [];
      var n = 답장전수(목록);

      var tg = el('button', 'fixed-toggle');
      tg.innerHTML = '<span class="fixed-arrow">▶</span> 견적요청 내역 <span class="qreq-badge"></span><span class="fixed-sub"></span>';
      var 배지 = tg.querySelector('.qreq-badge');
      배지.textContent = n ? '답장 전 ' + n : '';
      배지.hidden = !n;
      tg.querySelector('.fixed-sub').textContent = 받은 ? (목록.length ? 목록.length + '건' : '카톡 요청 → 방문견적') : '카톡 요청 → 방문견적';
      tg.onclick = function () { 열림 = !열림; render(wrap, clientId); };
      wrap.appendChild(tg);

      // 접혀 있어도 배지를 위해 한 번은 받아 둔다.
      // 실패했으면 저절로 다시 받지 않는다 - 받고 → 실패 → 다시 그림 → 또 받고 가 끝없이 돈다.
      // 다시 받기는 '다시' 를 눌렀을 때만.
      if (!오류 && !받는중 && (!받은 || Date.now() - 받은.시각 > 새로받기_MS)) {
        받기().then(function () { if (wrap.isConnected) render(wrap, clientId); });
      }
      if (!열림) return;

      var body = el('div', 'fixed-body qreq-body');
      var add = el('button', 'btn-sm primary qreq-add', '＋ 견적요청 작성하기');
      add.onclick = function () { window.open(QUOTE_APP + '?req=1&client=' + encodeURIComponent(clientId), '_blank'); };
      body.appendChild(add);
      if (받는중 && !받은) body.appendChild(el('p', 'sheet-hint', '불러오는 중…'));
      if (오류) {
        var e = el('p', 'sheet-hint qreq-err', 오류 + ' · ');
        var again = el('a', '', '다시');
        again.href = '#';
        again.onclick = function (ev) { ev.preventDefault(); 오류 = ''; 받기().then(function () { render(wrap, clientId); }); };
        e.appendChild(again);
        body.appendChild(e);
      }
      if (받은 && !목록.length) body.appendChild(el('p', 'sheet-hint', '아직 없어요. 카톡으로 견적요청이 오면 위 버튼으로 받아 적으세요.'));
      목록.forEach(function (x) {
        var row = el('button', 'qreq-row');
        var cls = x.상태 === '답장 전' ? 'red' : x.상태 === '작성 중' ? 'amber' : 'green';
        row.appendChild(el('span', 'qreq-st ' + cls, x.상태));
        var t = el('span', 'qreq-t');
        t.appendChild(el('b', '', x.이름 || '(이름 없음)'));
        if (x.요약) t.appendChild(el('span', 'qreq-sum', x.요약));
        t.appendChild(el('span', 'qreq-m', 짧은날(x.날짜) + (x.금액 ? ' · ' + 원(x.금액) : '') + (x.견적코드 ? ' · /q/' + x.견적코드 : '')));
        row.appendChild(t);
        row.onclick = function () {
          // 발행한 건 견적서, 아직이면 방문견적(저장함에서 이어서)
          window.open(x.견적코드 ? VIEW + x.견적코드 : QUOTE_APP, '_blank');
        };
        body.appendChild(row);
      });
      wrap.appendChild(body);
    }

    QuoteRequests.render = render;
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = QuoteRequests;
  else root.QuoteRequests = QuoteRequests;
})(typeof window !== 'undefined' ? window : this);
