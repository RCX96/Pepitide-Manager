import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

const htmlPath = fileURLToPath(new URL('../index.html', import.meta.url));
const appPath = fileURLToPath(new URL('../app.js', import.meta.url));
const html = readFileSync(htmlPath, 'utf8');
const js = readFileSync(appPath, 'utf8');
if (!js) throw new Error('Script app.js não encontrado');

// O app é um arquivo único: carregamos o script inline em um contexto isolado,
// com o mínimo de DOM/armazenamento para o render inicial, e testamos as funções puras.
function loadApp(initialData = null) {
  const elements = new Map();
  const makeElement = () => ({
    innerHTML: '',
    textContent: '',
    remove() {},
    showModal() {},
    close() {},
  });
  const store = new Map();
  if (initialData) store.set('peptide-manager-v1', JSON.stringify(initialData));
  const sandbox = {
    localStorage: {
      getItem: (k) => store.get(k) || null,
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    },
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
  vm.runInContext(js, sandbox, { filename: 'app.js' });
  // `db` é declarado com `let`, então não vira propriedade do sandbox; expõe um getter para os testes.
  Object.defineProperty(sandbox, 'db', {
    get: () => vm.runInContext('db', sandbox),
    configurable: true,
  });
  sandbox._getStored = () => {
    const raw = store.get('peptide-manager-v1');
    return raw ? JSON.parse(raw) : null;
  };
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
        applications: [
          { id: 'x', date: '2026-11-01', compounds: [{ name: 'A', dose: 0, unit: 'mg' }] },
        ],
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

test('validateBackup recusa ciclo com identificador malicioso (XSS)', () => {
  assert.throws(
    () =>
      app.validateBackup({
        applications: [],
        cycles: [
          {
            id: '<img onerror=alert(1)>',
            name: 'Ciclo Malicioso',
            status: 'active',
            start: '2026-11-01',
          },
        ],
        weights: [],
      }),
    /Ciclo inválido/,
  );
  assert.throws(
    () =>
      app.validateBackup({
        applications: [],
        cycles: [
          {
            id: '\'" onmouseover=alert(1)',
            name: 'Ciclo Malicioso 2',
            status: 'active',
            start: '2026-11-01',
          },
        ],
        weights: [],
      }),
    /Ciclo inválido/,
  );
});

test('validateBackup aceita ciclo com identificador válido (hex / uuid)', () => {
  assert.equal(
    app.validateBackup({
      applications: [],
      cycles: [
        {
          id: 'c6fa1ff3-7e3e-4e11-a78d-7373796835b5',
          name: 'Ciclo Válido',
          status: 'active',
          start: '2026-11-01',
        },
      ],
      weights: [],
    }),
    true,
  );
});

test('validateBackup recusa aplicação vinculada a cycleId inválido', () => {
  assert.throws(
    () =>
      app.validateBackup({
        applications: [
          {
            id: 'app1',
            date: '2026-11-01',
            cycleId: '<script>alert(1)</script>',
            compounds: [{ name: 'A', dose: 1, unit: 'mg' }],
          },
        ],
        cycles: [],
        weights: [],
      }),
    /Ciclo inválido em aplicação/,
  );
});

test('validateBackup aceita e valida o catálogo de compostos', () => {
  assert.equal(
    app.validateBackup({
      applications: [],
      cycles: [],
      weights: [],
      compoundCatalog: ['Semaglutida'],
    }),
    true,
  );
  assert.throws(
    () => app.validateBackup({ applications: [], cycles: [], weights: [], compoundCatalog: [''] }),
    /Catálogo de compostos inválido/,
  );
});

test('aplicação pode ser duplicada para uma nova data sem alterar o original', () => {
  const testApp = loadApp();
  testApp.db.applications = [
    {
      id: 'app-1',
      date: '2026-11-01',
      time: '08:00',
      site: 'Abdômen',
      cycleId: null,
      notes: 'Registro recorrente',
      compounds: [{ name: 'Semaglutida', dose: 1, unit: 'mg' }],
    },
  ];
  testApp.copyApp('app-1');
  const rendered = testApp.applications();
  assert.equal(testApp.db.applications.length, 1);
  assert.equal(rendered.includes('Nova (cópia)'), true);
  assert.equal(rendered.includes('value="Semaglutida"'), true);
  assert.equal(rendered.includes('data-action="copy-app"'), true);
});

test('index.html não contém handlers onclick inline', () => {
  assert.equal(/\sonclick=/i.test(html), false);
});

test('renderização de ciclos utiliza data-action e data-id sem onclick inline', () => {
  const testApp = loadApp();
  testApp.db.cycles = [
    {
      id: 'abc-123',
      name: 'Ciclo Teste <script>',
      start: '2026-11-01',
      status: 'active',
      notes: 'Nota <teste>',
      pauses: [],
    },
  ];
  const rendered = testApp.cycles();
  assert.equal(rendered.includes('onclick='), false);
  assert.equal(rendered.includes('data-action="edit-cycle"'), true);
  assert.equal(rendered.includes('data-id="abc-123"'), true);
  assert.equal(rendered.includes('data-action="delete-cycle"'), true);
  assert.equal(rendered.includes('Ciclo Teste &lt;script&gt;'), true);
  assert.equal(rendered.includes('<script>'), false);
});

test('handleAction gerencia eventos via delegação de data-action e data-id', () => {
  const testApp = loadApp();
  testApp.db.cycles = [
    {
      id: 'cafe01',
      name: 'Ciclo Ativo',
      start: '2026-11-01',
      status: 'active',
      notes: '',
      pauses: [],
    },
  ];
  const pauseBtn = {
    getAttribute(attr) {
      if (attr === 'data-action') return 'pause-cycle';
      if (attr === 'data-id') return 'cafe01';
      return null;
    },
    closest(selector) {
      if (selector === 'button[data-action]') return this;
      return null;
    },
  };
  testApp.handleAction({ target: pauseBtn });
  assert.equal(testApp.db.cycles[0].status, 'paused');

  const resumeBtn = {
    getAttribute(attr) {
      if (attr === 'data-action') return 'resume-cycle';
      if (attr === 'data-id') return 'cafe01';
      return null;
    },
    closest(selector) {
      if (selector === 'button[data-action]') return this;
      return null;
    },
  };
  testApp.handleAction({ target: resumeBtn });
  assert.equal(testApp.db.cycles[0].status, 'active');

  const evilBtn = {
    getAttribute(attr) {
      if (attr === 'data-action') return 'pause-cycle';
      if (attr === 'data-id') return '<script>alert(1)</script>';
      return null;
    },
    closest(selector) {
      if (selector === 'button[data-action]') return this;
      return null;
    },
  };
  testApp.handleAction({ target: evilBtn });
  assert.equal(testApp.db.cycles[0].status, 'active');
});
