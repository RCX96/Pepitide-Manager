import { deletePersonalEntry, personalEntries, storePersonalEntry } from './personal.js';
import {
  CYCLE_ID_RE,
  appDraft,
  applicationFilter,
  applicationHistoryFilters,
  compounds,
  db,
  editing,
  updateAppDraft,
  updateApplicationFilter,
  updateApplicationHistoryFilters,
  updateCompounds,
  updateEditing,
} from './state.js';
import {
  button,
  clearFieldErrors,
  emptyState,
  promptDialog,
  render,
  setFieldError,
  showToast,
} from './ui.js';
import {
  $,
  compoundNameList,
  dateFmt,
  esc,
  rememberCompoundNames,
  save,
  strictDate,
  today,
  uid,
  uniqueCompoundNames,
} from './util.js';

export function filteredApplications() {
  const q = applicationFilter.trim().toLocaleLowerCase('pt-BR');
  const { cycle, compound, from, to } = applicationHistoryFilters;
  return db.applications.filter((a) => {
    const names = (a.compounds || []).map((c) => c.name);
    return (
      (!cycle || a.cycleId === cycle) &&
      (!compound || names.some((name) => name.trim().toLocaleLowerCase('pt-BR') === compound)) &&
      (!from || a.date >= from) &&
      (!to || a.date <= to) &&
      (!q ||
        [a.date, a.time, a.site, a.notes, ...names]
          .join(' ')
          .toLocaleLowerCase('pt-BR')
          .includes(q))
    );
  });
}

export function setApplicationFilter(value) {
  updateApplicationFilter(String(value || ''));
  refreshApplicationHistory();
}

export function setApplicationHistoryFilter(field, value) {
  updateApplicationHistoryFilters({ ...applicationHistoryFilters, [field]: value });
  refreshApplicationHistory();
}

export function clearApplicationFilters() {
  updateApplicationFilter('');
  updateApplicationHistoryFilters({ cycle: '', compound: '', from: '', to: '' });
  for (const field of document.querySelectorAll(
    '#applicationFilters input, #applicationFilters select',
  )) {
    field.value = '';
  }
  refreshApplicationHistory();
}

function refreshApplicationHistory() {
  const exportButton = document.querySelector('[data-action="export-application-history"]');
  if (exportButton) {
    const count = filteredApplications().length;
    exportButton.textContent = `Exportar CSV (${count})`;
    exportButton.disabled = count === 0;
  }
  const el = document.getElementById('applicationList');
  if (el) {
    el.innerHTML = applicationListHTML();
  } else {
    render();
  }
}

export function renameCompound(oldName, newName) {
  const clean = String(newName || '').trim();
  if (!clean) {
    return;
  }
  db.compoundCatalog = uniqueCompoundNames(
    (db.compoundCatalog || []).map((n) => (n === oldName ? clean : n)),
  );
  save();
}

export function removeCompoundName(name) {
  db.compoundCatalog = (db.compoundCatalog || []).filter((n) => n !== name);
  save();
}

export function reminderMatchesDate(reminder, date) {
  if (!reminder || !reminder.active || !strictDate(date) || !strictDate(reminder.date)) {
    return false;
  }
  if (reminder.date === date) {
    return true;
  }
  if (reminder.repeat === 'daily') {
    return date >= reminder.date;
  }
  if (reminder.repeat === 'weekly') {
    const start = new Date(reminder.date + 'T12:00:00Z');
    const current = new Date(date + 'T12:00:00Z');
    return current >= start && Math.round((current - start) / 86400000) % 7 === 0;
  }
  return false;
}

export function quickRegister() {
  const latest = db.applications
    .slice()
    .sort((a, b) => `${b.date}${b.time || ''}`.localeCompare(`${a.date}${a.time || ''}`))[0];
  if (latest) {
    return copyApp(latest.id);
  }
  openAppForm();
}

