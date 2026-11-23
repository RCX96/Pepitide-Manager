import assert from 'node:assert/strict';
import test from 'node:test';

function hexToRgb(hex) {
  const clean = hex.replace('#', '').trim();
  const num = parseInt(clean, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

function luminance({ r, g, b }) {
  const a = [r, g, b].map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
}

function contrastRatio(hex1, hex2) {
  const lum1 = luminance(hexToRgb(hex1));
  const lum2 = luminance(hexToRgb(hex2));
  const brightest = Math.max(lum1, lum2);
  const darkest = Math.min(lum1, lum2);
  return (brightest + 0.05) / (darkest + 0.05);
}

test('contraste no tema escuro atende WCAG AA', () => {
  const textOnBg = contrastRatio('#e8f0ff', '#08111f');
  assert.ok(textOnBg >= 4.5, `Texto principal no fundo escuro: ${textOnBg.toFixed(2)}`);

  const textOnPanel = contrastRatio('#e8f0ff', '#0f1d32');
  assert.ok(textOnPanel >= 4.5, `Texto no painel escuro: ${textOnPanel.toFixed(2)}`);

  const mutedOnBg = contrastRatio('#91a4bf', '#08111f');
  assert.ok(mutedOnBg >= 4.5, `Texto atenuado no fundo escuro: ${mutedOnBg.toFixed(2)}`);

  const accentInkOnAccent = contrastRatio('#07151e', '#62e6d5');
  assert.ok(accentInkOnAccent >= 4.5, `Texto escuro sobre acento ciano: ${accentInkOnAccent.toFixed(2)}`);

  const dangerOnBg = contrastRatio('#fb7185', '#08111f');
  assert.ok(dangerOnBg >= 4.5, `Cor de perigo no fundo escuro: ${dangerOnBg.toFixed(2)}`);
});

test('contraste no tema claro atende WCAG AA', () => {
  const textOnBg = contrastRatio('#0b1a2e', '#f4f7fb');
  assert.ok(textOnBg >= 4.5, `Texto principal no fundo claro: ${textOnBg.toFixed(2)}`);

  const textOnPanel = contrastRatio('#0b1a2e', '#ffffff');
  assert.ok(textOnPanel >= 4.5, `Texto no painel claro: ${textOnPanel.toFixed(2)}`);

  const mutedOnBg = contrastRatio('#43556f', '#f4f7fb');
  assert.ok(mutedOnBg >= 4.5, `Texto atenuado no fundo claro: ${mutedOnBg.toFixed(2)}`);

  const accentOnWhite = contrastRatio('#0b756a', '#ffffff');
  assert.ok(accentOnWhite >= 4.5, `Acento verde-petróleo sobre branco: ${accentOnWhite.toFixed(2)}`);

  const dangerOnWhite = contrastRatio('#c0243f', '#ffffff');
  assert.ok(dangerOnWhite >= 4.5, `Cor de perigo sobre branco: ${dangerOnWhite.toFixed(2)}`);
});
