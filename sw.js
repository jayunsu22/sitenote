// sw.js — 앱 파일만 캐시 (네트워크 우선, 실패 시 캐시). n8n webhook 은 캐시하지 않음.
var CACHE = 'sitenote-v20261114d';
var FILES = ['./', './index.html', './assistant_face.jpg', './schedule.html', './order.html', './approve.html', './style.css?v=20261113m', './site-design.css?v=20261107b', './pin-lock.js?v=20261008a', './share.js?v=20261113m', './store.js?v=20261106a', './owner-key.js?v=20261104q', './adminlink.js?v=20261113c', './taskui.js?v=20261110c', './boss_chat.js?v=20261111d', './kakao.js?v=20261113m', './app.js?v=20261114d', './stamp.js?v=20261106a', './voice.js?v=20261104a', './quote_requests.js?v=20261030a', './quote_link.js?v=20261114c', './app-switcher.js?v=20261020a', './manifest.json', './manifest-order.json', './manifest-approve.json', './icon-192.png', './icon-512.png', './icon-schedule-192.png', './icon-schedule-512.png', './icon-assistant-192.png', './icon-assistant-512.png', './icon-approve-192.png', './icon-approve-512.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(FILES); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request).then(function (res) {
      var copy = res.clone();
      caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
      return res;
    }).catch(function () { return caches.match(e.request, { ignoreSearch: false }).then(function (r) { return r || caches.match('./index.html'); }); })
  );
});

/* 📝 업무비서 폰 알림 (2026-11-13 사장님: 텔레그램 = 업무보고, 업무비서 = 거래처 카톡·문자·일정) — n8n 카톡_알림 → 현장관리_빈칸 notify → Netlify send-push.
   글은 { title, body, url, tag, image, actions:[{action:'b0',title}], data:{ id, buttons:[{text,data}], text } }.
   알림마다 tag 가 달라 쌓이고, 사진이 있으면 크게. 버튼(앞 2개)은 앱을 안 열고 n8n kakao-press 로 — 결과는 같은 자리에 알림으로 */
var KAKAO_PRESS_URL = 'https://primary-production-a6fa.up.railway.app/webhook/kakao-press';
self.addEventListener('push', function (e) {
  var d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { title: '업무비서', body: e.data ? e.data.text() : '' }; }
  var opts = {
    body: d.body || '',
    icon: 'icon-assistant-192.png',
    badge: 'icon-assistant-192.png',
    tag: d.tag || 'assistant',
    renotify: true,
    data: { url: d.url || './index.html#order', n: d.data || null },
    actions: Array.isArray(d.actions) ? d.actions.slice(0, 2) : []
  };
  if (d.image) opts.image = d.image;
  e.waitUntil(self.registration.showNotification(d.title || '업무비서', opts));
});
function openApp(url) {
  return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (c.url.indexOf('/sitenote/') !== -1 && 'focus' in c) { c.navigate(url).catch(function () {}); return c.focus(); }
    }
    return self.clients.openWindow(url);
  });
}
function pressFromNotice(n, b, tag, url) {
  return caches.open('sitenote-owner').then(function (c) { return c.match('./owner-key'); }).then(function (r) { return r ? r.text() : ''; }).then(function (key) {
    if (!key) return openApp(url);   // 열쇠를 아직 못 받았으면 앱에서 누르게
    return fetch(KAKAO_PRESS_URL, { method: 'POST', headers: { 'content-type': 'application/json', 'x-owner-key': key }, body: JSON.stringify({ data: b.data, text: n.text || '' }) })
      .then(function (res) { if (!res.ok) throw new Error('HTTP ' + res.status); return res.json(); })
      .then(function (d) {
        var line = String(d.text || '').split('\n').filter(Boolean).pop() || '받았습니다';
        return self.registration.showNotification('「' + b.text + '」 ' + (d.ok === false ? '못 함' : '눌렀어요'), { body: line, icon: 'icon-assistant-192.png', badge: 'icon-assistant-192.png', tag: tag, data: { url: url } });
      })
      .catch(function () {
        return self.registration.showNotification('❌ 버튼을 못 보냈어요', { body: '앱을 열어 비서 화면에서 다시 눌러 주세요', icon: 'icon-assistant-192.png', tag: tag, data: { url: url } });
      });
  });
}
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var data = e.notification.data || {};
  var url = data.url || './index.html#order';
  var m = /^b(\d)$/.exec(e.action || '');
  var b = m && data.n && (data.n.buttons || [])[Number(m[1])];
  if (b) { e.waitUntil(pressFromNotice(data.n, b, e.notification.tag, url)); return; }
  e.waitUntil(openApp(url));
});
