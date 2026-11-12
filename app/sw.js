// Offline shell for the installed web app. Data requests always go to the network.
const VERSION = 'loothub-v1';
const SHELL = ['./', 'index.html', 'styles.css', 'manifest.webmanifest', 'js/app.js', 'js/api.js', 'js/alerts.js', 'js/open.js', 'js/platforms.js', 'js/brand-icons.js', 'js/store.js', 'js/subs.js',
  'vendor/fontawesome/css/all.min.css', 'vendor/fontawesome/webfonts/fa-solid-900.woff2', 'vendor/fontawesome/webfonts/fa-regular-400.woff2', 'vendor/fontawesome/webfonts/fa-brands-400.woff2',
  'assets/icon-192.png', 'assets/icon-512.png'];
self.addEventListener('install', e => e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin || e.request.method !== 'GET') return;
  // network first so updates show up, cache as fallback when offline
  e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request)));
});
self.addEventListener('notificationclick', e => { e.notification.close(); e.waitUntil(self.clients.matchAll({ type: 'window' }).then(cs => cs[0] ? cs[0].focus() : self.clients.openWindow('./'))); });
