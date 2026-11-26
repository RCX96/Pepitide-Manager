import { test, expect } from '@playwright/test';

const date = '2026-11-22';
const compounds = [
  { name: 'Composto A', dose: 1, unit: 'mg' },
  { name: 'Composto B', dose: 25, unit: 'mcg' },
];
const original = {
  id: 'a2',
  date,
  time: '18:30',
  cycleId: 'c1d2',
  notes: 'Nota original',
  compounds,
};
const key = 'peptide-manager-v1';
const stored = (page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)).applications, key);
const modal = (page) => page.locator('dialog#appFormDialog');
const openNew = (page) => page.getByRole('button', { name: 'Nova aplicação' }).click();
const row = (page) => page.locator('#applicationList .item').filter({ hasText: 'Nota original' });
const submit = (page) => modal(page).locator('button[type=submit]').click();
async function seed(page, records = [], cycleOverrides = {}) {
  await page.addInitScript(
    ({ key, records, cycleOverrides }) => {
      if (localStorage.getItem(key)) return;
      const updatedAt = new Date().toISOString();
      localStorage.setItem(
        key,
        JSON.stringify({
          applications: records.map((a) => ({ ...a, updatedAt })),
          cycles: [
            {
              id: 'c1d2',
              name: 'Ciclo teste',
              start: '2026-11-01',
              end: '2026-11-30',
              status: 'active',
              notes: '',
              pauses: [],
              updatedAt,
              ...cycleOverrides,
            },
          ],
          weights: [],
          goal: null,
          trash: [],
          compoundCatalog: [],
          reminders: [],
          deleted: [],
          schemaVersion: 3,
        }),
      );
    },
    { key, records, cycleOverrides },
  );
}

