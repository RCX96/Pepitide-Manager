import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const sw = readFileSync(new URL('../service-worker.js', import.meta.url), 'utf8');

test('versão exibida no app coincide com a do cache do service worker', () => {
  const app = html.match(/versão (\d+(?:\.\d+)*)/);
  const cache = sw.match(/peptide-manager-shell-v(\d+(?:\.\d+)*)/);
  assert.ok(app, 'index.html deve exibir a versão');
  assert.ok(cache, 'service-worker.js deve declarar o cache com versão');
  assert.equal(cache[1], app[1], 'CACHE do service worker deve ser igual à versão publicada');
});
