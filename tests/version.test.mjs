import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const raiz = fileURLToPath(new URL('../', import.meta.url));
const pkg = JSON.parse(readFileSync(raiz + 'package.json', 'utf8'));
const index = readFileSync(raiz + 'index.html', 'utf8');
const sw = readFileSync(raiz + 'service-worker.js', 'utf8');

const versaoPkg = pkg.version.split('.').slice(0, 2).join('.');
const versaoSw = sw.match(/CACHE_VERSION\s*=\s*'([\d.]+)'/)?.[1];
const versaoIndex = [...index.matchAll(/\?v=([\d.]+)/g)].map((m) => m[1]);
const versaoRodape = index.match(/footer-version">v([\d.]+)</)?.[1];

test('a versão é a mesma em package.json, service worker, index.html e rodapé', () => {
  assert.equal(versaoSw, versaoPkg);
  assert.ok(versaoIndex.length > 0);
  for (const v of versaoIndex) {
    assert.equal(v, versaoPkg);
  }
  assert.equal(versaoRodape, versaoPkg);
});

test('todo arquivo de js/, vendor/ e fonts/ está na lista ASSETS', () => {
  for (const pasta of ['js', 'vendor', 'fonts']) {
    for (const arquivo of readdirSync(raiz + pasta)) {
      if (!/\.(js|woff2)$/.test(arquivo)) continue;
      assert.ok(
        sw.includes(`'./${pasta}/${arquivo}'`),
        `${pasta}/${arquivo} falta na lista ASSETS do service worker`,
      );
    }
  }
});
