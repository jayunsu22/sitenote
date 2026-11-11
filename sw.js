// sw.js — 앱 파일만 캐시 (네트워크 우선, 실패 시 캐시). n8n webhook 은 캐시하지 않음.
var CACHE = 'sitenote-v20261111f';
var FILES = ['./', './index.html', './assistant_face.jpg', './schedule.html', './order.html', './approve.html', './style.css?v=20261111a', './site-design.css?v=20261107b', './pin-lock.js?v=20261008a', './share.js?v=20261111e', './store.js?v=20261106a', './owner-key.js?v=20261104q', './adminlink.js?v=20261019g', './taskui.js?v=20261110c', './boss_chat.js?v=20261111d', './kakao.js?v=20261105b', './app.js?v=20261111f', './stamp.js?v=20261106a', './voice.js?v=20261104a', './quote_requests.js?v=20261030a', './quote_link.js?v=20261019g', './app-switcher.js?v=20261020a', './manifest.json', './manifest-order.json', './manifest-approve.json', './icon-192.png', './icon-512.png', './icon-schedule-192.png', './icon-schedule-512.png', './icon-assistant-192.png', './icon-assistant-512.png', './icon-approve-192.png', './icon-approve-512.png'];

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

/* ⏰ 정시 업무보고 폰 알림 (2026-11-07 사장님) — n8n 현장관리_빈칸 이 매시 정각에 Netlify send-push 로 보낸다.
   글은 { title, body, url }. 첫 줄 요약 + 항목 (안드로이드는 펼치면 여러 줄). 누르면 비서 화면, '확인 필요 보기' 는 업무 내역 탭 */
self.addEventListener('push', function (e) {
  var d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { title: '업무비서', body: e.data ? e.data.text() : '' }; }
  var url = d.url || './index.html#order';
  e.waitUntil(self.registration.showNotification(d.title || '업무비서', {
    body: d.body || '',
    icon: 'icon-assistant-192.png',
    badge: 'icon-assistant-192.png',
    tag: 'hourly-report',           // 지난 보고는 새 보고로 바꿔 쌓이지 않게
    renotify: true,
    data: { url: url },
    actions: [{ action: 'open', title: '보고 열기' }, { action: 'need', title: '확인 필요 보기' }]
  }));
});
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var url = (e.notification.data && e.notification.data.url) || './index.html#order';
  if (e.action === 'need') url = url.replace(/#order.*$/, '#order/log');
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (c.url.indexOf('/sitenote/') !== -1 && 'focus' in c) { c.navigate(url).catch(function () {}); return c.focus(); }
    }
    return self.clients.openWindow(url);
  }));
});

