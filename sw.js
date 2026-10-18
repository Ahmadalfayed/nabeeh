const CACHE = 'nabeeh-v5';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './logo.svg',
  './manifest.webmanifest',
  './js/db.js',
  './js/presets.js',
  './js/ai.js',
  './js/files.js',
  './vendor/marked.min.js',
  './vendor/purify.min.js',
  './vendor/hljs.min.js',
  './vendor/hljs.css',
  './vendor/cairo.woff2',
  './vendor/cairo-latin.woff2',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  // Never intercept API calls or non-GET — critical for Gemini/OpenAI from the page
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch { return; }
  if (url.origin !== self.location.origin) return;
  // Bypass SW for navigations that look like API (none on our origin, but be safe)
  if (url.pathname.includes('/v1/')) return;
  e.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(res => {
        if (res && res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
        }
        return res;
      }).catch(() => cached || caches.match('./index.html'));
    })
  );
});
