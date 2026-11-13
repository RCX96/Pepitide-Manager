const CACHE = 'peptide-manager-shell-v2.3';
const ASSETS = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith('peptide-manager-shell-') && key !== CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

// Rede primeiro para páginas: o usuário recebe a versão nova assim que houver conexão,
// e o cache serve apenas como reserva offline.
async function networkFirst(request) {
  const cache = await caches.open(CACHE);
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
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  const refresh = fetch(request).then(response => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  });
  if (hit) {
    refresh.catch(() => {});
    return hit;
  }
  return refresh;
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(request.mode === 'navigate' ? networkFirst(request) : staleWhileRevalidate(request));
});
