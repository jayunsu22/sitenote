/* 날짜입력 버튼 (2026-10-27 사장님) — 글 적는 칸(textarea)마다 아래에 '📅 날짜입력' 버튼.
   누르면 커서 자리에 '26/10/28 오전 8시' 를 넣고 input 이벤트를 쏴서 원래 저장 코드가 그대로 돈다.
   나중에 그려지는 칸(시트·모달)도 MutationObserver 로 붙인다. 읽기 전용 칸(복사창)은 건너뜀. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Stamp = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  // 26/10/28 오전 8시 · 12시는 오후 12시, 0시는 오전 12시
  function stampText(d) {
    d = d || new Date();
    var h = d.getHours();
    var h12 = h % 12 === 0 ? 12 : h % 12;
    return pad(d.getFullYear() % 100) + '/' + pad(d.getMonth() + 1) + '/' + pad(d.getDate()) + ' ' + (h < 12 ? '오전' : '오후') + ' ' + h12 + '시';
  }
  function insert(ta) {
    var t = stampText();
    var v = ta.value;
    var a = typeof ta.selectionStart === 'number' && document.activeElement === ta ? ta.selectionStart : v.length;
    var b = typeof ta.selectionEnd === 'number' && document.activeElement === ta ? ta.selectionEnd : v.length;
    var before = v.slice(0, a), after = v.slice(b);
    // 앞 글과 붙지 않게: 줄 중간이면 띄어쓰기, 뒤에 공백 하나
    if (before && !/\s$/.test(before)) t = (a === v.length ? '\n' : ' ') + t;
    t += ' ';
    ta.value = before + t + after;
    var pos = before.length + t.length;
    ta.focus();
    try { ta.setSelectionRange(pos, pos); } catch (e) { /* 일부 브라우저 */ }
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function attach(ta) {
    if (ta.readOnly || ta.disabled || ta.dataset.noStamp != null || ta._stampBtn) return;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'stamp-btn';
    btn.textContent = '📅 날짜입력';
    btn.title = '지금 날짜·시간 넣기';
    // 누를 때 칸의 커서 자리를 잃지 않게
    btn.addEventListener('mousedown', function (e) { e.preventDefault(); });
    btn.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); insert(ta); });
    ta._stampBtn = btn;
    ta.insertAdjacentElement('afterend', btn);
  }
  function scan(rootEl) {
    if (!rootEl || !rootEl.querySelectorAll) return;
    if (rootEl.tagName === 'TEXTAREA') attach(rootEl);
    rootEl.querySelectorAll('textarea').forEach(attach);
  }
  function start() {
    scan(document.body);
    new MutationObserver(function (muts) {
      muts.forEach(function (m) {
        m.addedNodes.forEach(function (n) { if (n.nodeType === 1) scan(n); });
        // 칸이 지워지면 버튼도 같이 정리 (innerHTML 다시 그릴 때는 둘 다 사라짐)
        m.removedNodes.forEach(function (n) {
          if (n.nodeType === 1 && n.tagName === 'TEXTAREA' && n._stampBtn && n._stampBtn.parentNode) n._stampBtn.remove();
        });
      });
    }).observe(document.body, { childList: true, subtree: true });
  }
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
  }
  return { stampText: stampText };
});
