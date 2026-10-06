/* 관리자 암호 잠금 — 사장님 전용 앱(현장견적·일정 앱)에 다는 공용 파일. 같은 내용을 두 저장소에 복사해서 쓴다.
   관리자 앱(admin.js)·정산견적(settle.js)에도 같은 해시가 들어 있다 — 암호를 바꾸면 그 두 곳과 이 파일 둘을 같이 고친다.
   사용법: <head> 맨 위에 <script src="/pin-lock.js" data-key="열림표시 이름"></script>
   data-key 는 같은 주소(origin)의 다른 앱과 맞추면 한 번 열면 같이 열린다
     - songil.netlify.app 쪽: settleUnlocked (정산견적과 같이 열림)
     - jayunsu22.github.io 쪽: adminUnlocked (관리자 앱과 같이 열림)
   열려 있다는 표시는 해시 앞 16자라서 암호를 바꾸면 이미 열린 기기가 한 번 잠긴다.
   이 잠금은 화면을 가리는 용도다(암호 비교가 브라우저에서 이뤄진다). 그래서 암호는 길게 쓴다. */
(function () {
  var HASH = '96cae35ce8a9b0244178bf28e4966c2ce1b8385723a96a6b838858cdd6ca0a1e';
  var cs = document.currentScript;
  var KEY = (cs && cs.getAttribute('data-key')) || 'appPinUnlocked';
  var VALUE = HASH.slice(0, 16);

  try { if (localStorage.getItem(KEY) === VALUE) return; } catch (e) { /* 저장소를 못 읽으면 잠금을 건다 */ }

  var root = document.documentElement;
  var prevOverflow = root.style.overflow;
  root.style.overflow = 'hidden';

  var style = document.createElement('style');
  style.textContent =
    '#pinGate{position:fixed;inset:0;z-index:2147483647;background:#f8fafc;display:flex;align-items:center;justify-content:center;' +
    'padding:20px;font-family:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Malgun Gothic",sans-serif}' +
    '#pinGate form{width:100%;max-width:340px;background:#fff;border-radius:18px;padding:26px 22px;text-align:center;' +
    'box-shadow:0 8px 30px rgba(15,23,42,.15)}' +
    '#pinGate .ic{font-size:34px;line-height:1}#pinGate h2{margin:10px 0 6px;font-size:19px;color:#0f172a}' +
    '#pinGate p{margin:0 0 14px;font-size:14px;color:#64748b}' +
    '#pinGate input{width:100%;box-sizing:border-box;padding:13px;font-size:17px;text-align:center;border:1.5px solid #e2e8f0;' +
    'border-radius:10px;outline:none}#pinGate input:focus{border-color:#1f2a44}' +
    '#pinGate .ver{margin:12px 0 0;font-size:11px;color:#94a3b8}' +
    '#pinGate button{width:100%;margin-top:10px;padding:13px;border:0;border-radius:10px;background:#1f2a44;color:#fff;' +
    'font-size:16px;font-weight:800}#pinGate .err{margin:10px 0 0;color:#dc2626;font-size:13.5px}';

  var gate = document.createElement('div');
  gate.id = 'pinGate';
  gate.innerHTML =
    '<form autocomplete="off"><div class="ic">🔒</div><h2>관리자 암호</h2><p>계속하려면 암호를 입력하세요.</p>' +
    '<input type="password" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="암호 입력"><button type="submit">확인</button>' +
    '<p class="err" hidden>암호가 올바르지 않습니다.</p><p class="ver">화면 버전 20261006c</p></form>';
  root.appendChild(style);
  root.appendChild(gate);

  var form = gate.querySelector('form'), input = gate.querySelector('input'), err = gate.querySelector('.err');
  setTimeout(function () { input.focus(); }, 50);

  function sha256Hex(text) {
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)).then(function (buf) {
      return Array.prototype.map.call(new Uint8Array(buf), function (b) { return b.toString(16).padStart(2, '0'); }).join('');
    });
  }

  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    if (!(window.crypto && crypto.subtle)) { err.textContent = '보안 연결(https)에서만 열 수 있습니다.'; err.hidden = false; return; }
    sha256Hex(input.value.trim()).then(function (h) {
      if (h === HASH) {
        try { localStorage.setItem(KEY, VALUE); } catch (e) { /* 저장 못 해도 이번엔 열어 준다 */ }
        gate.remove(); style.remove();
        root.style.overflow = prevOverflow;
      } else {
        err.textContent = '암호가 올바르지 않습니다.'; err.hidden = false;
        input.value = ''; input.focus();
      }
    });
  });
})();