for (const entry of ['Registrar aplicação', 'Nova aplicação']) {
  test(`${entry}: X, fundo, Esc, foco e formulário limpo`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await seed(page);
    await page.goto(entry === 'Nova aplicação' ? '/?tab=aplicacoes' : '/');
    const trigger = page.getByRole('button', { name: entry });
    for (const dismiss of [
      () => modal(page).getByRole('button', { name: 'Fechar' }).click(),
      () => page.mouse.click(5, 5),
      () => page.keyboard.press('Escape'),
    ]) {
      await trigger.click();
      await expect(modal(page)).toHaveCount(1);
      await expect(modal(page).locator('#appDate')).toBeFocused();
      await expect(modal(page).locator('#compoundName0')).toHaveValue('');
      await modal(page).locator('#appNotes').fill('Descartar');
      await dismiss();
      await expect(modal(page)).toHaveCount(0);
      await expect(trigger).toBeFocused();
      expect(await stored(page)).toHaveLength(0);
    }
    await trigger.click();
    await expect(modal(page).locator('#appNotes')).toHaveValue('');
  });
}
test('histórico vazio: Registrar a primeira aplicação abre o popup', async ({ page }) => {
  await seed(page);
  await page.goto('/?tab=aplicacoes');
  await page.getByRole('button', { name: 'Registrar a primeira aplicação' }).click();
  await expect(modal(page)).toBeVisible();
});
test('Editar preenche todos os campos e persiste alteração no mesmo ID', async ({ page }) => {
  await seed(page, [original]);
  await page.goto('/?tab=aplicacoes');
  await row(page).getByRole('button', { name: 'Editar' }).click();
  for (const [selector, value] of Object.entries({
    '#appDate': date,
    '#appTime': '18:30',
    '#appCycle': 'c1d2',
    '#appNotes': 'Nota original',
    '#compoundName0': 'Composto A',
    '#compoundDose0': '1',
    '#compoundUnit0': 'mg',
    '#compoundName1': 'Composto B',
    '#compoundDose1': '25',
    '#compoundUnit1': 'mcg',
  })) {
    await expect(modal(page).locator(selector)).toHaveValue(value);
  }
  await modal(page).locator('#appNotes').fill('Nota editada');
  await submit(page);
  await expect(modal(page)).toHaveCount(0);
  await page.reload();
  expect(await stored(page)).toMatchObject([{ ...original, notes: 'Nota editada' }]);
});
test('Voltar durante edição não cria uma segunda aplicação', async ({ page }) => {
  await seed(page, [original]);
  await page.goto('/');
  await page.getByRole('button', { name: 'APLICAÇÕES', exact: true }).click();
  await row(page).getByRole('button', { name: 'Editar' }).click();
  await modal(page).locator('#appNotes').fill('Edição com Voltar');
  await page.goBack();
  await expect(page.locator('#app')).toHaveAttribute('data-tab', 'inicio');
  await expect(modal(page)).toHaveCount(0);
  expect(await stored(page)).toMatchObject([original]);
});
for (const action of ['Duplicar', 'Repetir último registro']) {
  test(`${action}: compostos copiados, novo ID e original intacto`, async ({ page }) => {
    const earlier = {
      ...original,
      id: 'a1',
      time: '08:00',
      notes: 'Nota anterior',
      compounds: [{ name: 'Outro', dose: 2, unit: 'mg' }],
    };
    await seed(page, [earlier, original]);
    await page.goto(action === 'Duplicar' ? '/?tab=aplicacoes' : '/');
    const old = await stored(page);
    await (action === 'Duplicar' ? row(page) : page).getByRole('button', { name: action }).click();
    const today = await page.evaluate(() => new Date().toLocaleDateString('en-CA'));
    for (const [selector, value] of Object.entries({
      '#appDate': today,
      '#appTime': '',
      '#appNotes': '',
      '#appCycle': '',
      '#compoundName0': 'Composto A',
      '#compoundDose0': '1',
      '#compoundUnit0': 'mg',
      '#compoundName1': 'Composto B',
      '#compoundDose1': '25',
      '#compoundUnit1': 'mcg',
    })) {
      await expect(modal(page).locator(selector)).toHaveValue(value);
    }
    await modal(page).locator('#appCycle').selectOption('c1d2');
    await submit(page);
    await expect(modal(page)).toHaveCount(0);
    const result = await stored(page);
    expect(result).toHaveLength(3);
    expect(result.filter((a) => ['a1', 'a2'].includes(a.id))).toEqual(old);
    expect(result.find((a) => !['a1', 'a2'].includes(a.id))).toMatchObject({
      date: today,
      cycleId: 'c1d2',
      compounds,
    });
  });
}
for (const view of ['Mês', 'Semana']) {
  test(`Calendário ${view}: seleciona dia e abre cadastro com a data`, async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-11-22T15:00:00Z'));
    await seed(page, [original]);
    await page.goto('/');
    await page.getByRole('button', { name: view, exact: true }).click();
    for (const day of [date, '2026-11-21']) {
      const dayButton = page.locator(`.calendar-day[data-id="${day}"]`);
      await dayButton.click();
      await expect(dayButton).toHaveAttribute('aria-pressed', 'true');
      await expect(modal(page)).toHaveCount(0);
      await expect(page.locator('.calendar-list')).toContainText(
        day === date ? 'Nota original' : 'Nenhuma aplicação registrada neste dia.',
      );
      const register = page
        .locator('.calendar-list')
        .getByRole('button', { name: 'Nova aplicação' });
      await register.click();
      await expect(modal(page).locator('#appDate')).toHaveValue(day);
      await page.keyboard.press('Escape');
      await expect(register).toBeFocused();
    }
  });
}
test('Falha de persistência mantém rascunho e permite tentar novamente', async ({ page }) => {
  await seed(page);
  await page.goto('/?tab=aplicacoes');
  await openNew(page);
  await modal(page).locator('#appCycle').selectOption('c1d2');
  await modal(page).locator('#compoundName0').fill('Falha teste');
  await modal(page).locator('#compoundDose0').fill('1');
  await page.evaluate((key) => {
    const write = Storage.prototype.setItem;
    window.restoreStorageWrite = () => {
      Storage.prototype.setItem = write;
    };
    Storage.prototype.setItem = function (name, value) {
      if (name === key) throw new DOMException('Falha simulada', 'QuotaExceededError');
      return write.call(this, name, value);
    };
  }, key);
  await submit(page);
  expect(await stored(page)).toHaveLength(0);
  await expect(modal(page).getByRole('alert')).toContainText('Não foi possível salvar a aplicação');
  await expect(modal(page).locator('#compoundName0')).toHaveValue('Falha teste');
  await page.evaluate(() => window.restoreStorageWrite());
  await submit(page);
  await expect(modal(page)).toHaveCount(0);
  expect(await stored(page)).toHaveLength(1);
});