export function compoundFields() {
  return compounds
    .map(
      (c, i) =>
        `<div class="item"><div class="row between"><b>Composto ${i + 1}</b>${compounds.length > 1 ? button('Remover', 'remove-compound', i, 'danger') : ''}</div><label for="compoundName${i}">Nome</label><input id="compoundName${i}" list="compoundNames" aria-label="Nome do composto ${i + 1}" value="${esc(c.name)}" data-compound="name" data-index="${i}" data-compound-blur="name" data-index="${i}" placeholder="Nome do composto"><div class="two"><div><label for="compoundDose${i}">Dose</label><input id="compoundDose${i}" aria-label="Dose do composto ${i + 1}" type="number" min="0" step="any" value="${esc(c.dose)}" data-compound="dose" data-index="${i}" placeholder="Ex.: 1.5"></div><div><label for="compoundUnit${i}">Unidade</label><select id="compoundUnit${i}" aria-label="Unidade do composto ${i + 1}" data-compound="unit" data-index="${i}">${['mg', 'mcg', 'mL', 'UI'].map((u) => `<option ${c.unit === u ? 'selected' : ''}>${u}</option>`).join('')}</select></div></div></div>`,
    )
    .join('');
}

export function addCompound() {
  compounds.push({ name: '', dose: '', unit: 'mg' });
  $('compoundList').innerHTML = compoundFields();
}

export function removeCompound(i) {
  compounds.splice(i, 1);
  $('compoundList').innerHTML = compoundFields();
}

export function editApp(id) {
  const a = db.applications.find((x) => x.id === id);
  if (!a) {
    return;
  }
  updateEditing(id);
  updateAppDraft(null);
  updateCompounds(a.compounds.map((c) => ({ ...c })));
  showAppDialog();
}

export function copyApp(id) {
  const a = db.applications.find((x) => x.id === id);
  if (!a) {
    return;
  }
  updateEditing(null);
  updateAppDraft({
    id: null,
    date: today(),
    _isCopy: true,
    compounds: a.compounds.map((c) => ({ ...c })),
  });
  updateCompounds(appDraft.compounds.map((c) => ({ ...c })));
  showAppDialog();
}

export function resetApp() {
  updateEditing(null);
  updateAppDraft(null);
  updateCompounds([{ name: '', dose: '', unit: 'mg' }]);
  document.getElementById('appFormDialog')?.close();
  render();
}

export function applicationListHTML() {
  const visible = filteredApplications()
    .slice()
    .sort((x, y) => y.date.localeCompare(x.date));
  if (!visible.length) {
    if (applicationFilter.trim() || Object.values(applicationHistoryFilters).some(Boolean)) {
      return emptyState('Nenhuma aplicação corresponde aos filtros.');
    }
    return emptyState('Nenhuma aplicação registrada.', 'Registrar a primeira aplicação', 'new-app');
  }
  return visible
    .map(
      (x) =>
        `<div class="item ${x.id === editing ? 'is-editing' : ''}"><div class="row between"><b>${dateFmt(x.date)} ${esc(x.time || '')}</b></div><p>${x.compounds.map((c) => `${esc(c.name)} (${esc(c.dose)} ${esc(c.unit)})`).join(' + ')}</p><p class="muted">${esc(db.cycles.find((c) => c.id === x.cycleId)?.name || 'Sem ciclo')} ${x.notes ? '• ' + esc(x.notes) : ''}</p><div class="row">${button('Duplicar', 'copy-app', x.id)}${button('Editar', 'edit-app', x.id)}${button('Excluir', 'delete-app', x.id, 'danger')}</div></div>`,
    )
    .join('');
}

function templateOptions(selected) {
  return (
    '<option value="">Escolha um modelo</option>' +
    personalEntries('template')
      .map(
        (entry) =>
          `<option value="${esc(entry.id)}" ${entry.id === selected ? 'selected' : ''}>${esc(entry.title)}</option>`,
      )
      .join('')
  );
}

