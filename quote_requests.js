/* 견적요청 내역 (2026-10-17) — 거래처 화면의 '견적요청 내역' 칸.
   카톡으로 온 견적요청은 방문견적(songil.netlify.app/quote_pro.html)에서 받아 적고 발행한다.
   이 앱은 그 결과를 같은 백업키로 읽어 보여주기만 한다 (고치기·지우기는 방문견적에서).
     - 저장함 건 중 요청.거래처ID 가 이 거래처인 것 → 답장 전 / 작성 중 / 발행
     - 발행목록 중 현장관리_거래처ID 가 이 거래처인 것 → 발행 (저장함에서 지웠어도 남는다)
     - 손으로 이어 붙인 견적서(거래처.quoteCodes) → 발행 (2026-10-18)
   [＋ 견적요청 작성하기] 는 방문견적을 ?req=1&client=<거래처ID> 로 연다.
   [🔗 기존견적서 연결하기] 는 이 앱을 거치지 않고 발행한 견적서를 거래처에 이어 붙인다 —
   견적코드(또는 /q/코드 주소)를 거래처 기록에만 적어 두므로 방문견적 쪽은 건드리지 않는다.
   줄 오른쪽 ✕ 는 그 줄을 이 목록에서만 숨긴다(2026-10-20, 거래처.hiddenQuotes). 다시 발행하며 쌓인
   옛 견적서를 치우려는 것이라 서버 기록과 견적서 링크는 그대로 둔다 - 고객에게 보낸 링크가 죽으면 안 된다.
   줄 아래 [이 견적 보기] [이 견적 수정하기] (2026-10-21). 수정은 방문견적을 ?edit=<키>&client=<거래처ID> 로 연다.
   고쳐서 다시 발행하면 방문견적이 앞 견적코드를 이전견적코드로 남기고, 이 목록은 그 앞 견적서를 뺀다.
   순수 계산(요청내역·답장전수)은 node 테스트: test/quote_requests.test.js */