test('histórico combina filtros com busca e limpa todos os campos', async ({ page }) => {
  await seed(page, [
    original,
    { ...original, id: 'a3', date: '2026-11-21', notes: 'Registro anterior' },
    { ...original, id: 'a4', compounds: [{ name: 'Outro', dose: 1, unit: 'mg' }] },
    { ...original, id: 'a5', cycleId: null, notes: 'Sem vínculo' },
  ]);
  await page.goto('/?tab=aplicacoes');
  const list = page.locator('#applicationList');
  await expect(list.locator('.item')).toHaveCount(4);
  await page.getByLabel('Ciclo', { exact: true }).selectOption('c1d2');
  await expect(list.locator('.item')).toHaveCount(3);
  await page.getByLabel('Composto', { exact: true }).selectOption({ label: 'Composto B' });
  await expect(list.locator('.item')).toHaveCount(2);
  await page.getByLabel('De', { exact: true }).fill(date);
  await page.getByLabel('Até', { exact: true }).fill(date);
  await expect(list.locator('.item')).toHaveCount(1);
  await expect(list).toContainText('Nota original');
  await page.getByRole('searchbox').fill('sem correspondência');
  await expect(list).toContainText('Nenhuma aplicação corresponde aos filtros.');
  await page.getByRole('button', { name: 'Limpar filtros' }).click();
  await expect(list.locator('.item')).toHaveCount(4);
  await expect(page.getByRole('searchbox')).toHaveValue('');
  for (const field of ['Ciclo', 'Composto', 'De', 'Até']) {
    await expect(page.getByLabel(field, { exact: true })).toHaveValue('');
  }
});

test('edita e duplica pelo calendário, preservando o dia ao recarregar', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-22T15:00:00Z'));
  await seed(page, [original]);
  await page.goto('/');
  await page.getByRole('button', { name: 'Mês', exact: true }).click();
  await page.locator(`.calendar-day[data-id="${date}"]`).click();
  const list = page.locator('.calendar-list');
  await list.getByRole('button', { name: 'Editar' }).click();
  await modal(page).locator('#appNotes').fill('Editado pelo calendário');
  await submit(page);
  await expect(list).toContainText('Editado pelo calendário');
  await list.getByRole('button', { name: 'Duplicar' }).click();
  await expect(modal(page).locator('#compoundName0')).toHaveValue('Composto A');
  await modal(page).locator('#appCycle').selectOption('c1d2');
  await submit(page);
  await page.reload();
  await expect(page.locator('.calendar-grid')).not.toHaveClass(/calendar-week-grid/);
  await expect(page.locator(`.calendar-day[data-id="${date}"]`)).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(list.locator('.item')).toHaveCount(2);
  expect((await stored(page)).find((entry) => entry.id === original.id).notes).toBe(
    'Editado pelo calendário',
  );
});

test('desfaz a exclusão e restaura o ID original após recarregar', async ({ page }) => {
  await seed(page, [original]);
  await page.goto('/?tab=aplicacoes');
  await row(page).getByRole('button', { name: 'Excluir' }).click();
  await page.locator('#confirmYes').click();
  expect(await stored(page)).toHaveLength(0);
  await page.getByRole('button', { name: 'Desfazer' }).click();
  await expect(page.getByText('Registro restaurado.')).toBeVisible();
  await page.reload();
  expect(await stored(page)).toMatchObject([original]);
  const { trash, deleted } = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)),
    key,
  );
  expect(trash).toHaveLength(0);
  expect(deleted).toHaveLength(0);
});

