const CACHE_VERSION = '2.34';
const CACHE_NAME = 'peptide-manager-shell-v' + CACHE_VERSION;
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './styles.css',
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
  './js/main.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
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
  event.respondWith(
    request.mode === 'navigate' ? networkFirst(request) : staleWhileRevalidate(request),
  );
});
