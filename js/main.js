import {
  deletePersonalEntry,
  editDiary,
  reschedulePlan,
  setDiaryFilter,
  personalEntries,
  planApplication,
  setPlanStatus,
  submitDiary,
} from './personal.js';
import {
  addCompound,
  clearApplicationFilters,
  compoundFields,
  openAppForm,
  openDatedApplication,
  saveApplicationTemplate,
  deleteApplicationTemplate,
  useApplicationTemplate,
  copyApp,
  editApp,
  filteredApplications,
  quickRegister,
  removeCompound,
  removeCompoundName,
  renameCompound,
  resetApp,
  setApplicationFilter,
  setApplicationHistoryFilter,
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
import { changeCycleStatus, removeCyclePause, submitCycle } from './cycles.js';
import { removeLock, setLock, unlockApp } from './lock.js';
import { exportApplicationHistoryCSV, exportReportCSV, reportSet } from './reports.js';
import {
  CYCLE_ID_RE,
  appDraft,
  compounds,
  editing,
  updateAppDraft,
  updateCatalogFilter,
  updateEditing,
  updateHistoryCompound,
  updateReportCycle,
  updateReportFrom,
  updateReportTo,
  updateTab,
  writeViewPreference,
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
  focusFirstFormField,
  promptDialog,
  render,
  setTab,
  setTheme,
  showSyncDetails,
  showToast,
  syncHeader,
  syncNav,
} from './ui.js';
import { $, lastCompoundEntry } from './util.js';

export async function handleAction(e) {
  const summary = e.target?.closest?.('details[data-details-key] > summary');
  if (summary && !e.defaultPrevented) {
    const details = summary.parentElement;
    writeViewPreference(details.dataset.detailsKey, !details.open);
  }
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
    case 'new-app':
      openAppForm();
      break;
    case 'set-tab':
      if (id) {
        setTab(id);
      }
      break;
    case 'quick-register':
      quickRegister();
      break;
    case 'cycle-history':
      if (id) {
        clearApplicationFilters();
        setApplicationHistoryFilter('cycle', id);
        setTab('aplicacoes');
        const history = document.querySelector('.history-panel');
        if (history) {
          history.open = true;
          writeViewPreference(history.dataset.detailsKey, true);
          history.querySelector('summary').focus();
        }
      }
      break;
    case 'export-application-history':
      exportApplicationHistoryCSV(filteredApplications());
      break;
    case 'clear-app-filters':
      clearApplicationFilters();
      break;
    case 'cal-select':
      if (id) {
        calSelect(id);
        document.getElementById('calendarDayTitle')?.focus();
      }
      break;
    case 'quick-register-date':
      if (id) {
        openDatedApplication(id);
      }
      break;
    case 'new-plan':
      planApplication(id);
      break;
    case 'record-plan': {
      const plan = personalEntries('plan').find((entry) => entry.id === id);
      if (plan?.status === 'planned') {
        openDatedApplication(plan.date, plan.id, plan.templateId);
      }
      break;
    }
    case 'reschedule-plan':
      reschedulePlan(id);
      break;
    case 'edit-diary':
      editDiary(id);
      break;
    case 'skip-plan':
      setPlanStatus(id, 'skipped');
      break;
    case 'reopen-plan':
      setPlanStatus(id, 'planned');
      break;
    case 'delete-personal':
      await deletePersonalEntry(id);
      break;
    case 'save-app-template':
      await saveApplicationTemplate();
      break;
    case 'delete-app-template':
      await deleteApplicationTemplate();
      break;
    case 'use-app-template':
      useApplicationTemplate();
      break;
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
        focusFirstFormField();
      }
      break;
    case 'cancel-cycle':
      updateEditing(null);
      render();
      syncNav();
      break;
    case 'remove-cycle-pause':
      if (id) {
        await removeCyclePause(id);
      }
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
    case 'undo-delete':
      if (id && (await restoreTrash(id, { confirm: false }))) {
        showToast('Registro restaurado.');
      }
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
    case 'sync-details':
      showSyncDetails();
      break;
    case 'cloud-sync':
      await syncWithCloud();
      syncHeader();
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
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('popstate', () => {
    if (typeof location === 'undefined') {
      return;
    }
    const next = new URLSearchParams(location.search).get('tab');
    setTab(VALID_TABS.includes(next) ? next : 'inicio', false);
  });
  const updateOfflineBanner = () => {
    const banner = document.getElementById('offlineBanner');
    if (banner) {
      banner.hidden = typeof navigator === 'undefined' || navigator.onLine !== false;
    }
  };
  window.addEventListener('online', updateOfflineBanner);
  window.addEventListener('offline', updateOfflineBanner);
  updateOfflineBanner();
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
  document.addEventListener(
    'toggle',
    (e) => {
      const details = e.target;
      if (details.dataset?.detailsKey && details.isConnected) {
        writeViewPreference(details.dataset.detailsKey, details.open);
      }
    },
    true,
  );
  document.addEventListener('input', (e) => {
    const t = e.target;
    if (!t || !t.dataset) {
      return;
    }
    if (t.dataset.diaryFilter === 'query') {
      setDiaryFilter('query', t.value);
    } else if (t.dataset.filter === 'apps') {
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
    if (['from', 'to'].includes(t.dataset.diaryFilter)) {
      setDiaryFilter(t.dataset.diaryFilter, t.value);
    } else if (t.dataset.appHistoryFilter) {
      setApplicationHistoryFilter(t.dataset.appHistoryFilter, t.value);
    } else if (t.dataset.change === 'history-compound') {
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
    } else if (form.dataset.form === 'diary') {
      submitDiary(form);
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
