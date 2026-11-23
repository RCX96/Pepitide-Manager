import { applications } from './apps.js';
import { backupStatusText } from './backup.js';
import { calendarPage, compoundColorIndex, decorateCalendarCompounds } from './calendar.js';
import { cycles } from './cycles.js';
import { hasLock } from './lock.js';
import { reports } from './reports.js';
import {
  CYCLE_ID_RE,
  applicationFilter,
  catalogFilter,
  db,
  historyCompound,
  loadError,
  supabaseSyncStatus,
  supabaseUser,
  tab,
  unlocked,
  updateEditing,
  updateSuppressHomeCalendar,
  updateTab,
} from './state.js';
import { cloudSyncPanel } from './sync.js';
import {
  $,
  compoundHistory,
  cycleDuration,
  dateFmt,
  dayCount,
  esc,
  rememberedCompoundNames,
  save,
  today,
  uid,
  uniqueCompoundNames,
} from './util.js';

export function getSavedTheme() {
  return (
    (typeof localStorage !== 'undefined' && localStorage.getItem('peptide-manager-theme')) || 'auto'
  );
}

export function applyTheme(theme = getSavedTheme()) {
  if (typeof document === 'undefined' || !document.documentElement) {
    return;
  }
  const root = document.documentElement;
  if (theme === 'auto') {
    root.removeAttribute?.('data-theme');
  } else {
    root.setAttribute?.('data-theme', theme);
  }
  const isLight =
    theme === 'light' ||
    (theme === 'auto' &&
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-color-scheme: light)').matches);
  const themeMeta = document.querySelector?.('meta[name="theme-color"]');
  if (themeMeta) {
    themeMeta.setAttribute?.('content', isLight ? '#f4f7fb' : '#08111f');
  }
}

export function setTheme(theme) {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('peptide-manager-theme', theme);
  }
  applyTheme(theme);
  render();
}

export function showToast(text, type = 'info') {
  let toast = document.querySelector('.toast');
  if (toast) {
    toast.remove();
  }
  toast = document.createElement('div');
  toast.className = `toast ${type === 'error' ? 'toast-error' : ''}`;
  toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
  toast.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');
  toast.textContent = text;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('fade-out');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

export function clearFieldErrors(form) {
  if (!form || !form.querySelectorAll) {
    return;
  }
  form.querySelectorAll('.field-error').forEach((el) => el.remove());
  form.querySelectorAll('[aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));
}

export function setFieldError(form, selector, message) {
  const field = form && form.querySelector ? form.querySelector(selector) : null;
  if (!field) {
    return;
  }
  field.setAttribute('aria-invalid', 'true');
  const error = document.createElement('p');
  error.className = 'field-error';
  error.setAttribute('role', 'alert');
  error.textContent = message;
  field.insertAdjacentElement('afterend', error);
  if (typeof field.focus === 'function') {
    field.focus({ preventScroll: true });
  }
}

export function focusFirstFormField() {
  if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') {
    const reduce =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    try {
      window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
    } catch {
      window.scrollTo(0, 0);
    }
  }
  const field = document.querySelector(
    '#appForm input, #appForm select, #appForm textarea, form[data-form="cycle"] input, form[data-form="cycle"] select, form[data-form="cycle"] textarea',
  );
  if (field && typeof field.focus === 'function') {
    field.focus({ preventScroll: true });
  }
}

export function applyDynamicStyles(root = document) {
  if (!root || !root.querySelectorAll) {
    return;
  }
  root.querySelectorAll('[data-pct]').forEach((el) => {
    el.style.setProperty('width', `${el.getAttribute('data-pct')}%`);
  });
  root.querySelectorAll('[data-min-width]').forEach((el) => {
    el.style.setProperty('min-width', `${el.getAttribute('data-min-width')}px`);
  });
}

export function emptyState(text, btnLabel = '', action = '', id = '') {
  return `<div class="empty-state">
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10"></circle>
      <line x1="12" y1="8" x2="12" y2="12"></line>
      <line x1="12" y1="16" x2="12.01" y2="16"></line>
    </svg>
    <p>${esc(text)}</p>
    ${btnLabel ? button(btnLabel, action, id, 'primary') : ''}
  </div>`;
}

export const dialogHooks = { confirm: null, prompt: null };

export function confirmDialog(title, text) {
  if (dialogHooks.confirm) {
    return dialogHooks.confirm(title, text);
  }
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    dlg.setAttribute('aria-labelledby', 'confirmTitle');
    dlg.setAttribute('aria-describedby', 'confirmText');
    dlg.innerHTML = `<h2 id="confirmTitle">${esc(title)}</h2><p id="confirmText">${esc(text)}</p><div class="row between"><button type="button" data-cancel>Cancelar</button><button type="button" class="danger" data-ok>Sim, excluir</button></div>`;
    document.body.appendChild(dlg);
    dlg.showModal();
    dlg.querySelector('[data-ok]').addEventListener('click', () => {
      dlg.close();
      dlg.remove();
      resolve(true);
    });
    dlg.querySelector('[data-cancel]').addEventListener('click', () => {
      dlg.close();
      dlg.remove();
      resolve(false);
    });
    dlg.addEventListener('close', () => resolve(false), { once: true });
  });
}

