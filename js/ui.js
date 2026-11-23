import { applications } from './apps.js';
import { backupStatusText } from './backup.js';
import { calendarPage, decorateCalendarCompounds } from './calendar.js';
import { cycles } from './cycles.js';
import { reports } from './reports.js';
import {
  CYCLE_ID_RE,
  applicationFilter,
  catalogFilter,
  db,
  historyCompound,
  loadError,
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
  esc,
  rememberedCompoundNames,
  save,
  uid,
} from './util.js';

export function showToast(text, type = 'info') {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.style.cssText =
      'position:fixed;bottom:16px;left:50%;transform:translateX(-50%);z-index:9999;display:flex;flex-direction:column;gap:8px;';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
  toast.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');
  toast.textContent = text;
  toast.style.cssText =
    'padding:10px 16px;border-radius:8px;background:#1f2937;color:#fff;box-shadow:0 4px 12px rgba(0,0,0,.3);max-width:90vw;';
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

export function confirmDialog(title, text) {
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    dlg.innerHTML = `<h2>${esc(title)}</h2><p>${esc(text)}</p><div class="row between"><button type="button" data-cancel>Cancelar</button><button type="button" class="danger" data-ok>Confirmar</button></div>`;
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

export function promptDialog({ title, text, type = 'text', value = '' } = {}) {
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    dlg.innerHTML = `<h2>${esc(title)}</h2><p>${esc(text)}</p><input type="${type === 'password' ? 'password' : 'text'}" value="${esc(value)}" style="width:100%" /><div class="row between"><button type="button" data-cancel>Cancelar</button><button type="button" class="primary" data-ok>OK</button></div>`;
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
  ['inicio', 'INÍCIO'],
  ['aplicacoes', 'APLICAÇÕES'],
  ['ciclos', 'CICLOS'],
  ['relatorios', 'RELATÓRIOS'],
  ['configuracoes', 'AJUSTES'],
];

export function navHTML() {
  return navs
    .map(
      ([id, label]) =>
        `<button type="button" data-action="set-tab" data-id="${esc(id)}">${label}</button>`,
    )
    .join('');
}

export const VALID_TABS = ['inicio', 'aplicacoes', 'ciclos', 'relatorios', 'configuracoes'];

export function setTab(t) {
  updateTab(VALID_TABS.includes(t) ? t : 'inicio');
  updateEditing(null);
  render();
  syncNav();
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
    return `<div class="panel"><h2>Catálogo de compostos</h2><input type="search" placeholder="Filtrar catálogo" value="${esc(catalogFilter)}" data-filter="catalog"><div class="catalog-list">${names.length ? names.map((name) => `<div class="row between catalog-row"><span>${esc(name)}</span><span class="row"><button type="button" data-action="rename-compound" data-id="${esc(name)}">Renomear</button><button type="button" class="danger" data-action="remove-compound-name" data-id="${esc(name)}">Remover</button></span></div>`).join('') : '<p class="empty">Nenhum composto salvo.</p>'}</div></div><div class="panel"><h2>Proteção local</h2>${localStorage.getItem('peptide-manager-lock-v1') ? button('Alterar código local', 'set-lock') + button('Remover código local', 'remove-lock') : button('Criar código local', 'set-lock', '', 'primary')}</div>`;
  }
  return '';
}

export function animateRender() {
  const app = $('app');
  if (!app || typeof app.querySelectorAll !== 'function') {
    return;
  }
  const nodes = app.querySelectorAll('.panel, .metric, .item, .calendar-day');
  nodes.forEach((node, index) => {
    node.classList.add('reveal');
    const show = () => node.classList.add('is-visible');
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => setTimeout(show, Math.min(index * 28, 240)));
    } else {
      show();
    }
  });
}

export function applicationsExtraPanel() {
  const names = rememberedCompoundNames();
  const history = historyCompound ? compoundHistory(historyCompound) : [];
  return `<div class="panel"><h2>Histórico por composto</h2><label for="historyCompound">Composto</label><select id="historyCompound" aria-label="Filtrar histórico por composto" data-change="history-compound"><option value="">Escolha um composto</option>${names.map((n) => `<option value="${esc(n)}" ${historyCompound === n ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>${historyCompound ? (history.length ? history.map((a) => `<div class="item"><b>${dateFmt(a.date)} ${esc(a.time || '')}</b><p>${a.compounds.map((c) => `${esc(c.name)} (${esc(c.dose)} ${esc(c.unit)})`).join(' + ')}</p></div>`).join('') : '<p class="empty">Nenhum registro para este composto.</p>') : ''}</div>`;
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
    $('app').innerHTML = calendarPage() + $('app').innerHTML;
  }
  if (tab === 'aplicacoes' || tab === 'configuracoes') {
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
  if (tab === 'configuracoes') {
    appendRendered(encryptedBackupPanel());
  }
  decorateCalendarCompounds();
  animateRender();
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

export function home() {
  const active = db.cycles.filter((x) => x.status === 'active' && CYCLE_ID_RE.test(x.id));
  const paused = db.cycles.filter((x) => x.status === 'paused' && CYCLE_ID_RE.test(x.id));
  return `<div class="grid"><div class="metric"><span>Aplicações</span><strong>${db.applications.length}</strong></div><div class="metric"><span>Ciclos em andamento</span><strong>${active.length}</strong></div></div><div class="panel"><h2>Tempo dos ciclos</h2>${active.length || paused.length ? [...active, ...paused].map((c) => `<div class="item"><div class="row between"><b>${esc(c.name)}</b><span class="pill">${c.status === 'paused' ? 'Pausado' : 'Em andamento'}</span></div><p><strong>${cycleDuration(c)}</strong> <span class="muted">• desde ${dateFmt(c.start)}</span></p><div class="row">${button(c.status === 'paused' ? 'Retomar ciclo' : 'Pausar ciclo', c.status === 'paused' ? 'resume-cycle' : 'pause-cycle', c.id)}${button('Ver ciclo', 'set-tab', 'ciclos')}</div></div>`).join('') : '<p class="empty">Nenhum ciclo em andamento ou pausado.</p>'}</div>`;
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
      : '<p class="empty">A lixeira está vazia.</p>'
  }</div><div class="panel"><h2>Dados no aparelho</h2><p class="muted">${supabaseUser ? 'Os registros ficam salvos neste navegador e também na sua conta na nuvem.' : 'Os registros ficam salvos neste navegador. Ative a conta na nuvem acima para ter cópia online.'}</p><div class="row">${button('Verificar integridade', 'verify-local')}</div></div>`;
}
