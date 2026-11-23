import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

const jsDir = fileURLToPath(new URL('../js/', import.meta.url));
const nomes = readdirSync(jsDir)
  .filter((f) => f.endsWith('.js'))
  .map((f) => f.replace(/\.js$/, ''));

function elemento() {
  return {
    innerHTML: '',
    textContent: '',
    value: '',
    files: [],
    classList: { add() {}, remove() {} },
    setAttribute() {},
    getAttribute: () => null,
    addEventListener() {},
    removeEventListener() {},
    appendChild() {},
    insertAdjacentHTML() {},
    querySelector: () => null,
    querySelectorAll: () => [],
    focus() {},
    close() {},
    showModal() {},
    remove() {},
    click() {},
  };
}

const ctx = vm.createContext({
  localStorage: {
    getItem: () => null,
    setItem() {},
    removeItem() {},
  },
  document: {
    getElementById: () => elemento(),
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener() {},
    createElement: () => elemento(),
    body: { appendChild() {} },
    documentElement: { setAttribute() {}, removeAttribute() {} },
  },
  window: {
    addEventListener() {},
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    scrollTo() {},
  },
  navigator: {},
  location: { protocol: 'https:', hostname: 'localhost', search: '', href: 'https://localhost/' },
  history: { replaceState() {}, pushState() {} },
  crypto: webcrypto,
  btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
  atob: (s) => Buffer.from(s, 'base64').toString('binary'),
  URL,
  URLSearchParams,
  Blob,
  File,
  FormData,
  TextEncoder,
  TextDecoder,
  console,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
});
ctx.globalThis = ctx;

const cache = new Map();
const linker = (specifier) => {
  const arquivo = specifier.replace(/^\.\//, '').replace(/\.js$/, '');
  if (!cache.has(arquivo)) {
    cache.set(
      arquivo,
      new vm.SourceTextModule(readFileSync(jsDir + arquivo + '.js', 'utf8'), {
        identifier: specifier,
        context: ctx,
      }),
    );
  }
  return cache.get(arquivo);
};

for (const nome of nomes) {
  test(`módulo ${nome}.js carrega sem erro`, async () => {
    const modulo = new vm.SourceTextModule(readFileSync(jsDir + nome + '.js', 'utf8'), {
      identifier: nome,
      context: ctx,
    });
    await modulo.link(linker);
    await modulo.evaluate();
    assert.ok(modulo.namespace);
  });
}