export function promptDialog(options = {}) {
  if (dialogHooks.prompt) {
    return dialogHooks.prompt(options);
  }
  const { title, text, type = 'text', value = '' } = options;
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    dlg.setAttribute('aria-labelledby', 'promptTitle');
    dlg.setAttribute('aria-describedby', 'promptText');
    dlg.innerHTML = `<h2 id="promptTitle">${esc(title)}</h2><p id="promptText">${esc(text)}</p><label class="sr-only" for="promptInput">${esc(title)}</label><input id="promptInput" type="${type === 'password' ? 'password' : 'text'}" value="${esc(value)}" class="dialog-input" /><div class="row between"><button type="button" data-cancel>Cancelar</button><button type="button" class="primary" data-ok>OK</button></div>`;
    document.body.appendChild(dlg);
    const input = dlg.querySelector('input');
    dlg.showModal();
    input.focus();
    const finish = (v) => {
      dlg.close();
      dlg.remove();
      resolve(v);
    };
    dlg.querySelector('[data-ok]').addEventListener('click', () => finish(input.value));
    dlg.querySelector('[data-cancel]').addEventListener('click', () => finish(null));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        finish(input.value);
      }
      if (e.key === 'Escape') {
        finish(null);
      }
    });
  });
}

export const button = (label, action, id = '', cls = '', extra = '') =>
  `<button type="button" class="${cls}" data-action="${action}"${id !== '' && id !== null && id !== undefined ? ` data-id="${esc(id)}"` : ''}${extra}>${label}</button>`;

export const navs = [
  [
    'inicio',
    'INÍCIO',
    '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 10l9-7 9 7v10a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1V10z"/></svg>',
  ],
  [
    'aplicacoes',
    'APLICAÇÕES',
    '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>',
  ],
  [
    'ciclos',
    'CICLOS',
    '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>',
  ],
  [
    'relatorios',
    'RELATÓRIOS',
    '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>',
  ],
  [
    'configuracoes',
    'AJUSTES',
    '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
  ],
];

export function navHTML() {
  return navs
    .map(
      ([id, label, icon]) =>
        `<button type="button" data-action="set-tab" data-id="${esc(id)}">${icon ? `<span class="nav-icon">${icon}</span>` : ''}<span>${label}</span></button>`,
    )
    .join('');
}

export const VALID_TABS = ['inicio', 'aplicacoes', 'ciclos', 'relatorios', 'configuracoes'];

export function setTab(t, pushHistory = true) {
  const next = VALID_TABS.includes(t) ? t : 'inicio';
  updateTab(next);
  updateEditing(null);
  render();
  syncNav();
  animateRender(true);
  if (
    pushHistory &&
    typeof history !== 'undefined' &&
    history.pushState &&
    typeof location !== 'undefined'
  ) {
    const url = new URL(location.href);
    if (url.searchParams.get('tab') !== next) {
      url.searchParams.set('tab', next);
      history.pushState({ tab: next }, '', url);
    }
  }
}

export function syncNav() {
  const n = $('bottom-nav');
  if (!n || !n.querySelectorAll) {
    return;
  }
  for (const b of n.querySelectorAll('button')) {
    const active = b.getAttribute('data-id') === tab;
    b.classList.toggle('active', active);
    if (active) {
      b.setAttribute('aria-current', 'page');
    } else {
      b.removeAttribute('aria-current');
    }
  }
}