test('abre o histórico do ciclo, exporta somente a lista filtrada e mantém preferências', async ({
  page,
}) => {
  await seed(page, [
    original,
    { ...original, id: 'a3', date: '2026-11-21', notes: 'Anterior no ciclo' },
    { ...original, id: 'a4', cycleId: null, notes: 'Fora do ciclo' },
  ]);
  await page.goto('/?tab=ciclos');
  await expect(
    page.getByText('Primeira aplicação: 21/11/2026 • Última aplicação: 22/11/2026'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Ver aplicações' }).click();
  await expect(page.getByLabel('Ciclo', { exact: true })).toHaveValue('c1d2');
  const csv = page.getByRole('button', { name: 'Exportar CSV (2)', exact: true });
  const [download] = await Promise.all([page.waitForEvent('download'), csv.click()]);
  const { readFile } = await import('node:fs/promises');
  const content = await readFile(await download.path(), 'utf8');
  expect(content).toContain('Anterior no ciclo');
  expect(content).toContain('Nota original');
  expect(content).not.toContain('Fora do ciclo');
  const history = page.locator('.history-panel');
  await history.locator('summary').click();
  await expect(history).not.toHaveAttribute('open');
  await page.reload();
  await expect(history).not.toHaveAttribute('open');
  await expect(page.getByLabel('Ciclo', { exact: true })).toHaveValue('c1d2');
  await expect(csv).toBeVisible();
});

test('mostra detalhes da sincronização e permite tentar novamente', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    const state = await import('/js/state.js');
    const { syncHeader } = await import('/js/ui.js');
    const { cloudHooks, clearPendingPush, markPendingPush } = await import('/js/sync.js');
    state.updateSupabaseClient({});
    state.updateSupabaseUser({ id: 'test', email: 'test@example.com' });
    state.updateSupabaseLastSync('16:30');
    state.updateSupabaseSyncStatus('Alterações pendentes');
    markPendingPush();
    cloudHooks.pushToCloud = async () => {
      clearPendingPush();
      state.updateSupabaseSyncStatus('Sincronizado');
      state.updateSupabaseLastSync('16:31');
      return true;
    };
    cloudHooks.pullFromCloud = async () => {};
    syncHeader();
  });
  await page.getByRole('button', { name: 'Pendente', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Sincronização' });
  await expect(dialog).toContainText('16:30');
  await expect(dialog).toContainText('1 envio pendente');
  await dialog.getByRole('button', { name: 'Sincronizar agora' }).click();
  await expect(dialog).toContainText('16:31');
  await expect(dialog).toContainText('Nenhum envio pendente');
});

test('remover pausa aberta retoma o ciclo e preserva as aplicações e outras pausas', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date('2026-11-22T15:00:00Z'));
  const closedPause = { start: '2026-11-08', end: '2026-11-10' };
  await seed(page, [original], {
    status: 'paused',
    pauses: [closedPause, { start: '2026-11-21', end: null }],
  });
  await page.goto('/?tab=ciclos');
  await expect(page.getByText('18 dias ativos', { exact: true })).toBeVisible();
  await page.getByText('Pausas (2)', { exact: true }).click();
  const openPause = page.locator('[data-action="remove-cycle-pause"][data-id="c1d2:1"]');
  await openPause.click();
  const dialog = page.getByRole('dialog', { name: 'Remover pausa' });
  await expect(dialog).toContainText('21/11/2026 (em andamento)');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(openPause).toBeVisible();
  await openPause.click();
  await dialog.getByRole('button', { name: 'Remover', exact: true }).click();
  await expect(page.getByText('20 dias ativos', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator('.pill.active')).toHaveText('Em andamento');
  const state = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), key);
  expect(state.cycles[0]).toMatchObject({
    status: 'active',
    pauses: [closedPause],
    end: '2026-11-30',
  });
  expect(state.applications).toMatchObject([original]);
});

test('remover pausa encerrada recalcula dias de um ciclo finalizado', async ({ page }) => {
  await seed(page, [original], {
    end: date,
    status: 'finished',
    pauses: [{ start: '2026-11-08', end: '2026-11-10' }],
  });
  await page.goto('/?tab=ciclos');
  await page.getByText('Ciclos finalizados (1)', { exact: true }).click();
  await expect(page.getByText('20 dias ativos', { exact: true })).toBeVisible();
  await page.getByText('Pausas (1)', { exact: true }).click();
  await page.getByRole('button', { name: 'Remover pausa', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Remover pausa' });
  await expect(dialog).toContainText('08/11/2026 até 10/11/2026');
  await dialog.getByRole('button', { name: 'Remover', exact: true }).click();
  await expect(page.getByText('22 dias ativos', { exact: true })).toBeVisible();
  const state = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), key);
  expect(state.cycles[0]).toMatchObject({ status: 'finished', pauses: [], end: date });
  expect(state.applications).toMatchObject([original]);
});
