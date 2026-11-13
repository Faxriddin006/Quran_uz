// Qur'on UZ — oflayn ishlash uchun service worker.
// - sahifa (index.html): avval tarmoq, bo'lmasa kesh
// - assets/ (xeshlangan fayllar), shriftlar: avval kesh
// - data/ (?v=<ma'lumot versiyasi>): avval kesh; versiya o'zgarsa eski kesh o'chiriladi
// Boshqa domenlar (masalan, audio) ushlanmaydi.
const STATIC = 'quz-static-v3';
const DATA_PREFIX = 'quz-data-';
const SCOPE = new URL('./', self.location).pathname;

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(STATIC)
      .then(async (c) => {
        await c.addAll(['./', 'favicon.svg', 'manifest.webmanifest', 'fonts/amiri-quran-arabic.woff2']);
        // Ilova qobig'i (barcha JS/CSS bo'laklari) — keyin oflayn ham har bir bo'lim ochiladi
        const list = await fetch('asset-list.json', { cache: 'no-store' }).then((r) => r.json());
        await Promise.all(list.map((f) => c.add(f).catch(() => {})));
      })
      .catch(() => {})
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('quz-static-') && k !== STATIC).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function cacheFirst(cacheName, request, key) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(key || request, { ignoreVary: true });
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) cache.put(key || request, res.clone());
  return res;
}

async function networkFirst(request) {
  const cache = await caches.open(STATIC);
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 4500);
    const res = await fetch(request, { signal: ctl.signal });
    clearTimeout(timer);
    if (res.ok) cache.put('./', res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match('./', { ignoreVary: true });
    if (hit) return hit;
    throw err;
  }
}

async function dropOldData(current) {
  const keys = await caches.keys();
  await Promise.all(keys.filter((k) => k.startsWith(DATA_PREFIX) && k !== current).map((k) => caches.delete(k)));
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(SCOPE)) return;
  const path = url.pathname.slice(SCOPE.length);

  if (req.mode === 'navigate' || path === '' || path === 'index.html') {
    e.respondWith(networkFirst(req));
    return;
  }
  if (path.startsWith('data/')) {
    const v = url.searchParams.get('v') || '0';
    const name = DATA_PREFIX + v;
    e.respondWith(cacheFirst(name, req, url.pathname));
    e.waitUntil(dropOldData(name));
    return;
  }
  if (path.startsWith('assets/') || path.startsWith('fonts/') || /\.(svg|png|webmanifest)$/.test(path)) {
    e.respondWith(cacheFirst(STATIC, req));
  }
});