export function syncHeader() {
  const sub = $('headerSubtitle');
  if (sub) {
    const titles = {
      inicio: 'Início',
      aplicacoes: 'Aplicações',
      ciclos: 'Ciclos',
      relatorios: 'Relatórios',
      configuracoes: 'Ajustes',
    };
    sub.textContent = titles[tab] || '';
  }
  const statusEl = $('headerSyncStatus');
  if (statusEl) {
    if (supabaseUser) {
      const raw = supabaseSyncStatus || 'Sincronizado';
      let state = 'synced';
      let label = 'Sincronizado';
      if (/sincronizando|carregando/i.test(raw)) {
        state = 'syncing';
        label = 'Sincronizando';
      } else if (/pendente/i.test(raw)) {
        state = 'pending';
        label = 'Pendente';
      } else if (/offline/i.test(raw)) {
        state = 'offline';
        label = 'Offline';
      } else if (/erro/i.test(raw)) {
        state = 'error';
        label = 'Erro';
      }
      statusEl.innerHTML = `<span class="sync-indicator ${state}"><span class="sync-dot"></span><span class="sync-text">${label}</span></span>`;
    } else {
      statusEl.innerHTML = '';
    }
  }
}

export function extraPanels() {
  if (tab === 'aplicacoes') {
    return `<div class="panel quick-filter"><h2>Buscar aplicações</h2><label class="sr-only" for="applicationSearch">Buscar aplicações</label><input id="applicationSearch" type="search" aria-label="Buscar aplicações" value="${esc(applicationFilter)}" placeholder="Composto, data ou observação" data-filter="apps"></div>`;
  }
  if (tab === 'configuracoes') {
    const names = rememberedCompoundNames().filter(
      (n) =>
        !catalogFilter ||
        n.toLocaleLowerCase('pt-BR').includes(catalogFilter.toLocaleLowerCase('pt-BR')),
    );
    const theme = getSavedTheme();
    return `<div class="panel"><h2>Aparência</h2><div class="theme-picker row"><button type="button" class="${theme === 'auto' ? 'primary' : ''}" data-action="set-theme" data-id="auto">Automático</button><button type="button" class="${theme === 'dark' ? 'primary' : ''}" data-action="set-theme" data-id="dark">Escuro</button><button type="button" class="${theme === 'light' ? 'primary' : ''}" data-action="set-theme" data-id="light">Claro</button></div></div><div class="panel"><h2>Catálogo de compostos</h2><input id="catalogFilter" type="search" placeholder="Filtrar catálogo" value="${esc(catalogFilter)}" data-filter="catalog"><div class="catalog-list">${names.length ? names.map((name) => `<div class="row between catalog-row"><span>${esc(name)}</span><span class="row"><button type="button" data-action="rename-compound" data-id="${esc(name)}">Renomear</button><button type="button" class="danger" data-action="remove-compound-name" data-id="${esc(name)}">Remover</button></span></div>`).join('') : emptyState('As sugestões aparecem conforme você registra.')}</div></div><div class="panel"><h2>Proteção local</h2>${hasLock() ? button('Alterar código local', 'set-lock') + button('Remover código local', 'remove-lock') : button('Criar código local', 'set-lock', '', 'primary')}</div>`;
  }
  return '';
}

export function animateRender(isTabChange = false) {
  if (!isTabChange || tab === 'relatorios') {
    return;
  }
  const app = $('app');
  if (!app || typeof app.querySelectorAll !== 'function') {
    return;
  }
  const nodes = Array.from(app.querySelectorAll('.panel, .metric, .item, .calendar-day')).slice(
    0,
    12,
  );
  nodes.forEach((node, index) => {
    node.classList.add('reveal');
    const show = () => node.classList.add('is-visible');
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => setTimeout(show, Math.min(index * 20, 240)));
    } else {
      show();
    }
  });
}

