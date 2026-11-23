import { test as base, expect } from '@playwright/test';
import { allowlist } from './console-allowlist.mjs';

function permitido(texto) {
  return allowlist.some((re) => re.test(texto));
}

export const test = base.extend({
  page: async ({ page }, use) => {
    const problemas = [];
    page.on('console', (msg) => {
      if (!['error', 'warning'].includes(msg.type())) return;
      const texto = msg.text();
      if (!permitido(texto)) problemas.push(`console.${msg.type()}: ${texto}`);
    });
    page.on('pageerror', (erro) => {
      if (!permitido(erro.message)) problemas.push(`pageerror: ${erro.message}`);
    });
    page.on('requestfailed', (req) => {
      const texto = `${req.url()} ${req.failure()?.errorText || ''}`;
      if (!permitido(texto)) problemas.push(`requestfailed: ${texto}`);
    });
    await use(page);
    expect(problemas, 'O navegador registrou erros ou avisos:').toEqual([]);
  },
});

export { expect };