export async function saveApplicationTemplate() {
  const form = $('appForm');
  if (!form) {
    return;
  }
  const saveError = form.querySelector('[data-save-error]');
  saveError.hidden = true;
  const fields = new FormData(form);
  const snapshot = compounds.map((item) => ({
    ...item,
    name: item.name.trim(),
    dose: Number(item.dose),
  }));
  if (snapshot.some((item) => !item.name || !Number.isFinite(item.dose) || item.dose <= 0)) {
    saveError.textContent = 'Preencha os compostos e as doses antes de salvar o modelo.';
    saveError.hidden = false;
    return;
  }
  const title = (await promptDialog({ title: 'Salvar modelo', text: 'Nome do modelo' }))?.trim();
  if (!title || !form.isConnected) {
    return;
  }
  if (title.length > 120) {
    saveError.textContent = 'Use até 120 caracteres no nome do modelo.';
    saveError.hidden = false;
    return;
  }
  if (
    storePersonalEntry({
      id: uid(),
      kind: 'template',
      title,
      compounds: snapshot,
      time: fields.get('time'),
      notes: fields.get('notes'),
    })
  ) {
    $('applicationTemplate').innerHTML = templateOptions();
  } else {
    saveError.textContent = 'Não foi possível salvar o modelo.';
    saveError.hidden = false;
  }
}

export async function deleteApplicationTemplate() {
  const select = $('applicationTemplate');
  if (select?.value && (await deletePersonalEntry(select.value)) && select.isConnected) {
    select.innerHTML = templateOptions();
  }
}

export function useApplicationTemplate() {
  const template = personalEntries('template').find(
    (entry) => entry.id === $('applicationTemplate')?.value,
  );
  if (!template || !$('appForm')) {
    return;
  }
  $('appTime').value = template.time;
  $('appNotes').value = template.notes;
  updateCompounds(template.compounds.map((compound) => ({ ...compound })));
  $('compoundList').innerHTML = compoundFields();
}

export function openDatedApplication(date, planId = null, templateId = '') {
  const template = personalEntries('template').find((entry) => entry.id === templateId);
  openAppForm({
    date,
    planId,
    templateId: template?.id,
    notes: template?.notes ?? (planId ? '' : 'Registrado a partir do calendário'),
    time: template?.time,
    compounds: template?.compounds,
  });
}

export function appFormHTML() {
  const a = editing ? db.applications.find((x) => x.id === editing) : appDraft;
  const mode = editing ? 'Editar' : a && a._isCopy === true ? 'Nova (cópia)' : 'Nova';
  return `<div class="panel app-form-panel"><h2 id="appFormTitle">${mode} aplicação</h2><form id="appForm" data-form="app"><details><summary>Modelos de preenchimento</summary><label for="applicationTemplate">Modelo</label><select id="applicationTemplate">${templateOptions(a?.templateId)}</select><div class="row">${button('Usar modelo', 'use-app-template')}${button('Salvar como modelo', 'save-app-template')}${button('Excluir modelo', 'delete-app-template')}</div></details><div class="two"><div><label for="appDate">Data</label><input id="appDate" name="date" type="date" required value="${esc(a?.date || today())}"></div><div><label for="appTime">Horário (opcional)</label><input id="appTime" name="time" type="time" value="${esc(a?.time || '')}"></div></div><label for="appCycle">Ciclo obrigatório</label><select id="appCycle" name="cycleId" required><option value="">Selecione um ciclo</option>${db.cycles
    .filter((c) => CYCLE_ID_RE.test(c.id))
    .map(
      (c) =>
        `<option value="${esc(c.id)}" ${a?.cycleId === c.id ? 'selected' : ''}>${esc(c.name)}</option>`,
    )
    .join(
      '',
    )}</select>${compoundNameList()}<div id="compoundList">${compoundFields()}</div>${button('+ Adicionar composto', 'add-compound')}<label for="appNotes">Observações</label><textarea id="appNotes" name="notes" placeholder="Observações opcionais">${esc(a?.notes || '')}</textarea><p data-save-error role="alert" hidden></p><div class="row actions"><button class="primary" type="submit">${a ? 'Salvar alterações' : 'Salvar aplicação'}</button>${a ? button('Cancelar', 'cancel-app') : ''}</div></form></div>`;
}

export function applications() {
  return `<h1>Aplicações</h1><button type="button" class="primary new-app-button" data-action="new-app">+ Nova aplicação</button><details class="panel history-panel" data-details-key="application-history" open><summary>Histórico de aplicações</summary><div id="applicationList">${applicationListHTML()}</div></details>`;
}

