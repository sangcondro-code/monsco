/* ====================================================================
 *  MONSCO — Service Worker (sw.js)
 *  --------------------------------------------------------------------
 *  TUJUAN (SATU-SATUNYA): bikin app terasa lebih ringan/cepat di HP,
 *  terutama saat dibuka lagi dari ikon "Add to Home Screen" — TIDAK
 *  mengubah tampilan/UI apa pun, cuma soal kecepatan muat.
 *
 *  SENGAJA TIDAK dipasangkan dengan manifest.json / properti PWA lain
 *  (lihat catatan di kepala github-index.html) — jadi ini TIDAK memicu
 *  prompt "Install app" browser dan TIDAK mengubah cara app dibuka.
 *  Ini murni layer cache di belakang layar.
 *
 *  STRATEGI (per jenis request — supaya data keuangan TIDAK PERNAH basi):
 *  1) Halaman HTML sendiri (index/github-index) & SEMUA request ke
 *     script.google.com (RPC baca/tulis data) -> SELALU network,
 *     TIDAK PERNAH diambil dari cache. Ini yang paling penting: kalau
 *     ini di-cache, user bisa lihat data lama/basi atau saldo yang
 *     belum sinkron — tidak boleh terjadi di app keuangan.
 *  2) Library vendor pihak ketiga (Bootstrap/FontAwesome/SweetAlert2/
 *     Chart.js dari CDN) & ikon statis -> "stale-while-revalidate":
 *     langsung disajikan dari cache (INSTAN, tidak nunggu network sama
 *     sekali kalau sudah pernah dimuat), SEKALIGUS diam-diam di-fetch
 *     ulang di background untuk memperbarui cache buat kunjungan
 *     berikutnya. Aman dipakai untuk library ini karena isinya bukan
 *     data user — beda satu request "basi" pun tidak berdampak apa-apa
 *     ke keuangan user, dan versi barunya otomatis kepakai di reload
 *     berikutnya.
 *  Efeknya: kunjungan PERTAMA sama seperti biasa (semua dari network),
 *  tapi kunjungan KEDUA dst (termasuk tiap kali dibuka dari Home Screen)
 *  Bootstrap/FontAwesome/SweetAlert2/Chart.js/ikon langsung tampil dari
 *  cache lokal HP — tidak perlu tunggu CDN sama sekali, jadi first paint
 *  jauh lebih cepat, terutama di koneksi seluler yang lambat/naik-turun.
 * ==================================================================== */

var CACHE_NAME = 'monsco-static-v1';

// Cuma origin CDN vendor library + ikon statis milik app sendiri —
// SENGAJA TIDAK termasuk script.google.com maupun HTML halaman ini.
var CACHEABLE_ORIGINS = [
  'https://cdn.jsdelivr.net',
  'https://cdnjs.cloudflare.com'
];

self.addEventListener('install', function (event) {
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(
        names.filter(function (n) { return n !== CACHE_NAME; })
             .map(function (n) { return caches.delete(n); })
      );
    }).then(function () { return self.clients.claim(); })
  );
});

function isCacheableVendorRequest_(url) {
  if (url.protocol !== 'https:') return false;
  return CACHEABLE_ORIGINS.indexOf(url.origin) !== -1;
}

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return; // POST (RPC ke Apps Script) tidak pernah disentuh SW ini

  var url;
  try { url = new URL(req.url); } catch (e) { return; }

  // Aturan #1 di atas: halaman sendiri & semua RPC backend -> selalu network.
  if (!isCacheableVendorRequest_(url)) return;

  // Aturan #2: stale-while-revalidate untuk vendor CDN.
  event.respondWith(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.match(req).then(function (cached) {
        var networkFetch = fetch(req).then(function (res) {
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        }).catch(function () { return cached; }); // offline & belum ada cache -> biarkan gagal wajar
        return cached || networkFetch;
      });
    })
  );
});
