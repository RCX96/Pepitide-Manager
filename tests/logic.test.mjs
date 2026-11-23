import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

const htmlPath = fileURLToPath(new URL('../index.html', import.meta.url));
const jsDir = fileURLToPath(new URL('../js/', import.meta.url));
const html = readFileSync(htmlPath, 'utf8');

// O app é dividido em módulos ES em js/. Cada teste carrega os módulos em um
// contexto vm isolado, com o mínimo de DOM/armazenamento, via um módulo-ponte
// que expõe as funções e getters vivos para o estado mutável.
const MODULES = [
  'state',
  'lock',
  'util',
  'ui',
  'calendar',
  'apps',
  'cycles',
  'sync',
  'backup',
  'reports',
  'main',
];
const STATE_LETTERS = [
  'db',
  'loadError',
  'tab',
  'editing',
  'appDraft',
  'compounds',
  'applicationFilter',
  'catalogFilter',
  'suppressHomeCalendar',
  'supabaseClient',
  'supabaseUser',
  'supabaseSyncStatus',
  'supabaseSyncError',
  'supabaseLastSync',
  'syncTimer',
  'unlocked',
  'historyCompound',
  'reportFrom',
  'reportTo',
  'reportCycle',
];
const bridgeSource = `
${MODULES.map((m) => `import * as ${m} from './${m}.js';`).join(String.fromCharCode(10))}
import './main.js';
const api = {};
for (const m of [${MODULES.join(', ')}]) {
  for (const k of Object.keys(m)) {
    if (typeof m[k] === 'function') api[k] = m[k];
  }
}
for (const n of ${JSON.stringify(STATE_LETTERS)}) {
  Object.defineProperty(api, n, { get: () => state[n], configurable: true });
}
api.cloudHooks = sync.cloudHooks;
globalThis.__app = api;
`;

