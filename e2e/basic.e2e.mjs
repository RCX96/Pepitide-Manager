import { test, expect } from '@playwright/test';

test('abre a tela inicial e mostra o calendário', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Calendário de aplicações')).toBeVisible();
  await expect(page.locator('#bottom-nav')).toBeVisible();
});

test('navega entre as abas principais', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /ciclos/i }).click();
  await expect(page.getByText('Ciclos salvos')).toBeVisible();
  await page.getByRole('button', { name: /ajustes/i }).click();
  await expect(page.getByRole('heading', { name: 'Ajustes' })).toBeVisible();
});

test('cria um ciclo e registra uma aplicação', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /ciclos/i }).click();
  await page.locator('input[name="name"]').fill('Ciclo E2E');
  await page.getByRole('button', { name: 'Salvar ciclo' }).click();
  await expect(page.getByText('Ciclo E2E')).toBeVisible();
  await page.getByRole('button', { name: 'APLICAÇÕES' }).click();
  await page.locator('#compoundName0').fill('Semaglutida');
  await page.locator('#compoundDose0').fill('1');
  await page.locator('select[name="cycleId"]').selectOption({ label: 'Ciclo E2E' });
  await page.getByRole('button', { name: /Salvar aplicação/ }).click();
  await expect(page.getByText('Semaglutida (1 mg)')).toBeVisible();
});

test('busca sem perder o foco', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'APLICAÇÕES' }).click();
  const search = page.locator('#applicationSearch');
  await search.click();
  await search.type('sema');
  await expect(search).toBeFocused();
  await expect(search).toHaveValue('sema');
});

test('abre a aba pela URL e volta com o botão do navegador', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'CICLOS' }).click();
  await expect(page).toHaveURL(/tab=ciclos/);
  await expect(page.getByText('Ciclos salvos')).toBeVisible();
  await page.goBack();
  await expect(page.getByText('Calendário de aplicações')).toBeVisible();
});

test('editar aplicação foca o primeiro campo do formulário', async ({ page }) => {
  await page.goto('/?tab=ciclos');
  await page.locator('input[name="name"]').fill('Ciclo foco');
  await page.getByRole('button', { name: 'Salvar ciclo' }).click();
  await page.goto('/?tab=aplicacoes');
  await page.locator('#compoundName0').fill('Foco');
  await page.locator('#compoundDose0').fill('1');
  await page.locator('select[name="cycleId"]').selectOption({ label: 'Ciclo foco' });
  await page.getByRole('button', { name: /Salvar aplicação/ }).click();
  await page.getByRole('button', { name: 'Editar' }).click();
  await expect(page.locator('#appDate')).toBeFocused();
});

test('validação inline marca o campo inválido', async ({ page }) => {
  await page.goto('/?tab=ciclos');
  await page.locator('input[name="name"]').fill('Ciclo validação');
  await page.getByRole('button', { name: 'Salvar ciclo' }).click();
  await page.goto('/?tab=aplicacoes');
  await page.locator('select[name="cycleId"]').selectOption({ label: 'Ciclo validação' });
  await page.getByRole('button', { name: /Salvar aplicação/ }).click();
  await expect(page.locator('#compoundName0')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByText('Preencha o nome e uma dose maior que zero para cada composto.').first()).toBeVisible();
});

test('mostra e esconde o aviso de offline', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#offlineBanner')).toBeHidden();
  await page.context().setOffline(true);
  await expect(page.locator('#offlineBanner')).toBeVisible();
  await page.context().setOffline(false);
  await expect(page.locator('#offlineBanner')).toBeHidden();
});

test('busca vem antes do histórico de aplicações no celular', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?tab=aplicacoes');
  const search = await page.locator('.quick-filter').boundingBox();
  const history = await page.locator('.history-panel').boundingBox();
  const compound = await page.locator('.compound-history-panel').boundingBox();
  expect(search.y).toBeLessThan(history.y);
  expect(history.y).toBeLessThan(compound.y);
});

