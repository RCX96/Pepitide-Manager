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
