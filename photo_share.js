/* 📷 시공사진 공유 (2026-11-19 사장님: 혼자 하는 현장은 업무분담 없이 시공사진만 업체에 보내고 싶다)
   현장 머리의 [📷 시공사진] → 구역을 고르고 찍으면 바로 서버(n8n photo-share-upload → 에어테이블 공유사진 표)에 올라간다.
   업체에는 songil.netlify.app/t/<코드> 링크만 보낸다 (금액·견적 없음, 구역별 사진만).
   코드는 현장마다 하나 (site.photoShare). 올리기·지우기는 사장님 열쇠(owner-key.js), 보기는 누구나. */
(function (root) {
  var BASE = 'https://primary-production-a6fa.up.railway.app/webhook/';
  var VIEW = 'https://songil.netlify.app/t/';
  var 구역들 = ['거실', '주방', '현관', '방1', '방2', '방3', '방4', '방5', '화장실', '베란다', '기타'];
  var deps = null, site = null, 지금구역 = '거실', 사진 = [], 올리는중 = 0, 남은 = 0;

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function $(id) { return document.getElementById(id); }
  function 새코드() { var a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', s = ''; for (var i = 0; i < 10; i++) s += a[Math.floor(Math.random() * a.length)]; return s; }
  function b64u(t) { var bytes = new TextEncoder().encode(t), bin = ''; bytes.forEach(function (b) { bin += String.fromCharCode(b); }); return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function 이름() { return (deps && deps.title ? deps.title(site) : site.name) || ''; }
  function 링크() { return VIEW + site.photoShare + '?n=' + b64u(이름().slice(0, 60)); }
  function 코드() {
    if (!site.photoShare) { site.photoShare = 새코드(); deps.update(site.id, { photoShare: site.photoShare }); }
    return site.photoShare;
  }

  // 큰 사진은 긴 변 1600px JPEG 로 줄여 올린다 (에어테이블 한 장 5MB 제한 · 업체 폰에서 빨리 뜨게)
  function 줄이기(file) {
    return new Promise(function (ok, no) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        var M = 1600, w = img.naturalWidth, h = img.naturalHeight, r = Math.min(1, M / Math.max(w, h));
        var c = document.createElement('canvas'); c.width = Math.round(w * r); c.height = Math.round(h * r);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        ok(c.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = function () { URL.revokeObjectURL(url); no(new Error('사진을 읽지 못했습니다')); };
      img.src = url;
    });
  }

  function 받기() {
    return fetch(BASE + 'photo-share?code=' + encodeURIComponent(코드()) + '&_t=' + Date.now())
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (d) { 사진 = (d && d.사진) || []; 그리기(); })
      .catch(function () { $('psList').innerHTML = '<p class="ps-msg">사진 목록을 못 받았습니다 — 잠시 뒤 다시 열어 주세요</p>'; });
  }

  function 올리기(files) {
    files = Array.prototype.slice.call(files || []);
    if (!files.length) return;
    var 구역 = 지금구역, i = 0, 실패 = 0;
    남은 += files.length; 그리기();
    function 다음() {
      if (i >= files.length) { if (실패) deps.toast(실패 + '장은 못 올렸습니다 — 인터넷 확인 후 다시 찍어 주세요'); else deps.toast(구역 + ' 사진 ' + files.length + '장 올렸습니다'); return 받기(); }
      var f = files[i++];
      올리는중++;
      return 줄이기(f).then(function (data) {
        return fetch(BASE + 'photo-share-upload', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 코드: 코드(), 현장명: 이름(), 구역: 구역, 순서: Date.now(), 파일명: 구역 + '_' + Date.now() + '.jpg', 이미지: data }),
        });
      }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); })
        .catch(function () { 실패++; })
        .then(function () { 올리는중--; 남은--; 그리기(); return 다음(); });
    }
    return 다음();
  }

  function 지우기(p) {
    if (!confirm(p.구역 + ' 사진을 지울까요?\n업체가 보는 링크에서도 사라집니다.')) return;
    fetch(BASE + 'photo-share-delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: p.id }) })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); 사진 = 사진.filter(function (x) { return x.id !== p.id; }); 그리기(); deps.toast('지웠습니다'); })
      .catch(function () { deps.toast('지우지 못했습니다'); });
  }

  function 그리기() {
    var box = $('psSheet'); if (!box) return;
    var 묶음 = {};
    사진.forEach(function (p) { (묶음[p.구역] = 묶음[p.구역] || []).push(p); });
    var 이름들 = 구역들.slice();
    Object.keys(묶음).forEach(function (z) { if (이름들.indexOf(z) < 0) 이름들.splice(이름들.length - 1, 0, z); });
    if (이름들.indexOf(지금구역) < 0) 이름들.splice(이름들.length - 1, 0, 지금구역);
    $('psZones').innerHTML = 이름들.map(function (z) {
      var n = (묶음[z] || []).length;
      return '<button type="button" data-z="' + esc(z) + '" class="' + (z === 지금구역 ? 'on' : '') + '">' + esc(z) + (n ? ' <b>' + n + '</b>' : '') + '</button>';
    }).join('') + '<button type="button" data-z="+" class="add">＋ 직접</button>';
    Array.prototype.forEach.call($('psZones').querySelectorAll('button'), function (b) {
      b.onclick = function () {
        if (b.dataset.z === '+') { var v = (prompt('구역 이름 (예: 드레스룸, 2층 거실)', '') || '').trim().slice(0, 20); if (!v) return; 지금구역 = v; }
        else 지금구역 = b.dataset.z;
        그리기();
      };
    });
    $('psNow').innerHTML = '<b>' + esc(지금구역) + '</b> 에 넣습니다' + (남은 ? ' · <span class="ps-up">⏫ 올리는 중 ' + 남은 + '장</span>' : '');
    var 순 = 이름들.filter(function (z) { return (묶음[z] || []).length; });
    $('psList').innerHTML = 순.length ? 순.map(function (z) {
      return '<div class="ps-z"><h4>' + esc(z) + ' <small>' + 묶음[z].length + '장</small></h4><div class="ps-grid">' +
        묶음[z].map(function (p) { return '<button type="button" data-id="' + esc(p.id) + '" style="background-image:url(\'' + esc(p.작은 || p.url) + '\')" aria-label="' + esc(z) + ' 사진 지우기"></button>'; }).join('') + '</div></div>';
    }).join('') + '<p class="ps-hint">사진을 누르면 지울 수 있어요</p>' : '<p class="ps-msg">아직 사진이 없어요 — 위에서 구역을 고르고 [📸 찍기]</p>';
    Array.prototype.forEach.call($('psList').querySelectorAll('.ps-grid button'), function (b) {
      b.onclick = function () { var p = 사진.filter(function (x) { return x.id === b.dataset.id; })[0]; if (p) 지우기(p); };
    });
    $('psCount').textContent = 사진.length ? '사진 ' + 사진.length + '장' : '';
  }

  function 열기(s, d) {
    site = s; deps = d; 사진 = []; 남은 = 0;
    var el = $('psSheet');
    if (!el) {
      el = document.createElement('section'); el.id = 'psSheet'; el.setAttribute('aria-label', '시공사진');
      el.innerHTML =
        '<div class="ps-head"><b>📷 시공사진</b><span id="psCount"></span><button type="button" id="psClose">닫기</button></div>' +
        '<div class="ps-site" id="psSite"></div>' +
        '<div class="ps-zones" id="psZones"></div>' +
        '<p class="ps-now" id="psNow"></p>' +
        '<div class="ps-shoot"><button type="button" id="psCam" class="primary">📸 찍기</button><button type="button" id="psAlbum">🖼 앨범</button></div>' +
        '<input type="file" id="psCamIn" accept="image/*" capture="environment" hidden><input type="file" id="psAlbumIn" accept="image/*" multiple hidden>' +
        '<div class="ps-list" id="psList"><p class="ps-msg">불러오는 중…</p></div>' +
        '<div class="ps-share"><button type="button" id="psCopy">🔗 링크 복사</button><button type="button" id="psSend" class="primary">카톡으로 보내기</button></div>';
      document.body.appendChild(el);
      $('psClose').onclick = 닫기;
      $('psCam').onclick = function () { $('psCamIn').value = ''; $('psCamIn').click(); };
      $('psAlbum').onclick = function () { $('psAlbumIn').value = ''; $('psAlbumIn').click(); };
      $('psCamIn').onchange = function () { 올리기($('psCamIn').files); };
      $('psAlbumIn').onchange = function () { 올리기($('psAlbumIn').files); };
      $('psCopy').onclick = function () {
        if (!사진.length && !confirm('아직 사진이 없어요. 그래도 링크를 복사할까요?')) return;
        var u = 링크();
        (navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).then(function () { deps.toast('링크를 복사했습니다 — 카톡에 붙여넣으세요'); }, function () { prompt('이 링크를 복사하세요', u); });
      };
      $('psSend').onclick = function () {
        if (!사진.length && !confirm('아직 사진이 없어요. 그래도 보낼까요?')) return;
        var u = 링크();
        if (navigator.share) navigator.share({ title: 이름() + ' 시공사진', text: 이름() + ' 시공사진입니다', url: u }).catch(function () {});
        else $('psCopy').onclick();
      };
    }
    $('psSite').textContent = 이름();
    el.hidden = false;
    document.body.classList.add('ps-open');
    코드();
    그리기();
    받기();
  }
  function 닫기() {
    if (남은 && !confirm('아직 올리는 중인 사진이 ' + 남은 + '장 있어요. 닫을까요? (올리기는 계속됩니다)')) return;
    var el = $('psSheet'); if (el) el.hidden = true;
    document.body.classList.remove('ps-open');
  }
  root.PhotoShare = { 열기: 열기, 닫기: 닫기 };
})(typeof window !== 'undefined' ? window : this);