export function showAppDialog() {
  const dlg = document.createElement('dialog');
  dlg.id = 'appFormDialog';
  dlg.className = 'app-form-dialog';
  dlg.setAttribute('aria-labelledby', 'appFormTitle');
  dlg.innerHTML = `<button type="button" class="dialog-close" data-close aria-label="Fechar">×</button>${appFormHTML()}`;
  document.body.appendChild(dlg);
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg || e.target.closest('[data-close]')) {
      dlg.close();
    }
  });
  dlg.addEventListener('close', () => dlg.remove(), { once: true });
  dlg.showModal();
  const first = dlg.querySelector('#appDate');
  if (first && typeof first.focus === 'function') {
    first.focus();
  }
}

export function openAppForm(draft = null) {
  updateEditing(null);
  updateAppDraft(draft);
  updateCompounds(
    draft?.compounds?.map((compound) => ({ ...compound })) || [{ name: '', dose: '', unit: 'mg' }],
  );
  showAppDialog();
}

export function submitApp(e) {
  e.preventDefault();
  const form = e.target;
  clearFieldErrors(form);
  const saveError = form.querySelector('[data-save-error]');
  saveError.hidden = true;
  const f = new FormData(form);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(f.get('date')))) {
    setFieldError(form, '[name="date"]', 'Informe uma data válida.');
    showToast('Informe uma data válida.', 'error');
    return;
  }
  const badCompound = compounds.findIndex(
    (c) =>
      !c.name.trim() ||
      !(Number(c.dose) > 0) ||
      !Number.isFinite(Number(c.dose)) ||
      !['mg', 'mcg', 'mL', 'UI'].includes(c.unit),
  );
  if (badCompound !== -1) {
    const bad = compounds[badCompound];
    const selector = !bad.name.trim()
      ? `#compoundName${badCompound}`
      : `#compoundDose${badCompound}`;
    setFieldError(form, selector, 'Preencha o nome e uma dose maior que zero para cada composto.');
    showToast('Preencha o nome e uma dose maior que zero para cada composto.', 'error');
    return;
  }
  const cycleId = String(f.get('cycleId') || '');
  if (!CYCLE_ID_RE.test(cycleId) || !db.cycles.some((c) => c.id === cycleId)) {
    setFieldError(form, '[name="cycleId"]', 'Selecione um ciclo válido para vincular a aplicação.');
    showToast('Selecione um ciclo válido para vincular a aplicação.', 'error');
    return;
  }
  const planId = editing ? null : appDraft?.planId;
  const plan = planId ? personalEntries('plan').find((entry) => entry.id === planId) : null;
  if (planId && plan?.status !== 'planned') {
    saveError.textContent = 'Este planejamento mudou. Feche o formulário e confira o calendário.';
    saveError.hidden = false;
    return;
  }
  const item = {
    id: editing || plan?.id || uid(),
    date: f.get('date'),
    time: f.get('time'),
    site: f.get('site') || '',
    cycleId,
    notes: f.get('notes'),
    compounds: compounds.map((c) => ({ ...c, dose: Number(c.dose) })),
    updatedAt: new Date().toISOString(),
  };
  const previousApplications = db.applications;
  const previousCatalog = db.compoundCatalog;
  const previousEntries = db.personalEntries;
  if (plan) {
    db.personalEntries = previousEntries.map((entry) =>
      entry === plan ? { ...entry, status: 'recorded', updatedAt: item.updatedAt } : entry,
    );
  }
  db.applications = editing
    ? previousApplications.map((a) => (a.id === editing ? item : a))
    : [...previousApplications, item];
  rememberCompoundNames(compounds.map((c) => c.name));
  if (!save({ renderPage: false })) {
    db.applications = previousApplications;
    db.compoundCatalog = previousCatalog;
    db.personalEntries = previousEntries;
    saveError.textContent =
      'Não foi possível salvar a aplicação. Seus dados continuam no formulário.';
    saveError.hidden = false;
    return;
  }
  updateEditing(null);
  updateAppDraft(null);
  updateCompounds([{ name: '', dose: '', unit: 'mg' }]);
  form.closest('dialog')?.close();
  render();
}
