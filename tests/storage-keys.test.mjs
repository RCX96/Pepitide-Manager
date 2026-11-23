import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const jsDir = fileURLToPath(new URL('../js/', import.meta.url));
const state = readFileSync(jsDir + 'state.js', 'utf8');

test('todas as chaves de localStorage têm uma constante única em state.js', () => {
  const usadas = new Set();
  for (const arquivo of readdirSync(jsDir).filter((f) => f.endsWith('.js'))) {
    const src = readFileSync(jsDir + arquivo, 'utf8');
    const re = /localStorage\.(?:getItem|setItem|removeItem)\(\s*'([^']+)'/g;
    let m;
    while ((m = re.exec(src))) {
      usadas.add(m[1]);
    }
  }
  for (const chave of usadas) {
    assert.ok(
      state.includes(`'${chave}'`),
      `a chave ${chave} usada em js/ não está declarada como constante em state.js`,
    );
  }
  assert.match(state, /export const KEY = 'peptide-manager-v1'/);
  assert.match(state, /export const LOCK_KEY = 'peptide-manager-lock-v2'/);
  assert.match(state, /export const CLOUD_DISABLED_KEY = 'peptide-supabase-disabled'/);
});
