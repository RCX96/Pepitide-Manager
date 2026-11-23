import { LEGACY_LOCK_KEY, LOCK_KEY, updateUnlocked } from './state.js';
import { promptDialog, render, showToast } from './ui.js';
import { $, base64ToBytes, bytesToBase64, hashText } from './util.js';

export async function deriveLockHash(password, salt, iterations) {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    material,
    256,
  );
  return bytesToBase64(new Uint8Array(bits));
}

export function getLockData() {
  try {
    const raw = localStorage.getItem(LOCK_KEY);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function verifyLock(code) {
  const data = getLockData();
  if (!data) {
    return false;
  }
  // migration from v1
  const legacy = localStorage.getItem(LEGACY_LOCK_KEY);
  if (legacy && !data.migrated) {
    // accept legacy hash once
    let legacyHash = legacy;
    if (crypto?.subtle) {
      legacyHash = await hashText(code);
    }
    if (legacyHash === legacy) {
      // migrate
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const iterations = 600000;
      const hash = await deriveLockHash(code, salt, iterations);
      localStorage.setItem(
        LOCK_KEY,
        JSON.stringify({ salt: bytesToBase64(salt), iterations, hash, migrated: true }),
      );
      localStorage.removeItem(LEGACY_LOCK_KEY);
      return true;
    }
    return false;
  }
  const salt = base64ToBytes(data.salt);
  const hash = await deriveLockHash(code, salt, data.iterations || 600000);
  return hash === data.hash;
}

export async function setLock() {
  if (!crypto?.subtle) {
    showToast('O bloqueio exige HTTPS ou ambiente seguro.');
    return;
  }
  const first = await promptDialog({
    title: 'Código local',
    text: 'Crie um código com pelo menos 6 caracteres:',
    type: 'password',
  });
  if (!first || first.length < 6) {
    showToast('O código precisa ter pelo menos 6 caracteres.');
    return;
  }
  const second = await promptDialog({
    title: 'Confirmar',
    text: 'Repita o código:',
    type: 'password',
  });
  if (first !== second) {
    showToast('Os códigos não conferem.');
    return;
  }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iterations = 600000;
  const hash = await deriveLockHash(first, salt, iterations);
  localStorage.setItem(LOCK_KEY, JSON.stringify({ salt: bytesToBase64(salt), iterations, hash }));
  updateUnlocked(true);
  showToast('Código local criado.');
  render();
}

export async function removeLock() {
  const code = await promptDialog({
    title: 'Remover proteção',
    text: 'Digite o código atual:',
    type: 'password',
  });
  if (!code || !(await verifyLock(code))) {
    showToast('Código incorreto.');
    return;
  }
  localStorage.removeItem(LOCK_KEY);
  showToast('Proteção removida.');
  render();
}

export async function unlockApp() {
  const input = $('unlockCode');
  const code = input ? input.value : '';
  // rate limiting
  const attempts = Number(localStorage.getItem('peptide-lock-attempts') || '0');
  const lockUntil = Number(localStorage.getItem('peptide-lock-until') || '0');
  if (Date.now() < lockUntil) {
    showToast('Muitas tentativas. Aguarde e tente novamente.');
    return;
  }
  if (await verifyLock(code)) {
    localStorage.removeItem('peptide-lock-attempts');
    localStorage.removeItem('peptide-lock-until');
    updateUnlocked(true);
    render();
  } else {
    const next = attempts + 1;
    localStorage.setItem('peptide-lock-attempts', String(next));
    if (next >= 5) {
      const wait = next >= 7 ? 5 * 60 * 1000 : next >= 6 ? 60 * 1000 : 30 * 1000;
      localStorage.setItem('peptide-lock-until', String(Date.now() + wait));
    }
    showToast('Código incorreto.');
  }
}
