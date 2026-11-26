const CACHE_VERSION = '2.38.2';
const CACHE_NAME = 'peptide-manager-shell-v' + CACHE_VERSION;
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './styles.css',
  './styles.css?v=' + CACHE_VERSION,
  './fonts/inter-latin-400-normal.woff2',
  './fonts/inter-latin-600-normal.woff2',
  './fonts/inter-latin-700-normal.woff2',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png',
  './screenshots/mobile.png',
  './screenshots/desktop.png',
  './vendor/supabase.js',
  './js/state.js',
  './js/lock.js',
  './js/util.js',
  './js/ui.js',
  './js/calendar.js',
  './js/apps.js',
  './js/cycles.js',
  './js/sync.js',
  './js/backup.js',
  './js/reports.js',
  './js/main.js?v=' + CACHE_VERSION,
  './js/bootstrap.js?v=' + CACHE_VERSION,
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(ASSETS.map((asset) => new Request(asset, { cache: 'reload' })));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith('peptide-manager-shell-') && key !== CACHE_NAME)
          await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

// Rede primeiro para páginas: o usuário recebe a versão nova assim que houver conexão,
// e o cache serve apenas como reserva offline.
async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const key = new URL(request.url).pathname;
  try {
    const response = await fetch(request, { cache: 'no-cache' });
    if (response.ok) {
      const type = response.headers.get('content-type') || '';
      if (type.includes('text/html')) {
        const copy = response.clone();
        const html = await copy.text();
        if (html.includes('<title>Peptide Manager</title>') && html.includes(CACHE_VERSION)) {
          await cache.put(
            key,
            new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } }),
          );
        }
      }
    }
    return response;
  } catch (error) {
    return (await cache.match(key)) || (await cache.match('./index.html')) || Response.error();
  }
}

// Cache primeiro com revalidação em segundo plano para ícones e manifesto.
async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const hit = await cache.match(request);
  const refresh = fetch(request).then((response) => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  });
  if (hit) {
    refresh.catch(() => {});
    return hit;
  }
  return refresh;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
  } else if (['script', 'style'].includes(request.destination)) {
    // O código pré-carregado pertence à mesma versão do worker.
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => (await cache.match(request)) || fetch(request)),
    );
  } else {
    event.respondWith(staleWhileRevalidate(request));
  }
});
