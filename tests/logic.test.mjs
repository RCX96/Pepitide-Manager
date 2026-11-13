import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

const htmlPath = fileURLToPath(new URL('../index.html', import.meta.url));
const html = readFileSync(htmlPath, 'utf8');
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
if (!scriptMatch) throw new Error('Script inline não encontrado em index.html');

// O app é um arquivo único: carregamos o script inline em um contexto isolado,
// com o mínimo de DOM/armazenamento para o render inicial, e testamos as funções puras.
function loadApp() {
  const elements = new Map();
  const makeElement = () => ({ innerHTML: '', textContent: '', remove() {}, showModal() {}, close() {} });
  const sandbox = {
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    document: {
      getElementById(id) {
        if (!elements.has(id)) elements.set(id, makeElement());
        return elements.get(id);
      },
      createElement: () => ({ click() {}, remove() {}, style: {} }),
      body: { appendChild() {} },
    },
    navigator: {},
    window: { addEventListener() {} },
    alert() {},
    confirm: () => true,
    crypto: webcrypto,
    URL,
    Blob,
    File,
    TextEncoder,
    console,
    setTimeout,
    clearTimeout,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(scriptMatch[1], sandbox, { filename: 'index.html:inline-script' });
  return sandbox;
}

const app = loadApp();

test('dayCount conta os dias de forma inclusiva', () => {
  assert.equal(app.dayCount('2026-11-01', '2026-11-03'), 3);
  assert.equal(app.dayCount('2026-11-03', '2026-11-03'), 1);
});

test('dayCount devolve zero para intervalo invertido ou datas ausentes', () => {
  assert.equal(app.dayCount('2026-11-03', '2026-11-01'), 0);
  assert.equal(app.dayCount('', '2026-11-01'), 0);
});

test('elapsedCycle desconta pausas sem contar o dia da retomada', () => {
  const cycle = {
    status: 'finished',
    start: '2026-11-01',
    end: '2026-11-10',
    pauses: [{ start: '2026-11-05', end: '2026-11-06' }],
  };
  assert.equal(app.dayCount(cycle.start, cycle.end), 10);
  assert.equal(app.elapsedCycle(cycle), 9);
});

test('elapsedCycle não fica negativo', () => {
  const cycle = {
    status: 'finished',
    start: '2026-11-10',
    end: '2026-11-11',
    pauses: [{ start: '2026-11-01', end: '2026-11-20' }],
  };
  assert.equal(app.elapsedCycle(cycle), 0);
});

test('strictDate só aceita datas ISO reais', () => {
  assert.equal(app.strictDate('2026-02-28'), true);
  assert.equal(app.strictDate('2026-02-30'), false);
  assert.equal(app.strictDate('2026-2-3'), false);
  assert.equal(app.strictDate('ontem'), false);
});

test('validateBackup aceita a estrutura mínima', () => {
  assert.equal(app.validateBackup({ applications: [], cycles: [], weights: [] }), true);
});

test('validateBackup recusa estrutura incompleta', () => {
  assert.throws(() => app.validateBackup({}), /Estrutura do backup inválida/);
  assert.throws(() => app.validateBackup(null), /Estrutura do backup inválida/);
});

test('validateBackup recusa identificadores duplicados', () => {
  const weight = { id: 'a', date: '2026-11-01', value: 80 };
  assert.throws(
    () => app.validateBackup({ applications: [], cycles: [], weights: [weight, { ...weight }] }),
    /Registro inválido em weights/,
  );
});

test('validateBackup recusa aplicação sem compostos válidos', () => {
  const base = { applications: [], cycles: [], weights: [] };
  assert.throws(
    () =>
      app.validateBackup({
        ...base,
        applications: [{ id: 'x', date: '2026-11-01', compounds: [] }],
      }),
    /Compostos inválidos/,
  );
  assert.throws(
    () =>
      app.validateBackup({
        ...base,
        applications: [{ id: 'x', date: '2026-11-01', compounds: [{ name: 'A', dose: 0, unit: 'mg' }] }],
      }),
    /Compostos inválidos/,
  );
});

test('validateBackup recusa peso fora da faixa', () => {
  assert.throws(
    () =>
      app.validateBackup({
        applications: [],
        cycles: [],
        weights: [{ id: 'w1', date: '2026-11-01', value: 501 }],
      }),
    /Pesagem inválida/,
  );
});

test('validateBackup recusa meta inválida', () => {
  assert.throws(
    () => app.validateBackup({ applications: [], cycles: [], weights: [], goal: 0 }),
    /Meta inválida/,
  );
});

test('validateBackup recusa lixeira com tipo desconhecido', () => {
  assert.throws(
    () =>
      app.validateBackup({
        applications: [],
        cycles: [],
        weights: [],
        trash: [{ trashId: 't1', type: 'outro', item: { id: 'x' } }],
      }),
    /Lixeira inválida/,
  );
});

test('csvCell neutraliza fórmulas e escapa aspas', () => {
  assert.equal(app.csvCell('=1+1').startsWith('"\'='), true);
  assert.equal(app.csvCell('@cmd').startsWith('"\'@'), true);
  assert.equal(app.csvCell('texto "com aspas"'), '"texto ""com aspas"""');
  assert.equal(app.csvCell('-1'), '"-1"');
});
