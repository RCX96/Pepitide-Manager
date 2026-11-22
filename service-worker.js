const CACHE_VERSION = '2.25';
const CACHE_NAME = 'peptide-manager-shell-v' + CACHE_VERSION;
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './app.js',
  './styles.css',
  './icon-192.png',
  './icon-512.png',
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
  try {
    const response = await fetch(request, { cache: 'no-cache' });
    if (response.ok) cache.put('./index.html', response.clone());
    return response;
  } catch (error) {
    return (await cache.match('./index.html')) || (await cache.match('./')) || Response.error();
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