async function loadApp(initialData = null) {
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
      createElement: () => ({
        ...makeElement(),
        setAttribute() {},
        addEventListener() {},
        querySelector: () => null,
        style: {},
      }),
      body: { appendChild() {} },
    },
    navigator: {},
    window: { addEventListener() {} },
    crypto: webcrypto,
    URL,
    Blob,
    File,
    TextEncoder,
    console,
    setTimeout,
    clearTimeout,
    location: { protocol: 'https:', hostname: 'localhost' },
  };
  sandbox.globalThis = sandbox;
  const ctx = vm.createContext(sandbox);
  const moduleCache = new Map();
  const linker = (specifier) => {
    const file = path.join(jsDir, specifier.replace(/^\.\//, ''));
    if (!moduleCache.has(file)) {
      moduleCache.set(
        file,
        new vm.SourceTextModule(readFileSync(file, 'utf8'), {
          identifier: specifier,
          context: ctx,
        }),
      );
    }
    return moduleCache.get(file);
  };
  const bridge = new vm.SourceTextModule(bridgeSource, {
    identifier: 'bridge',
    context: ctx,
  });
  await bridge.link(linker);
  await bridge.evaluate();
  const api = sandbox.__app;
  api._getStored = () => {
    const raw = store.get('peptide-manager-v1');
    return raw ? JSON.parse(raw) : null;
  };
  return api;
}

const app = await loadApp();

test('dayCount conta os dias de forma inclusiva', async () => {
  assert.equal(app.dayCount('2026-11-01', '2026-11-03'), 3);
  assert.equal(app.dayCount('2026-11-03', '2026-11-03'), 1);
});

test('dayCount devolve zero para intervalo invertido ou datas ausentes', async () => {
  assert.equal(app.dayCount('2026-11-03', '2026-11-01'), 0);
  assert.equal(app.dayCount('', '2026-11-01'), 0);
});

test('elapsedCycle desconta pausas sem contar o dia da retomada', async () => {
  const cycle = {
    status: 'finished',
    start: '2026-11-01',
    end: '2026-11-10',
    pauses: [{ start: '2026-11-05', end: '2026-11-06' }],
  };
  assert.equal(app.dayCount(cycle.start, cycle.end), 10);
  assert.equal(app.elapsedCycle(cycle), 9);
});

test('elapsedCycle não fica negativo', async () => {
  const cycle = {
    status: 'finished',
    start: '2026-11-10',
    end: '2026-11-11',
    pauses: [{ start: '2026-11-01', end: '2026-11-20' }],
  };
  assert.equal(app.elapsedCycle(cycle), 0);
});

test('strictDate só aceita datas ISO reais', async () => {
  assert.equal(app.strictDate('2026-02-28'), true);
  assert.equal(app.strictDate('2026-02-30'), false);
  assert.equal(app.strictDate('2026-2-3'), false);
  assert.equal(app.strictDate('ontem'), false);
});

test('validateBackup aceita a estrutura mínima', async () => {
  assert.equal(app.validateBackup({ applications: [], cycles: [], weights: [] }), true);
});

test('validateBackup recusa estrutura incompleta', async () => {
  assert.throws(() => app.validateBackup({}), /Estrutura do backup inválida/);
  assert.throws(() => app.validateBackup(null), /Estrutura do backup inválida/);
});

test('validateBackup recusa identificadores duplicados', async () => {
  const weight = { id: 'a', date: '2026-11-01', value: 80 };
  assert.throws(
    () => app.validateBackup({ applications: [], cycles: [], weights: [weight, { ...weight }] }),
    /Registro inválido em weights/,
  );
});

test('validateBackup recusa aplicação sem compostos válidos', async () => {
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

test('validateBackup recusa peso fora da faixa', async () => {
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

test('validateBackup recusa meta inválida', async () => {
  assert.throws(
    () => app.validateBackup({ applications: [], cycles: [], weights: [], goal: 0 }),
    /Meta inválida/,
  );
});

test('validateBackup recusa lixeira com tipo desconhecido', async () => {
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

test('csvCell neutraliza fórmulas e escapa aspas', async () => {
  assert.equal(app.csvCell('=1+1').startsWith('"\'='), true);
  assert.equal(app.csvCell('@cmd').startsWith('"\'@'), true);
  assert.equal(app.csvCell('texto "com aspas"'), '"texto ""com aspas"""');
  assert.equal(app.csvCell('-1'), '"-1"');
});

test('validateBackup recusa ciclo com identificador malicioso (XSS)', async () => {
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

test('validateBackup aceita ciclo com identificador válido (hex / uuid)', async () => {
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

test('validateBackup recusa aplicação vinculada a cycleId inválido', async () => {
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

test('validateBackup aceita e valida o catálogo de compostos', async () => {
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

test('validateBackup aceita lembretes e recusa repetição inválida', async () => {
  const base = { applications: [], cycles: [], weights: [] };
  assert.equal(
    app.validateBackup({
      ...base,
      reminders: [
        {
          id: 'r1',
          compoundName: 'Semaglutida',
          date: '2026-11-13',
          repeat: 'weekly',
          active: true,
        },
      ],
    }),
    true,
  );
  assert.throws(
    () =>
      app.validateBackup({
        ...base,
        reminders: [{ id: 'r1', compoundName: 'A', date: '2026-11-13', repeat: 'monthly' }],
      }),
    /Lembrete inválido/,
  );
});

test('aplicação pode ser duplicada para uma nova data sem alterar o original', async () => {
  const testApp = await loadApp();
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
  const form = testApp.appFormHTML();
  const rendered = testApp.applications();
  assert.equal(testApp.db.applications.length, 1);
  assert.equal(form.includes('Nova (cópia)'), true);
  assert.equal(form.includes('value="Semaglutida"'), true);
  assert.equal(rendered.includes('data-action="copy-app"'), true);
  assert.equal(rendered.includes('<form'), false);
});

test('index.html não contém handlers onclick inline', async () => {
  assert.equal(/\sonclick=/i.test(html), false);
});

test('menu não exibe a seção Dados', async () => {
  assert.equal(/data-id="dados"/i.test(html), false);
});

test('menu é renderizado em MAIÚSCULAS e sem ícones', async () => {
  const rendered = (await loadApp()).navHTML();
  for (const label of ['INÍCIO', 'APLICAÇÕES', 'CICLOS', 'RELATÓRIOS', 'AJUSTES']) {
    assert.equal(rendered.includes(`>${label}<`), true, label);
  }
  assert.equal(/[⌂♢◷▤⚙]/.test(rendered), false);
});

test('manifest tem ícone maskable próprio e atalhos válidos', async () => {
  const manifest = JSON.parse(
    readFileSync(fileURLToPath(new URL('../manifest.webmanifest', import.meta.url)), 'utf8'),
  );
  assert.equal(
    manifest.icons.some((i) => i.purpose === 'maskable'),
    true,
  );
  for (const s of manifest.shortcuts) {
    assert.match(s.url, /^\.\/\?tab=(inicio|aplicacoes|ciclos|relatorios|configuracoes)$/);
  }
});

test('menu não exibe uma página separada de calendário', async () => {
  assert.equal(/data-id="calendario"/i.test(html), false);
});

test('calendário de aplicações renderiza a grade reutilizável', async () => {
  const testApp = await loadApp();
  const rendered = testApp.calendarPage();
  assert.equal(rendered.includes('Calendário de aplicações'), true);
  assert.equal(rendered.includes('calendar-grid'), true);
});

test('renderização de ciclos utiliza data-action e data-id sem onclick inline', async () => {
  const testApp = await loadApp();
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

test('handleAction gerencia eventos via delegação de data-action e data-id', async () => {
  const testApp = await loadApp();
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

test('uniqueCompoundNames remove duplicados e trata maiúsculas/minúsculas como iguais', async () => {
  const names = ['Semaglutida', ' semaglutida ', 'Semaglutida', 'Liraglutida', 'liraglutida'];
  assert.deepStrictEqual(Array.from(app.uniqueCompoundNames(names)), [
    'Semaglutida',
    'Liraglutida',
  ]);
});

test('uniqueCompoundNames ignora espaços extras e mantém a primeira ocorrência', async () => {
  assert.deepStrictEqual(Array.from(app.uniqueCompoundNames(['A', ' a ', 'A'])), ['A']);
  assert.deepStrictEqual(Array.from(app.uniqueCompoundNames([' X ', 'x', 'Y '])), ['X', 'Y']);
});

test('reminderMatchesDate considera daily e weekly', async () => {
  const weekly = { active: true, date: '2026-11-01', repeat: 'weekly' };
  assert.equal(app.reminderMatchesDate(weekly, '2026-11-01'), true);
  assert.equal(app.reminderMatchesDate(weekly, '2026-11-08'), true);
  assert.equal(app.reminderMatchesDate(weekly, '2026-11-02'), false);

  const daily = { active: true, date: '2026-11-05', repeat: 'daily' };
  assert.equal(app.reminderMatchesDate(daily, '2026-11-07'), true);
  assert.equal(app.reminderMatchesDate(daily, '2026-11-04'), false);
});

test('compoundHistory ordena por data decrescente e filtra pelo composto', async () => {
  app.db.applications = [
    { date: '2026-11-02', compounds: [{ name: 'Semaglutida', dose: 1, unit: 'mg' }] },
    { date: '2026-11-05', compounds: [{ name: 'Semaglutida', dose: 1.5, unit: 'mg' }] },
    { date: '2026-11-03', compounds: [{ name: 'Liraglutida', dose: 0.5, unit: 'mg' }] },
  ];
  const history = app.compoundHistory('semaglutida');
  assert.equal(history.length, 2);
  assert.equal(history[0].date, '2026-11-05');
  assert.equal(history[1].date, '2026-11-02');
});

test('lastCompoundEntry retorna a última entrada de um composto', async () => {
  app.db.applications = [
    { date: '2026-11-01', compounds: [{ name: 'Semaglutida', dose: 1, unit: 'mg' }] },
    { date: '2026-11-03', compounds: [{ name: 'Semaglutida', dose: 1.5, unit: 'mg' }] },
  ];
  assert.equal(app.lastCompoundEntry('Semaglutida').dose, 1.5);
});

test('homeCalendar mostra os compostos de cada dia e gera acesso rápido por data', async () => {
  app.db.applications = [
    {
      date: '2026-11-01',
      time: '08:00',
      site: 'Abdômen',
      compounds: [{ name: 'Semaglutida', dose: 1, unit: 'mg' }],
    },
    {
      date: '2026-11-01',
      time: '09:00',
      site: 'Coxa',
      compounds: [{ name: 'Liraglutida', dose: 0.5, unit: 'mg' }],
    },
    {
      date: '2026-11-02',
      time: '08:30',
      site: 'Braço',
      compounds: [{ name: 'Semaglutida', dose: 1, unit: 'mg' }],
    },
  ];
  const html = app.homeCalendar();
  assert.match(html, /data-action="quick-register-date"/);
  assert.match(html, /data-id="2026-11-01"/);
  assert.match(html, /data-id="2026-11-02"/);

  // O mês de 01/11 contém os dois compostos (duas aplicações na mesma data);
  // o dia 02 contém apenas o Semaglutida.
  assert.match(html, /data-id="2026-11-01"[\s\S]*?Semaglutida/);
  assert.match(html, /data-id="2026-11-01"[\s\S]*?Liraglutida/);
  assert.match(html, /data-id="2026-11-02"[\s\S]*?Semaglutida/);
});

test('compoundsOnDate lista os compostos aplicados no dia sem duplicar nomes', async () => {
  const testApp = await loadApp();
  testApp.db.applications = [
    { date: '2026-11-14', compounds: [{ name: 'Semaglutida' }, { name: 'semaglutida' }] },
    { date: '2026-11-14', compounds: [{ name: 'BPC-157' }] },
  ];
  assert.deepEqual(Array.from(testApp.compoundsOnDate('2026-11-14')), ['Semaglutida', 'BPC-157']);
});

test('relatórios não exibem recursos de peso', async () => {
  const testApp = await loadApp();
  const rendered = testApp.reports();
  assert.equal(rendered.includes('Pesagens'), false);
  assert.equal(rendered.includes('Evolução de peso'), false);
  assert.equal(rendered.includes('CSV peso'), false);
});

// A sincronização usa uma marca local para saber se há alteração ainda não enviada.
test('salvar marca alteração pendente e o envio concluído limpa a marca', async () => {
  const testApp = await loadApp();
  testApp.updateSupabaseClient({});
  testApp.updateSupabaseUser({ id: 'u1' });
  assert.equal(testApp.hasPendingPush(), false);
  testApp.scheduleCloudSync();
  assert.equal(testApp.hasPendingPush(), true);
  testApp.clearPendingPush();
  assert.equal(testApp.hasPendingPush(), false);
});

test('syncWithCloud envia a alteração pendente e depois se alinha com a nuvem', async () => {
  const testApp = await loadApp();
  testApp.calls = [];
  testApp.updateSupabaseClient({});
  testApp.updateSupabaseUser({ id: 'u1' });
  testApp.cloudHooks.pushToCloud = async () => {
    testApp.calls.push('push');
    return true;
  };
  testApp.cloudHooks.pullFromCloud = async (opts) => {
    testApp.calls.push('pull:' + JSON.stringify(opts || {}));
  };
  testApp.markPendingPush();
  await testApp.syncWithCloud();
  assert.deepEqual(Array.from(testApp.calls), ['push', 'pull:{"replaceLocal":true}']);
});

test('syncWithCloud baixa a nuvem quando não há nada pendente', async () => {
  const testApp = await loadApp();
  testApp.calls = [];
  testApp.updateSupabaseClient({});
  testApp.updateSupabaseUser({ id: 'u1' });
  testApp.cloudHooks.pushToCloud = async () => {
    testApp.calls.push('push');
    return true;
  };
  testApp.cloudHooks.pullFromCloud = async (opts) => {
    testApp.calls.push('pull:' + JSON.stringify(opts || {}));
  };
  testApp.clearPendingPush();
  await testApp.syncWithCloud();
  assert.deepEqual(Array.from(testApp.calls), ['pull:{"replaceLocal":true}']);
});

test('syncWithCloud não faz nada sem conta conectada', async () => {
  const testApp = await loadApp();
  testApp.calls = [];
  testApp.cloudHooks.pushToCloud = async () => {
    testApp.calls.push('push');
    return true;
  };
  testApp.cloudHooks.pullFromCloud = async () => {
    testApp.calls.push('pull');
  };
  await testApp.syncWithCloud();
  assert.deepEqual(Array.from(testApp.calls), []);
});

test('runMigrations preenche updatedAt, deleted e schemaVersion', async () => {
  const result = app.runMigrations({
    applications: [{ id: 'a1', date: '2026-11-01', compounds: [{ name: 'A', dose: 1, unit: 'mg' }] }],
    cycles: [],
    weights: [],
  });
  assert.equal(result.schemaVersion, 3);
  assert.equal(Array.isArray(result.deleted), true);
  assert.equal(typeof result.applications[0].updatedAt, 'string');
});

test('runMigrations preserva schemaVersion já atual', async () => {
  const result = app.runMigrations({
    applications: [],
    cycles: [],
    weights: [],
    schemaVersion: 3,
    deleted: [],
  });
  assert.equal(result.schemaVersion, 3);
});

test('validateBackup recusa backup de versão futura', async () => {
  assert.throws(
    () =>
      app.validateBackup({
        applications: [],
        cycles: [],
        weights: [],
        schemaVersion: 99,
      }),
    /versão mais nova/,
  );
});

test('mergeDb mantém o registro com updatedAt mais recente', async () => {
  const local = {
    applications: [
      { id: 'a1', date: '2026-11-01', updatedAt: '2026-11-01T10:00:00Z', compounds: [{ name: 'A', dose: 1, unit: 'mg' }] },
    ],
    cycles: [],
    weights: [],
  };
  const cloud = {
    applications: [
      { id: 'a1', date: '2026-11-01', updatedAt: '2026-11-02T10:00:00Z', compounds: [{ name: 'B', dose: 1, unit: 'mg' }] },
    ],
    cycles: [],
    weights: [],
  };
  const merged = app.mergeDb(local, cloud);
  assert.equal(merged.applications.length, 1);
  assert.equal(merged.applications[0].compounds[0].name, 'B');
});

test('mergeDb remove registro com tombstone mais recente', async () => {
  const local = {
    applications: [
      { id: 'a1', date: '2026-11-01', updatedAt: '2026-11-01T10:00:00Z', compounds: [{ name: 'A', dose: 1, unit: 'mg' }] },
    ],
    cycles: [],
    weights: [],
    deleted: [{ type: 'applications', id: 'a1', deletedAt: '2026-11-02T10:00:00Z' }],
  };
  const merged = app.mergeDb(local, { applications: [], cycles: [], weights: [] });
  assert.equal(merged.applications.length, 0);
});