(function (root) {
  'use strict';

  var 순위 = { '답장 전': 0, '작성 중': 1, '발행': 2 };

  function 요약글(원문) {
    var 줄 = String(원문 || '').split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean);
    return 줄.slice(0, 3).join(' · ');
  }

  // 견적코드만 뽑아낸다 — 'ABC123', 'https://songil.netlify.app/q/ABC123', '/q/ABC123' 다 받는다
  function 코드뽑기(값) {
    var v = String(값 == null ? '' : 값).trim();
    if (!v) return '';
    var m = /\/q\/([A-Za-z0-9_-]+)/.exec(v);
    if (m) return m[1];
    return /^[A-Za-z0-9_-]+$/.test(v) ? v : '';
  }
  function 코드목록(값) {
    var out = [], 본 = {};
    (Array.isArray(값) ? 값 : []).forEach(function (v) {
      var c = 코드뽑기(v);
      if (c && !본[c]) { 본[c] = true; out.push(c); }
    });
    return out;
  }

  // 연결: 손으로 이어 붙인 견적코드 목록 (거래처.quoteCodes). 발행목록에 그 코드가 있으면 내용까지,
  // 아직 못 받았거나 지워졌으면 코드만 한 줄로 남긴다 — 눌러서 견적서를 열 수 있어야 하기 때문
  // 숨김: 이 목록에서 숨긴 줄의 키(견적코드 또는 'box:<저장함 id>') 목록
  function 요청내역(박스항목, 발행, 거래처ID, 연결, 숨김) {
    var 발행맵 = {};
    (발행 || []).forEach(function (p) { if (p && p.견적코드) 발행맵[p.견적코드] = p; });
    var 연결맵 = {};
    코드목록(연결).forEach(function (c) { 연결맵[c] = true; });
    var 쓴코드 = {};
    // 고쳐서 다시 발행해 밀려난 견적코드 (방문견적이 저장함 항목에 이전견적코드로 남긴다)
    var 밀려난 = {};
    (박스항목 || []).forEach(function (it) {
      var 앞 = it && (it.이전견적코드 || (it.상태 && it.상태.이전견적코드));
      if (Array.isArray(앞)) 앞.forEach(function (c) { if (c && c !== it.현장코드) 밀려난[c] = true; });
    });
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
        키: 코드 || 'box:' + it.id,
      });
    });
    (발행 || []).forEach(function (p) {
      if (!p || !p.견적코드 || 쓴코드[p.견적코드] || 밀려난[p.견적코드]) return;
      var 내것 = p.현장관리_거래처ID === 거래처ID, 이은것 = !!연결맵[p.견적코드];
      if (!내것 && !이은것) return;
      쓴코드[p.견적코드] = true;
      out.push({ 상태: '발행', 이름: p.현장명 || '', 요약: '', 날짜: p.발행일시 || '', 금액: p.총액 || 0,
                 견적코드: p.견적코드, 키: p.견적코드, 연결: 이은것 && !내것 });
    });
    // 발행목록에 없는 연결 코드 (아직 못 받았거나 방문견적에서 지운 건) — 코드만이라도 남긴다
    코드목록(연결).forEach(function (c) {
      if (쓴코드[c] || 밀려난[c]) return;
      쓴코드[c] = true;
      out.push({ 상태: '발행', 이름: '(연결한 견적서)', 요약: '', 날짜: '', 금액: 0, 견적코드: c, 키: c, 연결: true });
    });
    var 숨긴 = {};
    (숨김 || []).forEach(function (k) { 숨긴[String(k)] = true; });
    out = out.filter(function (x) { return !숨긴[x.키]; });
    out.sort(function (a, b) {
      return (순위[a.상태] - 순위[b.상태]) || String(b.날짜).localeCompare(String(a.날짜));
    });
    return out;
  }

  function 답장전수(목록) {
    return (목록 || []).filter(function (x) { return x.상태 === '답장 전'; }).length;
  }

  var QuoteRequests = { 요청내역: 요청내역, 답장전수: 답장전수, 코드뽑기: 코드뽑기, 코드목록: 코드목록 };

  /* ---------- 화면 (브라우저에서만) ---------- */
  if (typeof document !== 'undefined') {
    var RESTORE = 'https://primary-production-a6fa.up.railway.app/webhook/pro-box-restore';
    var QUOTE_APP = 'https://songil.netlify.app/quote_pro.html';
    var VIEW = 'https://songil.netlify.app/q/';
    var 새로받기_MS = 2 * 60 * 1000;
    var 열림 = false;
    var 연결열림 = false;   // [🔗 기존견적서 연결하기] 패널
    var 받은 = null;     // { 시각, items, published }
    var 받는중 = null;
    var 오류 = '';

    // 방문견적(quote_pro.js 링크()) 과 같은 주소: /q/코드?d=1&n=제목(base64url)
    function 보낼링크(x) {
      var 링크 = VIEW + x.견적코드 + '?d=1';
      if (x.이름 && !x.연결) {
        var bin = '';
        new TextEncoder().encode(x.이름).forEach(function (b) { bin += String.fromCharCode(b); });
        링크 += '&n=' + btoa(bin).split('+').join('-').split('/').join('_').split('=').join('');
      }
      return 링크;
    }
    // 복사되면 버튼 글이 잠깐 '복사됨' 으로. 막히면 주소를 보여 줘서 길게 눌러 복사
    function 링크복사(btn, 링크) {
      var 됨 = function () {
        btn.textContent = '✅ 복사됨';
        setTimeout(function () { btn.textContent = '🔗 링크 복사'; }, 1800);
      };
      var 안됨 = function () { window.prompt('길게 눌러 복사하세요', 링크); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(링크).then(됨, 안됨);
      else 안됨();
    }

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
    // 손으로 이어 붙인 견적코드는 이 앱의 거래처 기록(quoteCodes)에만 적는다 — 방문견적 쪽은 안 건드린다
    function 연결읽기(clientId) {
      var c = root.Store && root.Store.getClient && root.Store.getClient(clientId);
      return 코드목록(c && c.quoteCodes);
    }
    function 연결쓰기(clientId, 코드들) {
      if (root.Store && root.Store.updateClient) root.Store.updateClient(clientId, { quoteCodes: 코드목록(코드들) });
    }
    function 숨김읽기(clientId) {
      var c = root.Store && root.Store.getClient && root.Store.getClient(clientId);
      return (c && Array.isArray(c.hiddenQuotes)) ? c.hiddenQuotes.slice() : [];
    }
    // ✕ : 이 목록에서만 숨긴다. 손으로 이어 붙인 견적서도 연결은 그대로 둔다 - [되돌리기] 로 그대로 돌아와야 한다
    function 숨기기(clientId, x) {
      var 이름 = x.이름 || '(이름 없음)';
      if (!confirm('‘' + 이름 + '’' + (x.견적코드 ? ' (/q/' + x.견적코드 + ')' : '') + ' 을(를) 견적요청 내역에서 지울까요?\n\n' +
        '이 목록에서만 사라집니다. 고객에게 보낸 견적서 링크는 그대로 열립니다.')) return false;
      var h = 숨김읽기(clientId);
      if (h.indexOf(x.키) < 0) h.push(x.키);
      if (root.Store && root.Store.updateClient) root.Store.updateClient(clientId, { hiddenQuotes: h });
      return true;
    }
    function 연결토글(clientId, code) {
      var cur = 연결읽기(clientId);
      var i = cur.indexOf(code);
      if (i >= 0) cur.splice(i, 1); else cur.push(code);
      연결쓰기(clientId, cur);
    }

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

    /* [🔗 기존견적서 연결하기] 패널 (2026-10-18)
       - 위: 견적코드나 /q/… 주소를 붙여넣어 바로 연결 (아직 안 받아온 견적서도 이어 붙는다)
       - 아래: 받아 온 발행 견적서 목록. 다른 거래처 것이거나 거래처가 안 적힌 것만 고를 수 있고,
               이미 이어 붙인 건 [해제] 로 뗀다 */
    function 연결패널(wrap, clientId, 이은코드) {
      var box = el('div', 'qreq-linkbox');
      var 이은맵 = {};
      이은코드.forEach(function (c) { 이은맵[c] = true; });

      var 줄 = el('div', 'qreq-linkrow');
      var inp = document.createElement('input');
      inp.type = 'text'; inp.placeholder = '견적코드 또는 /q/… 주소 붙여넣기'; inp.autocomplete = 'off';
      var go = el('button', 'btn-sm primary', '연결');
      var 알림 = el('p', 'sheet-hint qreq-linkmsg', '');
      var 붙이기 = function () {
        var code = 코드뽑기(inp.value);
        if (!code) { 알림.textContent = '견적코드를 알아보지 못했어요 — 코드나 /q/… 주소를 넣어 주세요'; return; }
        if (이은맵[code]) { 알림.textContent = '이미 연결된 견적서예요'; return; }
        연결토글(clientId, code);
        inp.value = '';
        render(wrap, clientId);
      };
      go.onclick = 붙이기;
      inp.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); 붙이기(); }
      });
      줄.appendChild(inp); 줄.appendChild(go);
      box.appendChild(줄); box.appendChild(알림);

      var 발행 = ((받은 && 받은.published) || []).filter(function (p) {
        return p && p.견적코드 && (이은맵[p.견적코드] || p.현장관리_거래처ID !== clientId);
      }).sort(function (a, b) { return String(b.발행일시 || '').localeCompare(String(a.발행일시 || '')); });

      if (!받은) box.appendChild(el('p', 'sheet-hint', '발행한 견적서를 불러오는 중…'));
      else if (!발행.length) box.appendChild(el('p', 'sheet-hint', '이을 수 있는 견적서가 없어요. 위 칸에 견적코드를 넣어 연결하세요.'));

      발행.slice(0, 40).forEach(function (p) {
        var 이음 = !!이은맵[p.견적코드];
        var r = el('div', 'qreq-pick' + (이음 ? ' on' : ''));
        var t = el('span', 'qreq-t');
        t.appendChild(el('b', '', p.현장명 || '(이름 없음)'));
        t.appendChild(el('span', 'qreq-m', 짧은날(p.발행일시) + (p.총액 ? ' · ' + 원(p.총액) : '') + ' · /q/' + p.견적코드 +
          (p.현장관리_거래처명 ? ' · ' + p.현장관리_거래처명 : '')));
        r.appendChild(t);
        var b = el('button', 'btn-sm' + (이음 ? ' btn-danger' : ' primary'), 이음 ? '해제' : '연결');
        b.onclick = function () { 연결토글(clientId, p.견적코드); render(wrap, clientId); };
        r.appendChild(b);
        box.appendChild(r);
      });
      return box;
    }

    function render(wrap, clientId) {
      wrap.innerHTML = '';
      if (!clientId) { wrap.hidden = true; return; }
      wrap.hidden = false;
      wrap.className = 'fixed-wrap qreq-wrap' + (열림 ? ' open' : '');
      var 이은코드 = 연결읽기(clientId);
      var 숨긴키 = 숨김읽기(clientId);
      var 목록 = 요청내역((받은 && 받은.items) || [], (받은 && 받은.published) || [], clientId, 이은코드, 숨긴키);
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
      // 이 앱을 거치지 않고 발행한 견적서를 이 거래처에 이어 붙인다 (2026-10-18)
      var link = el('button', 'btn-sm qreq-link' + (연결열림 ? ' on' : ''), (연결열림 ? '▾ ' : '🔗 ') + '기존견적서 연결하기');
      link.onclick = function () { 연결열림 = !연결열림; render(wrap, clientId); };
      body.appendChild(link);
      if (연결열림) body.appendChild(연결패널(wrap, clientId, 이은코드));
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
        // 줄(누르면 견적서) + 오른쪽 ✕(지우기). 버튼 안에 버튼을 못 넣어서 둘을 나란히 감싼다
        var item = el('div', 'qreq-item');
        var row = el('button', 'qreq-row');
        var cls = x.상태 === '답장 전' ? 'red' : x.상태 === '작성 중' ? 'amber' : 'green';
        row.appendChild(el('span', 'qreq-st ' + cls, x.상태));
        var t = el('span', 'qreq-t');
        var 제목 = el('b', '', x.이름 || '(이름 없음)');
        if (x.연결) 제목.appendChild(el('span', 'qreq-linked', '연결'));   // 이름 옆에 붙인다
        t.appendChild(제목);
        if (x.요약) t.appendChild(el('span', 'qreq-sum', x.요약));
        t.appendChild(el('span', 'qreq-m', 짧은날(x.날짜) + (x.금액 ? ' · ' + 원(x.금액) : '') + (x.견적코드 ? ' · /q/' + x.견적코드 : '')));
        row.appendChild(t);
        row.onclick = function () {
          // 발행한 건 견적서, 아직이면 방문견적(저장함에서 이어서)
          window.open(x.견적코드 ? VIEW + x.견적코드 : QUOTE_APP, '_blank');
        };
        item.appendChild(row);
        var del = el('button', 'qreq-del', '✕');
        del.setAttribute('aria-label', '견적 지우기');
        del.onclick = function () { if (숨기기(clientId, x)) render(wrap, clientId); };
        item.appendChild(del);
        // 줄 아래 버튼 (2026-10-21) - 줄을 눌러도 열리지만 그걸 잘 모른다
        var acts = el('div', 'qreq-acts');
        if (x.견적코드) {
          var see = el('button', 'qreq-act', '📄 이 견적 보기');
          see.onclick = function () { window.open(VIEW + x.견적코드, '_blank'); };
          acts.appendChild(see);
        }
        // [🔗 링크 복사] (2026-10-30) - 업체 카톡방·문자에 바로 붙여넣게. 보낸 견적과 같은 꼴로
        // (d=1 품목설명 켬, n= 제목 → 카톡 미리보기 카드 제목)
        if (x.견적코드) {
          var copy = el('button', 'qreq-act', '🔗 링크 복사');
          copy.onclick = function () { 링크복사(copy, 보낼링크(x)); };
          acts.appendChild(copy);
        }
        var edit = el('button', 'qreq-act primary', x.상태 === '발행' ? '✏️ 이 견적 수정하기' : '✏️ 이어서 작성하기');
        edit.onclick = function () {
          window.open(QUOTE_APP + '?edit=' + encodeURIComponent(x.키) + '&client=' + encodeURIComponent(clientId), '_blank');
        };
        acts.appendChild(edit);
        item.appendChild(acts);
        body.appendChild(item);
      });
      // 잘못 지웠을 때 되돌리는 길
      if (숨긴키.length) {
        var undo = el('button', 'qreq-undo', '숨긴 견적 ' + 숨긴키.length + '건 되돌리기');
        undo.onclick = function () {
          if (!confirm('숨긴 견적 ' + 숨긴키.length + '건을 다시 보이게 할까요?')) return;
          if (root.Store && root.Store.updateClient) root.Store.updateClient(clientId, { hiddenQuotes: [] });
          render(wrap, clientId);
        };
        body.appendChild(undo);
      }
      wrap.appendChild(body);
    }

    QuoteRequests.render = render;
    // 발행된 견적서 목록 — 현장 화면의 [📄 견적서 연결] 이 같은 자료를 쓴다 (받아 둔 게 있으면 그대로)
    QuoteRequests.발행목록 = function () {
      if (받은) return Promise.resolve(받은.published || []);
      return 받기().then(function () {
        if (오류 && !받은) throw new Error(오류);
        return (받은 && 받은.published) || [];
      });
    };
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = QuoteRequests;
  else root.QuoteRequests = QuoteRequests;
})(typeof window !== 'undefined' ? window : this);
