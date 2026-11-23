import {
  addCompound,
  compoundFields,
  copyApp,
  editApp,
  quickRegister,
  removeCompound,
  removeCompoundName,
  renameCompound,
  resetApp,
  setApplicationFilter,
  submitApp,
} from './apps.js';
import {
  deleteTrash,
  downloadRawData,
  exportData,
  exportEncryptedData,
  importData,
  importEncryptedData,
  restoreTrash,
  shareBackup,
  verifyLocalData,
} from './backup.js';
import { calMove, calSelect, calSetView, calToday } from './calendar.js';
import { changeCycleStatus, submitCycle } from './cycles.js';
import { removeLock, setLock, unlockApp } from './lock.js';
import { exportReportCSV, reportSet } from './reports.js';
import {
  CYCLE_ID_RE,
  appDraft,
  compounds,
  editing,
  updateAppDraft,
  updateCatalogFilter,
  updateCompounds,
  updateEditing,
  updateHistoryCompound,
  updateReportCycle,
  updateReportFrom,
  updateReportTo,
  updateTab,
} from './state.js';
import {
  deleteCloudData,
  handlePasswordReset,
  handleSupabaseAuth,
  handleSupabaseSignOut,
  initSupabase,
  setupCloudResumeSync,
  syncWithCloud,
} from './sync.js';
import {
  VALID_TABS,
  applyTheme,
  confirmDelete,
  confirmDialog,
  promptDialog,
  render,
  setTab,
  setTheme,
  syncNav,
} from './ui.js';
import { $, lastCompoundEntry } from './util.js';

export async function handleAction(e) {
  const btn =
    e.target && typeof e.target.closest === 'function'
      ? e.target.closest('button[data-action]')
      : null;
  if (!btn) {
    return;
  }
  const action = btn.getAttribute('data-action');
  const id = btn.getAttribute('data-id');
  switch (action) {
    case 'set-tab':
      if (id) {
        setTab(id);
      }
      break;
    case 'quick-register':
      quickRegister();
      break;
    case 'quick-register-date': {
      const date = id;
      if (!date) {
        return;
      }
      updateAppDraft({
        id: null,
        date,
        time: '',
        site: 'Não informado',
        cycleId: null,
        notes: 'Registrado a partir do calendário',
        compounds: [{ name: '', dose: '', unit: 'mg' }],
      });
      updateCompounds(appDraft.compounds.map((c) => ({ ...c })));
      setTab('aplicacoes');
      break;
    }
    case 'export-data':
      exportData();
      break;
    case 'share-backup':
      shareBackup();
      break;
    case 'export-encrypted':
      exportEncryptedData();
      break;
    case 'import-encrypted':
      importEncryptedData();
      break;
    case 'verify-local':
      verifyLocalData();
      break;
    case 'import-data':
      importData();
      break;
    case 'download-raw':
      downloadRawData();
      break;
    case 'close-confirm':
      $('confirmDialog')?.close();
      break;
    case 'edit-app':
      if (id) {
        editApp(id);
      }
      break;
    case 'copy-app':
      if (id) {
        copyApp(id);
      }
      break;
    case 'delete-app':
      if (id) {
        confirmDelete('applications', id);
      }
      break;
    case 'cancel-app':
      resetApp();
      break;
    case 'add-compound':
      addCompound();
      break;
    case 'remove-compound':
      if (id !== null && id !== undefined && id !== '') {
        removeCompound(Number(id));
      }
      break;
    case 'rename-compound':
      if (id) {
        renameCompound(
          id,
          await promptDialog({
            title: 'Renomear composto',
            text: 'Novo nome do composto:',
            value: id,
          }),
        );
      }
      break;
    case 'remove-compound-name':
      if (
        id &&
        (await confirmDialog(
          '',
          'Remover este nome das sugestões? Os registros existentes não serão alterados.',
        ))
      ) {
        removeCompoundName(id);
      }
      break;
    case 'set-lock':
      setLock();
      break;
    case 'remove-lock':
      removeLock();
      break;
    case 'unlock-app':
      unlockApp();
      break;
    case 'edit-cycle':
      if (id && CYCLE_ID_RE.test(id)) {
        updateEditing(id);
        render();
      }
      break;
    case 'cancel-cycle':
      updateEditing(null);
      render();
      syncNav();
      break;
    case 'pause-cycle':
      if (id && CYCLE_ID_RE.test(id)) {
        changeCycleStatus(id, 'paused');
      }
      break;
    case 'resume-cycle':
      if (id && CYCLE_ID_RE.test(id)) {
        changeCycleStatus(id, 'active');
      }
      break;
    case 'finish-cycle':
      if (id && CYCLE_ID_RE.test(id)) {
        changeCycleStatus(id, 'finished');
      }
      break;
    case 'delete-cycle':
      if (id && CYCLE_ID_RE.test(id)) {
        confirmDelete('cycles', id);
      }
      break;
    case 'cal-prev':
      calMove(-1);
      break;
    case 'cal-today':
      calToday();
      break;
    case 'cal-next':
      calMove(1);
      break;
    case 'cal-view':
      if (id) {
        calSetView(id);
      }
      break;
    case 'cal-select':
      if (id) {
        calSelect(id);
      }
      break;
    case 'report-set':
      reportSet();
      break;
    case 'report-clear':
      updateReportFrom('');
      updateReportTo('');
      updateReportCycle('all');
      render();
      syncNav();
      break;
    case 'report-csv':
      if (id) {
        exportReportCSV(id);
      }
      break;
    case 'print':
      window.print();
      break;
    case 'restore-trash':
      if (id) {
        restoreTrash(id);
      }
      break;
    case 'delete-trash':
      if (id) {
        deleteTrash(id);
      }
      break;
    case 'cloud-login': {
      const emailEl = $('cloudEmail'),
        passEl = $('cloudPassword');
      const email = emailEl ? emailEl.value.trim() : '',
        pass = passEl ? passEl.value : '';
      handleSupabaseAuth('signin', email, pass);
      break;
    }
    case 'cloud-signup': {
      const emailEl = $('cloudEmail'),
        passEl = $('cloudPassword');
      const email = emailEl ? emailEl.value.trim() : '',
        pass = passEl ? passEl.value : '';
      handleSupabaseAuth('signup', email, pass);
      break;
    }
    case 'cloud-sync':
      syncWithCloud();
      break;
    case 'cloud-logout':
      handleSupabaseSignOut();
      break;
    case 'cloud-reset-password':
      handlePasswordReset();
      break;
    case 'cloud-delete-data':
      deleteCloudData();
      break;
    case 'set-theme':
      if (id) {
        setTheme(id);
      }
      break;
  }
}

