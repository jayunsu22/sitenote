/* 🎤 음성 입력 (2026-11-04 사장님: 모든 입력을 음성으로) — 글 적는 칸(input·textarea)을 누르면 자판 바로 위 오른쪽에 🎤.
   누르고 말하면 커서 자리에 글이 들어가고, input·change 이벤트를 쏴서 원래 저장 코드가 그대로 돈다 (날짜입력 버튼과 같은 방법).
   크롬 음성인식(한국어). 말하는 동안 들은 글을 위에 보여 주고, 잠깐 쉬면 다시 듣고, 두 번 연속 조용하면 멈춘다. 다시 누르면 멈춤.
   숫자 칸(전화·금액·숫자)은 '공일공 일이삼사' 같은 말도 숫자로 바꿔 넣는다 (숫자만 받는 칸은 말한 숫자로 바꿈). 나중에 그려지는 칸(시트·모달)도 저절로.
   빼는 칸: 읽기 전용·잠김·체크·날짜·파일 등 글이 아닌 칸, data-no-voice (🤖 비서 입력칸은 자기 🎤 가 있다). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Voice = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var TEXT_TYPES = ['', 'text', 'search', 'tel', 'number', 'email', 'url'];
  var NUM = { '영': '0', '공': '0', '빵': '0', '일': '1', '하나': '1', '이': '2', '둘': '2', '삼': '3', '셋': '3', '사': '4', '넷': '4', '오': '5', '육': '6', '륙': '6', '칠': '7', '팔': '8', '구': '9' };

  // 음성을 받을 칸인가
  function voiceable(el) {
    if (!el || el.nodeType !== 1 || el.disabled || el.readOnly) return false;
    if (el.closest && el.closest('[data-no-voice]')) return false;
    if (el.tagName === 'TEXTAREA') return true;
    if (el.tagName !== 'INPUT') return false;
    return TEXT_TYPES.indexOf(String(el.getAttribute('type') || '').toLowerCase()) !== -1;
  }
  function numericField(el) {
    var t = String(el.getAttribute('type') || '').toLowerCase();
    var m = String(el.getAttribute('inputmode') || '').toLowerCase();
    return t === 'tel' || t === 'number' || m === 'numeric' || m === 'decimal' || m === 'tel';
  }
  // 숫자 칸: '공일공 일이삼사 오육칠팔' → 01012345678, '3만 5천' → 35000, '12만원' → 120000
  function toDigits(text, keepDash) {
    var t = String(text || '').replace(/\s+/g, '');
    var units = /^([0-9.]+)(억|만|천)?(?:([0-9.]+)?(천))?(?:([0-9]+))?원?$/.exec(t);
    if (units && (units[2] || units[4])) {
      var v = parseFloat(units[1]) * ({ 억: 1e8, 만: 1e4, 천: 1e3 }[units[2]] || 1);
      if (units[4]) v += parseFloat(units[3] || '1') * 1e3;
      if (units[5]) v += parseFloat(units[5]);
      return String(Math.round(v));
    }
    var out = '';
    for (var i = 0; i < t.length; i++) {
      var two = t.slice(i, i + 2);
      if (NUM[two]) { out += NUM[two]; i++; continue; }
      var c = t[i];
      if (/[0-9]/.test(c)) out += c;
      else if (NUM[c]) out += NUM[c];
      else if (c === '.' && !keepDash) out += c;
      else if ((c === '-' || c === '+') && keepDash) out += c;
    }
    return out;
  }
  // 커서 자리에 넣기 — 앞 글과 붙지 않게 띄어쓰기 (숫자 칸은 붙여서)
  function insertText(el, text) {
    if (!text) return;
    var num = numericField(el);
    if (num) text = toDigits(text, String(el.getAttribute('type') || '').toLowerCase() === 'tel');
    if (!text) return;
    // 숫자만 받는 칸(일수·개수 등)은 말한 숫자로 바꾼다 — '3' 칸에 '5' 라고 하면 35 가 아니라 5
    if (String(el.getAttribute('type') || '').toLowerCase() === 'number') {
      el.value = text;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
    var v = el.value || '';
    var a = v.length, b = v.length;
    try { if (typeof el.selectionStart === 'number') { a = el.selectionStart; b = el.selectionEnd; } } catch (e) { /* number 칸은 커서를 못 읽는다 */ }
    var before = v.slice(0, a), after = v.slice(b);
    if (!num && before && !/\s$/.test(before)) text = ' ' + text;
    el.value = before + text + after;
    var pos = before.length + text.length;
    try { el.setSelectionRange(pos, pos); } catch (e) { /* number 칸 */ }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  var btn = null, bubble = null, target = null, rec = null, want = false, quiet = 0, hideT = 0;
  function SR() { return typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition); }
  function say(msg) { if (typeof window !== 'undefined' && window.toast) window.toast(msg); else if (bubble) { bubble.textContent = msg; bubble.hidden = false; } }
  function place() {
    if (!btn || btn.hidden) return;
    var vv = window.visualViewport;
    var bottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
    var right = vv ? vv.offsetLeft + vv.width : window.innerWidth;
    btn.style.top = Math.max(8, bottom - 68) + 'px';
    btn.style.left = Math.max(8, right - 68) + 'px';
    if (bubble && !bubble.hidden) { bubble.style.top = Math.max(8, bottom - 120) + 'px'; bubble.style.left = '12px'; bubble.style.right = '12px'; }
  }
  function show(el) {
    clearTimeout(hideT);
    target = el;
    btn.hidden = false;
    place();
  }
  function hideSoon() {
    clearTimeout(hideT);
    hideT = setTimeout(function () {
      if (rec) return;   // 듣는 중이면 그대로
      var a = document.activeElement;
      if (voiceable(a)) { show(a); return; }
      btn.hidden = true;
      target = null;
    }, 250);
  }
  function setOn(on) {
    btn.classList.toggle('on', on);
    btn.textContent = on ? '⏹' : '🎤';
    btn.setAttribute('aria-label', on ? '음성 입력 멈춤' : '말로 입력');
    if (!on && bubble) bubble.hidden = true;
  }
  function listen() {
    var R = SR();
    var r = new R();
    rec = r;
    r.lang = 'ko-KR';
    r.interimResults = true;
    r.continuous = false;
    var heard = false;
    r.onresult = function (e) {
      var fin = '', mid = '';
      for (var i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) fin += e.results[i][0].transcript;
        else mid += e.results[i][0].transcript;
      }
      if (mid && bubble) { bubble.textContent = '🎤 ' + mid; bubble.hidden = false; place(); }
      if (fin && target) { heard = true; quiet = 0; insertText(target, fin.trim()); if (bubble) bubble.hidden = true; }
    };
    r.onerror = function (e) {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { want = false; say('마이크 권한을 허용해 주세요 (주소창 왼쪽 자물쇠 › 권한)'); }
      else if (e.error !== 'no-speech' && e.error !== 'aborted') { want = false; say('음성인식이 안 됐어요 (' + e.error + ')'); }
    };
    r.onend = function () {
      rec = null;
      if (!heard) quiet++;
      if (want && quiet < 2 && target && document.contains(target)) { try { listen(); return; } catch (e) { /* 아래에서 멈춤 */ } }
      want = false;
      setOn(false);
      if (target && document.contains(target)) { try { target.focus(); } catch (e) { /* 그대로 */ } }
    };
    r.start();
  }
  function toggle() {
    if (rec) { want = false; rec.stop(); return; }
    if (!SR()) { say('이 브라우저는 음성인식이 안 돼요 — 크롬에서 열어 주세요'); return; }
    if (!target) return;
    want = true;
    quiet = 0;
    setOn(true);
    if (bubble) { bubble.textContent = '🎤 말씀하세요… (다시 누르면 멈춤)'; bubble.hidden = false; place(); }
    try { listen(); } catch (e) { rec = null; want = false; setOn(false); say('음성인식을 시작하지 못했어요'); }
  }
  function start() {
    if (typeof document === 'undefined' || !SR() || btn) return;
    btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'voice-btn';
    btn.hidden = true;
    btn.setAttribute('data-no-voice', '');
    // 누를 때 칸의 포커스·자판을 잃지 않게
    btn.addEventListener('mousedown', function (e) { e.preventDefault(); });
    btn.addEventListener('touchstart', function (e) { e.preventDefault(); toggle(); }, { passive: false });
    btn.addEventListener('click', function (e) { e.preventDefault(); toggle(); });
    bubble = document.createElement('div');
    bubble.className = 'voice-bubble';
    bubble.hidden = true;
    setOn(false);
    document.body.appendChild(bubble);
    document.body.appendChild(btn);
    document.addEventListener('focusin', function (e) { if (voiceable(e.target)) show(e.target); else if (!rec) hideSoon(); });
    document.addEventListener('focusout', function () { hideSoon(); });
    if (window.visualViewport) { window.visualViewport.addEventListener('resize', place); window.visualViewport.addEventListener('scroll', place); }
    window.addEventListener('resize', place);
  }
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
  }
  return { voiceable: voiceable, toDigits: toDigits, insertText: insertText, start: start };
});
