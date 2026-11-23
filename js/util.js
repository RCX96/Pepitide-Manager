import { validateBackup } from './backup.js';
import { KEY, STORAGE_PERSIST_KEY, db, loadError } from './state.js';
import { scheduleCloudSync } from './sync.js';
import { render, showToast } from './ui.js';

export const $ = (id) => document.getElementById(id),
  esc = (x) =>
    String(x ?? '').replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
    );
// Diálogos e avisos (substituem alert/confirm/prompt)

export const today = () => new Date().toLocaleDateString('en-CA');

export const save = () => {
  if (loadError) {
    showToast('Gravação bloqueada: os dados locais precisam ser recuperados antes de continuar.');
    return;
  }
  try {
    validateBackup(db);
    localStorage.setItem(KEY, JSON.stringify(db));
    scheduleCloudSync();
    render();
    if (!localStorage.getItem(STORAGE_PERSIST_KEY)) {
      try {
        if (navigator.storage && navigator.storage.persist) {
          navigator.storage.persist().catch(() => {});
        }
        localStorage.setItem(STORAGE_PERSIST_KEY, '1');
      } catch {
        /* ignora */
      }
    }
  } catch (e) {
    showToast(
      'Não foi possível salvar com segurança: ' +
        e.message +
        '\nOs dados persistidos não foram substituídos. Recarregue o aplicativo para recuperar o último estado salvo.',
    );
    console.error(e);
  }
};

export const dateFmt = (s) => (s ? new Date(s + 'T12:00:00').toLocaleDateString('pt-BR') : '—');

export const num = (n) => Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 2 });

export const uid = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Date.now().toString(16) + '-' + Math.floor(Math.random() * 0xffffffff).toString(16);
};

export function uniqueCompoundNames(names) {
  const result = [];
  const seen = new Set();
  for (const value of names) {
    const name = String(value ?? '').trim();
    const key = name.toLocaleLowerCase('pt-BR');
    if (name && !seen.has(key)) {
      seen.add(key);
      result.push(name);
    }
  }
  return result.slice(0, 200);
}

export function rememberedCompoundNames() {
  return uniqueCompoundNames([
    ...(Array.isArray(db.compoundCatalog) ? db.compoundCatalog : []),
    ...db.applications.flatMap((a) => (a.compounds || []).map((c) => c.name)),
  ]);
}

export function rememberCompoundNames(names) {
  db.compoundCatalog = uniqueCompoundNames([...(db.compoundCatalog || []), ...names]);
}

export function lastCompoundEntry(name) {
  const key = String(name || '')
    .trim()
    .toLocaleLowerCase('pt-BR');
  return db.applications
    .slice()
    .reverse()
    .flatMap((a) => a.compounds || [])
    .find(
      (c) =>
        String(c.name || '')
          .trim()
          .toLocaleLowerCase('pt-BR') === key,
    );
}

export function compoundHistory(name) {
  const key = String(name || '')
    .trim()
    .toLocaleLowerCase('pt-BR');
  return db.applications
    .filter((a) =>
      (a.compounds || []).some(
        (c) =>
          String(c.name || '')
            .trim()
            .toLocaleLowerCase('pt-BR') === key,
      ),
    )
    .sort((a, b) => b.date.localeCompare(a.date));
}

export async function hashText(value) {
  if (crypto?.subtle) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  return btoa(unescape(encodeURIComponent(value)));
}

export function compoundNameList() {
  return `<datalist id="compoundNames">${rememberedCompoundNames()
    .map((name) => `<option value="${esc(name)}"></option>`)
    .join('')}</datalist>`;
}

export function dayCount(a, b) {
  if (!a || !b) {
    return 0;
  }
  const x = Date.parse(a + 'T12:00:00Z'),
    y = Date.parse(b + 'T12:00:00Z');
  return Math.max(0, Math.floor((y - x) / 86400000) + 1);
}

export function elapsedCycle(c) {
  const end = c.status === 'finished' ? c.end || today() : today();
  let days = dayCount(c.start, end);
  for (const pause of c.pauses || []) {
    const pEnd = pause.end || end;
    if (pause.start <= end) {
      days -= Math.max(
        0,
        Math.floor(
          (Date.parse(pEnd + 'T12:00:00Z') - Date.parse(pause.start + 'T12:00:00Z')) / 86400000,
        ) + (pause.end ? 0 : 1),
      );
    }
  }
  return Math.max(0, days);
}

export function cycleDuration(c) {
  const days = elapsedCycle(c);
  return `${days} dia${days === 1 ? '' : 's'} de ciclo`;
}

export function strictDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return false;
  }
  const x = new Date(s + 'T12:00:00Z');
  return !Number.isNaN(x.getTime()) && x.toISOString().slice(0, 10) === s;
}

export function bytesToBase64(bytes) {
  let text = '';
  for (const byte of bytes) {
    text += String.fromCharCode(byte);
  }
  return btoa(text);
}

export function base64ToBytes(value) {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}

export function csvCell(v) {
  let s = String(v ?? '');
  if (/^[\s]*[=+@]/.test(s) || /^[\s]*-[^\d]/.test(s)) {
    s = "'" + s;
  }
  return '"' + s.replace(/"/g, '""') + '"';
}