applyTheme();
if (typeof window !== 'undefined' && window.matchMedia) {
  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
    applyTheme();
  });
}
if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
  document.addEventListener('click', handleAction);
} else if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('click', handleAction);
}

if (typeof location !== 'undefined' && location.search) {
  const startTab = new URLSearchParams(location.search).get('tab');
  if (VALID_TABS.includes(startTab)) {
    updateTab(startTab);
  }
}

// Preserva rascunho do formulário em edição
if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
  document.addEventListener('input', (e) => {
    const t = e.target;
    if (!t || !t.name) {
      return;
    }
    if (t.closest && t.closest('#appForm')) {
      if (!appDraft) {
        updateAppDraft({ id: editing || null });
      }
      if (t.name === 'date') {
        appDraft.date = t.value;
      }
      if (t.name === 'time') {
        appDraft.time = t.value;
      }
      if (t.name === 'cycleId') {
        appDraft.cycleId = t.value;
      }
      if (t.name === 'notes') {
        appDraft.notes = t.value;
      }
    }
  });
}
// Delegação de eventos (substitui handlers inline)
if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
  document.addEventListener('input', (e) => {
    const t = e.target;
    if (!t || !t.dataset) {
      return;
    }
    if (t.dataset.filter === 'apps') {
      setApplicationFilter(t.value);
    } else if (t.dataset.filter === 'catalog') {
      updateCatalogFilter(t.value);
      render();
    } else if (t.dataset.compound) {
      const i = Number(t.dataset.index);
      if (compounds[i]) {
        compounds[i][t.dataset.compound] = t.value;
      }
    }
  });
  document.addEventListener('change', (e) => {
    const t = e.target;
    if (!t || !t.dataset) {
      return;
    }
    if (t.dataset.change === 'history-compound') {
      updateHistoryCompound(t.value);
      render();
    } else if (t.dataset.compound) {
      const i = Number(t.dataset.index);
      if (compounds[i]) {
        compounds[i][t.dataset.compound] = t.value;
      }
    }
  });
  document.addEventListener('submit', (e) => {
    const form = e.target;
    if (!form || !form.dataset || !form.dataset.form) {
      return;
    }
    e.preventDefault();
    if (form.dataset.form === 'app') {
      submitApp(e);
    } else if (form.dataset.form === 'cycle') {
      submitCycle(e);
    }
  });
  document.addEventListener('focusout', (e) => {
    const t = e.target;
    if (!t || !t.dataset || !t.dataset.compoundBlur) {
      return;
    }
    const i = Number(t.dataset.index);
    const last = lastCompoundEntry(t.value);
    if (last && compounds[i] && !compounds[i].dose) {
      compounds[i].dose = last.dose;
      compounds[i].unit = last.unit;
      const list = $('compoundList');
      if (list) {
        list.innerHTML = compoundFields();
      }
    }
  });
}
render();
syncNav();
setupCloudResumeSync();
initSupabase();
// A instalação PWA só funciona em HTTPS ou localhost. O arquivo HTML isolado permanece utilizável.
if (
  'serviceWorker' in navigator &&
  (location.protocol === 'https:' ||
    location.hostname === 'localhost' ||
    location.hostname === '127.0.0.1')
) {
  window.addEventListener('load', () =>
    navigator.serviceWorker
      .register('./service-worker.js')
      .catch((err) => console.warn('Modo offline indisponível:', err)),
  );
  // Avisa quando uma versão nova assumiu o controle, em vez de trocar o app em silêncio.
  const hadController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || document.getElementById('updateBanner')) {
      return;
    }
    const bar = document.createElement('div');
    bar.id = 'updateBanner';
    bar.className = 'update-banner';
    bar.setAttribute('role', 'status');
    bar.innerHTML =
      '<span>Nova versão disponível.</span><button type="button" class="primary">Atualizar</button>';
    bar.querySelector('button').addEventListener('click', () => location.reload());
    document.body.appendChild(bar);
  });
}
