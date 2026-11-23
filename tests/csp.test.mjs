import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const jsDir = fileURLToPath(new URL('../js/', import.meta.url));
const html = readFileSync(fileURLToPath(new URL('../index.html', import.meta.url)), 'utf8');

test('modelos de HTML não usam atributos style inline', () => {
  assert.doesNotMatch(html, /\sstyle\s*=/, 'index.html não deve ter style inline');
  for (const file of readdirSync(jsDir).filter((f) => f.endsWith('.js'))) {
    const src = readFileSync(jsDir + file, 'utf8');
    assert.doesNotMatch(
      src,
      /\sstyle\s*=\s*["'`]/,
      `${file} não deve gerar atributos style inline`,
    );
  }
});
