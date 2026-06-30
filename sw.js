// sw.js — cache shell wrapper Monsco supaya buka ulang (terutama dari
// homescreen iOS/Android) tampil instan, tanpa nunggu network sama sekali
// untuk bagian shell-nya. Konten di dalam iframe (Apps Script) TIDAK
// di-cache di sini karena itu cross-origin dan harus selalu fresh.

// v2: cache_name dinaikkan supaya browser menganggap ini SW baru (memicu
// install/activate ulang, otomatis membersihkan cache v1 yang lama/basi —
// lihat listener 'activate' di bawah). NAIKKAN ANGKA INI LAGI tiap kali nanti
// mengubah index.html/sw.js secara berarti, supaya client lama dipaksa ambil
// versi baru alih-alih nyangkut di cache.
const CACHE_NAME = 'monsco-shell-v2';
const CDN_BASE = 'https://cdn.jsdelivr.net/gh/sangcondro-code/Monsco@main/';

// CATATAN PERBAIKAN: './' dan './index.html' SENGAJA TIDAK lagi di-precache
// di sini. Dokumen HTML utama sekarang pakai strategi NETWORK-FIRST (lihat
// fetch handler di bawah), bukan cache-first — supaya begitu kode di
// index.html di-deploy, perubahan itu LANGSUNG kepakai di kunjungan
// berikutnya, bukan baru muncul satu putaran kemudian (itu yang bikin
// terasa "gak pernah ke-update" walau sudah berkali-kali redeploy).
const SHELL_ASSETS = [
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
    ).then(() => self.clients.claim())
  );
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

  // ---- Dokumen HTML utama (navigasi ke index.html / root) — NETWORK-FIRST ----
  // PERBAIKAN UTAMA: ini yang sebelumnya bikin perubahan di index.html terasa
  // "tidak pernah kepakai" walau sudah redeploy berkali-kali — versi lama di
  // cache-first SELALU ditampilkan duluan, baru di-update di belakang layar
  // untuk kunjungan berikutnya (jadi selalu telat satu putaran). Sekarang
  // network dicoba DULU setiap kali; cache cuma jadi cadangan kalau benar-
  // benar offline/network gagal.
  if (req.mode === 'navigate' || req.destination === 'document') {
    event.respondWith(
      fetch(req)
        .then((fresh) => {
          if (fresh && fresh.ok) {
            caches.open(CACHE_NAME).then((cache) => cache.put(req, fresh.clone()));
          }
          return fresh;
        })
        .catch(() => caches.match(req).then((cached) => cached || caches.match(CDN_BASE + 'manifest.json')))
    );
    return;
  }

  // ---- Asset shell lain (ikon, manifest) — tetap cache-first + revalidate ----
  // Aman dipakai untuk file yang jarang berubah; tampil instan dari cache,
  // sambil diam-diam update versi terbaru untuk kunjungan berikutnya.
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) {
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
