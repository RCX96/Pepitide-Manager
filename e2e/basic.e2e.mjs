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
