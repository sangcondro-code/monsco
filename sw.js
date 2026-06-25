// sw.js — cache shell wrapper Monsco supaya buka ulang (terutama dari
// homescreen iOS/Android) tampil instan, tanpa nunggu network sama sekali
// untuk bagian shell-nya. Konten di dalam iframe (Apps Script) TIDAK
// di-cache di sini karena itu cross-origin dan harus selalu fresh.

const CACHE_NAME = 'monsco-shell-v1';
const CDN_BASE = 'https://cdn.jsdelivr.net/gh/sangcondro-code/Monsco@main/';

const SHELL_ASSETS = [
  './',
  './index.html',
  CDN_BASE + 'manifest.json',
  CDN_BASE + 'icon-192.png',
  CDN_BASE + 'icon-512.png',
  CDN_BASE + 'apple-touch-icon.png',
  CDN_BASE + 'favicon-32x32.png',
  CDN_BASE + 'favicon-16x16.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Jangan ikut campur sama sekali dengan request ke Apps Script —
  // itu harus selalu langsung ke network, tidak boleh kena cache.
  if (req.url.includes('script.google.com') || req.url.includes('script.googleusercontent.com')) {
    return;
  }

  // Hanya tangani GET request untuk asset shell (index.html sendiri + CDN asset).
  if (req.method !== 'GET') return;

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) {
        // Cache-first: langsung balas dari cache, lalu diam-diam refresh di
        // belakang supaya update repo (icon baru dll) tetap kepakai di load
        // berikutnya.
        fetch(req)
          .then((fresh) => {
            if (fresh && fresh.ok) {
              caches.open(CACHE_NAME).then((cache) => cache.put(req, fresh.clone()));
            }
          })
          .catch(() => {});
        return cached;
      }
      return fetch(req);
    })
  );
});
