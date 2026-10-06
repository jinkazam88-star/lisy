// Offline cache. Při každé změně aplikace zvyš číslo verze.
const CACHE = 'lisy-v17';
const FILES = ['./', 'index.html', 'styles.css', 'app.js', 'manifest.webmanifest', 'users.json',
  'qrcode.js', 'lz-string.min.js', 'jsQR.js',
  'icon-192.png', 'icon-512.png',
  'barlow-latin-400-normal.woff2', 'barlow-latin-ext-400-normal.woff2',
  'barlow-latin-600-normal.woff2', 'barlow-latin-ext-600-normal.woff2',
  'barlow-condensed-latin-700-normal.woff2', 'barlow-condensed-latin-ext-700-normal.woff2'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
// Network first (aby se nová verze projevila), při výpadku z cache.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).then(r => {
    const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
