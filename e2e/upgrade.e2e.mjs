import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { test, expect } from '@playwright/test';

const previousHTML =
  '<!doctype html><p>Instalação anterior</p><script>navigator.serviceWorker.register("/service-worker.js")</script>';
const previousWorker = `
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open('peptide-manager-shell-old').then((cache) =>
    cache.put('/js/cycles.js', new Response('export const obsolete = true;', {
      headers: { 'content-type': 'text/javascript' },
    }))
  ));
  self.skipWaiting();
});
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event) => {
  if (new URL(event.request.url).pathname === '/js/cycles.js') {
    event.respondWith(caches.match(event.request));
  }
});
`;

test('atualiza com cache anterior, preserva registros e abre ciclos offline', async ({
  page,
  context,
}) => {
  let upgraded = false;
  const root = new URL('../', import.meta.url);
  const types = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.webmanifest': 'application/manifest+json',
  };
  const server = createServer(async (request, response) => {
    const path = new URL(request.url, 'http://localhost').pathname;
    if (!upgraded && path === '/') {
      response.writeHead(200, { 'Content-Type': 'text/html' }).end(previousHTML);
      return;
    }
    if (!upgraded && path === '/service-worker.js') {
      response.writeHead(200, { 'Content-Type': 'text/javascript' }).end(previousWorker);
      return;
    }
    const file = path === '/' ? '/index.html' : path;
    try {
      const contents = await readFile(new URL('.' + file, root));
      response
        .writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream' })
        .end(contents);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const url = 'http://127.0.0.1:' + server.address().port;
    await page.goto(url);
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
    await page.evaluate(() => {
      localStorage.setItem(
        'peptide-manager-v1',
        JSON.stringify({
          applications: [],
          weights: [],
          cycles: [
            {
              id: 'c1',
              name: 'Ciclo antes da atualização',
              start: '2026-11-01',
              status: 'active',
              pauses: [],
            },
          ],
        }),
      );
    });
    upgraded = true;
    await page.reload();
    await expect(page.getByText('Tempo dos ciclos')).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: 'CICLOS', exact: true }).click();
    await expect(page.getByText('Ciclo antes da atualização')).toBeVisible();
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Ciclos salvos' })).toBeVisible();
    await expect(page.getByText('Ciclo antes da atualização')).toBeVisible();
  } finally {
    await context.setOffline(false);
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