export function applicationsExtraPanel() {
  const names = rememberedCompoundNames();
  const history = historyCompound ? compoundHistory(historyCompound) : [];
  return `<div class="panel compound-history-panel"><details ${historyCompound ? 'open' : ''}><summary>Histórico por composto</summary><label for="historyCompound">Composto</label><select id="historyCompound" aria-label="Filtrar histórico por composto" data-change="history-compound"><option value="">Escolha um composto</option>${names.map((n) => `<option value="${esc(n)}" ${historyCompound === n ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>${historyCompound ? (history.length ? history.map((a) => `<div class="item"><b>${dateFmt(a.date)} ${esc(a.time || '')}</b><p>${a.compounds.map((c) => `${esc(c.name)} (${esc(c.dose)} ${esc(c.unit)})`).join(' + ')}</p></div>`).join('') : emptyState('Nenhum registro para este composto.')) : emptyState('Escolha um composto para ver o histórico.')}</details></div>`;
}

export function encryptedBackupPanel() {
  return `<div class="panel"><h2>Backup criptografado</h2><div class="row">${button('Exportar criptografado', 'export-encrypted', '', 'primary')}${button('Importar criptografado', 'import-encrypted')}</div></div>`;
}

export function appendRendered(html) {
  const app = $('app');
  if (app && typeof app.insertAdjacentHTML === 'function') {
    app.insertAdjacentHTML('beforeend', html);
  }
}

export function render() {
  const previousFocus = typeof document !== 'undefined' ? document.activeElement : null;
  const focusKey =
    previousFocus && previousFocus !== document.body
      ? previousFocus.getAttribute('data-focus-id') || previousFocus.id || ''
      : '';
  if (!unlocked) {
    $('bottom-nav').innerHTML = '';
    $('app').innerHTML =
      '<div class="panel lock-screen"><h1>Aplicativo protegido</h1><p>Digite seu código local para abrir os registros.</p><input id="unlockCode" type="password" autocomplete="current-password" placeholder="Código local"><button type="button" class="primary" data-action="unlock-app">Desbloquear</button></div>';
    return;
  }
  if (loadError) {
    $('bottom-nav').innerHTML = '';
    $('app').innerHTML =
      '<h1>Recuperação de dados</h1><div class="panel"><p class="warning">' +
      esc(loadError) +
      '</p><p>O aplicativo bloqueou alterações para evitar substituir dados que não conseguiu ler. Não limpe o armazenamento do navegador. Se tiver um backup JSON, use o procedimento de recuperação com apoio técnico.</p><button type="button" data-action="download-raw">Baixar cópia bruta dos dados locais</button></div>';
    return;
  }
  $('bottom-nav').innerHTML = navHTML();
  $('app')?.setAttribute?.('data-tab', tab);
  updateSuppressHomeCalendar(tab === 'inicio');
  $('app').innerHTML = {
    inicio: home,
    aplicacoes: applications,
    ciclos: cycles,
    relatorios: reports,
    configuracoes: dataPage,
  }[tab]();
  updateSuppressHomeCalendar(false);
  if (tab === 'inicio') {
    $('app').innerHTML = $('app')
      .innerHTML.replace(/<div class="metric"><span>Peso atual<\/span>[\s\S]*?<\/div>/, '')
      .replace(/<div class="metric"><span>Meta de peso<\/span>[\s\S]*?<\/div>/, '')
      .replace(/<button[^>]*data-id="peso"[^>]*>[^<]*<\/button>/, '');
  }
  if (tab === 'aplicacoes') {
    appendRendered(extraPanels());
  }
  if (tab === 'aplicacoes') {
    $('app').innerHTML = $('app').innerHTML.replace(
      /<label>Local da aplicação<\/label><select name="site">[\s\S]*?<\/select>/,
      '',
    );
    $('app').innerHTML = $('app').innerHTML.replace('Ciclo (opcional)', 'Ciclo obrigatório');
    appendRendered(applicationsExtraPanel());
    const cycleSelect = document.querySelector('select[name="cycleId"]');
    if (cycleSelect) {
      cycleSelect.required = true;
      const emptyCycle = cycleSelect.querySelector('option[value=""]');
      if (emptyCycle) {
        emptyCycle.textContent = 'Selecione um ciclo';
      }
    }
  }
  decorateCalendarCompounds();
  applyDynamicStyles();
  syncHeader();
  syncNav();
  if (focusKey && typeof document !== 'undefined') {
    const target =
      document.getElementById(focusKey) ||
      Array.from(document.querySelectorAll('[data-focus-id]')).find(
        (el) => el.getAttribute('data-focus-id') === focusKey,
      );
    if (target && typeof target.focus === 'function') {
      target.focus({ preventScroll: true });
    }
  }
}

export function confirmDelete(type, id) {
  if (type === 'cycles' && (!id || !CYCLE_ID_RE.test(id))) {
    return;
  }
  const item = db[type]?.find((x) => x.id === id);
  if (!item) {
    return;
  }
  let label = 'o registro';
  if (type === 'applications') {
    label = `a aplicação de ${dateFmt(item.date)}`;
  } else if (type === 'cycles') {
    label = `o ciclo ${item.name || ''}`;
  } else if (type === 'weights') {
    label = `a pesagem de ${dateFmt(item.date)}`;
  }
  $('confirmText').textContent = `Excluir ${label}?`;
  $('confirmYes').onclick = () => {
    if (type === 'cycles' && (!id || !CYCLE_ID_RE.test(id))) {
      return;
    }
    const it = db[type]?.find((x) => x.id === id);
    if (!it) {
      return;
    }
    db.trash = Array.isArray(db.trash) ? db.trash : [];
    const linkedApplicationIds =
      type === 'cycles' ? db.applications.filter((a) => a.cycleId === id).map((a) => a.id) : [];
    db.trash.push({
      trashId: uid(),
      type,
      deletedAt: new Date().toISOString(),
      item: JSON.parse(JSON.stringify(it)),
      ...(type === 'cycles' ? { linkedApplicationIds } : {}),
    });
    db.deleted = Array.isArray(db.deleted) ? db.deleted : [];
    db.deleted.push({ type, id, deletedAt: new Date().toISOString() });
    if (db.deleted.length > 5000) {
      db.deleted = db.deleted.slice(db.deleted.length - 5000);
    }
    db[type] = db[type].filter((x) => x.id !== id);
    if (type === 'cycles') {
      db.applications.forEach((a) => {
        if (a.cycleId === id) {
          a.cycleId = null;
        }
      });
    }
    $('confirmDialog').close();
    save();
  };
  $('confirmDialog').showModal();
}

export function todayBlock() {
  const now = new Date();
  const rawDateStr = now.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  const todayFormatted = rawDateStr.charAt(0).toUpperCase() + rawDateStr.slice(1);
  const tDate = today();
  const todayApps = db.applications.filter((a) => a.date === tDate);
  const todayCompoundNames = uniqueCompoundNames(
    todayApps.flatMap((a) => (a.compounds || []).map((c) => c.name)),
  );
  const sortedApps = db.applications
    .slice()
    .sort((a, b) => `${b.date}${b.time || ''}`.localeCompare(`${a.date}${a.time || ''}`));
  const lastApp = sortedApps[0];
  const activeCycles = db.cycles.filter((x) => x.status === 'active' && CYCLE_ID_RE.test(x.id));

  let appsStatus = '<p class="muted">Nenhuma aplicação hoje</p>';
  if (todayApps.length) {
    const dots = todayCompoundNames
      .map((n) => `<span class="cal-dot c${compoundColorIndex(n)}" title="${esc(n)}"></span>`)
      .join('');
    appsStatus = `<p><strong>${todayApps.length} aplicação(ões) hoje:</strong> <span class="cal-dots">${dots}</span> <span class="muted">${todayCompoundNames.map(esc).join(', ')}</span></p>`;
  }

  let lastAppHTML = '';
  if (lastApp) {
    lastAppHTML = `<p class="muted">Último registro: ${dateFmt(lastApp.date)} ${esc(lastApp.time || '')} • ${lastApp.compounds.map((c) => `${esc(c.name)} (${esc(c.dose)} ${esc(c.unit)})`).join(' + ')}</p>`;
  }

  const primaryBtn = activeCycles.length
    ? button('Registrar aplicação', 'new-app', '', 'primary')
    : button('Criar ciclo', 'set-tab', 'ciclos', 'primary');
  const repeatBtn = lastApp ? button('Repetir último registro', 'quick-register') : '';

  return `<div class="panel today-panel">
    <div class="row between">
      <h2>Hoje</h2>
      <span class="muted">${todayFormatted}</span>
    </div>
    ${appsStatus}
    ${lastAppHTML}
    <div class="row actions">
      ${primaryBtn}
      ${repeatBtn}
    </div>
  </div>`;
}

export function home() {
  const active = db.cycles.filter((x) => x.status === 'active' && CYCLE_ID_RE.test(x.id));
  const paused = db.cycles.filter((x) => x.status === 'paused' && CYCLE_ID_RE.test(x.id));
  const tDate = today();

  return `${todayBlock()}
  <div class="grid">
    <div class="metric"><span>Aplicações</span><strong>${db.applications.length}</strong></div>
    <div class="metric highlight"><span>Ciclos em andamento</span><strong>${active.length}</strong></div>
  </div>
  ${calendarPage()}
  <div class="panel">
    <h2>Tempo dos ciclos</h2>
    ${
      active.length || paused.length
        ? [...active, ...paused]
            .map((c) => {
              const durDays = dayCount(c.start, tDate);
              const remaining = c.end && c.end > tDate ? dayCount(tDate, c.end) - 1 : 0;
              const totalPlanned = c.end ? dayCount(c.start, c.end) : 0;
              const pct =
                totalPlanned > 0 ? Math.min(100, Math.round((durDays / totalPlanned) * 100)) : 100;
              return `<div class="item">
                <div class="row between">
                  <b>${esc(c.name)}</b>
                  <span class="pill ${c.status}">${c.status === 'paused' ? 'Pausado' : 'Em andamento'}</span>
                </div>
                <p><strong>${cycleDuration(c)}</strong> <span class="muted">• desde ${dateFmt(c.start)}</span></p>
                <div class="cycle-progress" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="Progresso do ciclo ${esc(c.name)}">
                  <div class="cycle-progress-fill" data-pct="${pct}"></div>
                </div>
                ${remaining > 0 ? `<p class="muted">Faltam ${remaining} dias</p>` : ''}
                <div class="row">
                  ${button(c.status === 'paused' ? 'Retomar ciclo' : 'Pausar ciclo', c.status === 'paused' ? 'resume-cycle' : 'pause-cycle', c.id)}
                  ${button('Ver ciclo', 'set-tab', 'ciclos')}
                </div>
              </div>`;
            })
            .join('')
        : emptyState('Nenhum ciclo em andamento ou pausado.', 'Criar ciclo', 'set-tab', 'ciclos')
    }
  </div>`;
}

export function dataPage() {
  const trash = (Array.isArray(db.trash) ? db.trash : []).filter((t) =>
    ['applications', 'cycles'].includes(t.type),
  );
  const names = { applications: 'Aplicação', cycles: 'Ciclo' };
  return `<h1>Ajustes</h1>${cloudSyncPanel()}${extraPanels()}${encryptedBackupPanel()}<div class="panel"><h2>Backup</h2><p class="muted" id="backupStatus">${backupStatusText()}</p><div class="row">${button('Baixar backup JSON', 'export-data', '', 'primary')}${button('Compartilhar', 'share-backup')}</div></div><div class="panel"><h2>Restaurar backup</h2><input type="file" id="restoreFile" accept="application/json,.json"><div class="actions">${button('Importar arquivo', 'import-data')}</div></div><div class="panel"><h2>Lixeira • ${trash.length} registro(s)</h2>${
    trash.length
      ? trash
          .slice()
          .reverse()
          .map(
            (t) =>
              `<div class="item"><div class="row between"><b>${names[t.type] || 'Registro'}: ${esc(t.item.name || t.item.date || 'Sem nome')}</b><span class="muted">${new Date(t.deletedAt).toLocaleDateString('pt-BR')}</span></div><div class="row">${button('Restaurar', 'restore-trash', t.trashId)}${button('Apagar definitivamente', 'delete-trash', t.trashId, 'danger')}</div></div>`,
          )
          .join('')
      : emptyState('A lixeira está vazia.')
  }</div><div class="panel"><h2>Dados no aparelho</h2><p class="muted">${supabaseUser ? 'Os registros ficam salvos neste navegador e também na sua conta na nuvem.' : 'Os registros ficam salvos neste navegador. Ative a conta na nuvem acima para ter cópia online.'}</p><div class="row">${button('Verificar integridade', 'verify-local')}</div></div>`;
}