test('formulário e consultas ficam em colunas no desktop', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/?tab=aplicacoes');
  const form = await page.locator('.app-form-panel').boundingBox();
  const search = await page.locator('.quick-filter').boundingBox();
  const history = await page.locator('.history-panel').boundingBox();
  expect(form.x).toBeLessThan(history.x);
  expect(search.x).toBeGreaterThan(form.x);
  expect(search.y).toBeLessThan(history.y);
});

test('relatórios mostram resumo, filtros, gráficos e tabelas nessa ordem', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?tab=relatorios');
  const y = async (selector) => (await page.locator(selector).boundingBox()).y;
  expect(await y('.report-metrics')).toBeLessThan(await y('.report-filters'));
  expect(await y('.report-tables')).toBeGreaterThan(await y('.report-filters'));
});

test('tabelas de relatórios usam a largura da página no desktop', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/?tab=relatorios');
  const tables = await page.locator('.report-tables').boundingBox();
  expect(tables.width).toBeGreaterThan(700);
});

test('tabelas de relatórios ficam empilhadas, largas e recolhíveis', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.addInitScript(() => {
    const now = new Date().toISOString();
    localStorage.setItem(
      'peptide-manager-v1',
      JSON.stringify({
        applications: [
          {
            id: 'a1b2',
            date: '2026-11-22',
            time: '08:00',
            cycleId: 'c1d2',
            notes: '',
            compounds: [{ name: 'Exemplo', dose: 1, unit: 'mg' }],
            updatedAt: now,
          },
        ],
        cycles: [
          {
            id: 'c1d2',
            name: 'Ciclo exemplo',
            start: '2026-11-01',
            end: '2026-11-30',
            status: 'active',
            notes: '',
            pauses: [],
            updatedAt: now,
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
  });
  await page.goto('/?tab=relatorios');
  const sections = page.locator('details.report-section');
  await expect(sections).toHaveCount(2);
  const apps = await sections.nth(0).boundingBox();
  const cycles = await sections.nth(1).boundingBox();
  expect(apps.y).toBeLessThan(cycles.y);
  expect(apps.width).toBeGreaterThan(700);
  expect(cycles.width).toBeGreaterThan(700);
  const table = sections.nth(0).locator('table');
  await expect(table).toBeVisible();
  await sections.nth(0).locator('summary').click();
  await expect(table).toBeHidden();
  await sections.nth(0).locator('summary').click();
  await expect(table).toBeVisible();
});

test('ajustes não duplica catálogo nem backup criptografado', async ({ page }) => {
  await page.goto('/?tab=configuracoes');
  await expect(page.getByRole('heading', { name: 'Catálogo de compostos' })).toHaveCount(1);
  await expect(page.getByRole('heading', { name: 'Backup criptografado' })).toHaveCount(1);
});

test('histórico de aplicações pode ser recolhido', async ({ page }) => {
  await page.goto('/?tab=aplicacoes');
  const section = page.locator('details.history-panel');
  await expect(section).toHaveCount(1);
  const list = section.locator('#applicationList');
  await expect(list).toBeVisible();
  await section.locator('summary').click();
  await expect(list).toBeHidden();
  await section.locator('summary').click();
  await expect(list).toBeVisible();
});

test('gráfico semanal se estende alinhado aos filtros no desktop', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.addInitScript(() => {
    const now = new Date().toISOString();
    localStorage.setItem(
      'peptide-manager-v1',
      JSON.stringify({
        applications: [
          {
            id: 'a1b2',
            date: '2026-11-22',
            time: '08:00',
            cycleId: 'c1d2',
            notes: '',
            compounds: [{ name: 'Exemplo', dose: 1, unit: 'mg' }],
            updatedAt: now,
          },
        ],
        cycles: [
          {
            id: 'c1d2',
            name: 'Ciclo exemplo',
            start: '2026-11-01',
            end: '2026-11-30',
            status: 'active',
            notes: '',
            pauses: [],
            updatedAt: now,
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
  });
  await page.goto('/?tab=relatorios');
  const filters = await page.locator('.report-filters').boundingBox();
  const weekly = await page.locator('.chart-block').first().boundingBox();
  const compounds = await page.locator('.chart-block').nth(1).boundingBox();
  expect(weekly.width).toBeGreaterThan(filters.width);
  expect(weekly.y).toBeLessThan(compounds.y);
});
