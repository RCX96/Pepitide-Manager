import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const jsDir = fileURLToPath(new URL('../js/', import.meta.url));
const arquivos = readdirSync(jsDir).filter((f) => f.endsWith('.js'));

function exportados(src) {
  const nomes = new Set();
  const funcoes = /export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g;
  let m;
  while ((m = funcoes.exec(src))) nomes.add(m[1]);
  const declaracoes = /export\s+(?:const|let|var)\s+([\s\S]*?);/g;
  while ((m = declaracoes.exec(src))) {
    const nomesNaDeclaracao = /(?:^|,)\s*([A-Za-z_$][\w$]*)\s*(?==|,|$)/g;
    let n;
    while ((n = nomesNaDeclaracao.exec(m[1]))) nomes.add(n[1]);
  }
  const explicito = /export\s*\{([^}]+)\}/g;
  while ((m = explicito.exec(src))) {
    for (const parte of m[1].split(',')) {
      const nome = parte.trim().split(/\s+as\s+/)[0].trim();
      if (nome) nomes.add(nome);
    }
  }
  return nomes;
}

test('todo nome importado de outro módulo é exportado por ele', () => {
  const tabela = new Map();
  for (const arquivo of arquivos) {
    tabela.set(arquivo.replace(/\.js$/, ''), exportados(readFileSync(jsDir + arquivo, 'utf8')));
  }
  for (const arquivo of arquivos) {
    const src = readFileSync(jsDir + arquivo, 'utf8');
    const re = /import\s*\{([\s\S]*?)\}\s*from\s*'\.\/([^']+)\.js'/g;
    let m;
    while ((m = re.exec(src))) {
      const origem = m[2];
      const destino = tabela.get(origem);
      assert.ok(destino, `${arquivo}: módulo ${origem}.js não encontrado`);
      for (const parte of m[1].split(',')) {
        const nome = parte.trim().split(/\s+as\s+/)[0].trim();
        if (!nome) continue;
        assert.ok(
          destino.has(nome),
          `${arquivo} importa ${nome} de ${origem}.js, que não exporta esse nome`,
        );
      }
    }
  }
});
