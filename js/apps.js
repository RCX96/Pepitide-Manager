import {
  CYCLE_ID_RE,
  appDraft,
  applicationFilter,
  compounds,
  db,
  editing,
  updateAppDraft,
  updateApplicationFilter,
  updateCompounds,
  updateEditing,
} from './state.js';
import { button, clearFieldErrors, emptyState, render, setFieldError, showToast } from './ui.js';
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
  return db.applications.filter(
    (a) =>
      !q ||
      [a.date, a.time, a.site, a.notes, ...(a.compounds || []).map((c) => c.name)]
        .join(' ')
        .toLocaleLowerCase('pt-BR')
        .includes(q),
  );
}

export function setApplicationFilter(value) {
  updateApplicationFilter(String(value || ''));
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
    return emptyState('Nenhuma aplicação registrada.', 'Registrar a primeira aplicação', 'new-app');
  }
  return visible
    .map(
      (x) =>
        `<div class="item ${x.id === editing ? 'is-editing' : ''}"><div class="row between"><b>${dateFmt(x.date)} ${esc(x.time || '')}</b></div><p>${x.compounds.map((c) => `${esc(c.name)} (${esc(c.dose)} ${esc(c.unit)})`).join(' + ')}</p><p class="muted">${esc(db.cycles.find((c) => c.id === x.cycleId)?.name || 'Sem ciclo')} ${x.notes ? '• ' + esc(x.notes) : ''}</p><div class="row">${button('Duplicar', 'copy-app', x.id)}${button('Editar', 'edit-app', x.id)}${button('Excluir', 'delete-app', x.id, 'danger')}</div></div>`,
    )
    .join('');
}

export function appFormHTML() {
  const a = editing ? db.applications.find((x) => x.id === editing) : appDraft;
  const mode = editing ? 'Editar' : a && a._isCopy === true ? 'Nova (cópia)' : 'Nova';
  return `<div class="panel app-form-panel"><h2 id="appFormTitle">${mode} aplicação</h2><form id="appForm" data-form="app"><div class="two"><div><label for="appDate">Data</label><input id="appDate" name="date" type="date" required value="${a?.date || today()}"></div><div><label for="appTime">Horário (opcional)</label><input id="appTime" name="time" type="time" value="${a?.time || ''}"></div></div><label for="appCycle">Ciclo obrigatório</label><select id="appCycle" name="cycleId" required><option value="">Selecione um ciclo</option>${db.cycles
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
  return `<h1>Aplicações</h1><button type="button" class="primary new-app-button" data-action="new-app">+ Nova aplicação</button><details class="panel history-panel" open><summary>Histórico de aplicações</summary><div id="applicationList">${applicationListHTML()}</div></details>`;
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
  const first = dlg.querySelector('#appForm input, #appForm select');
  if (first && typeof first.focus === 'function') {
    first.focus();
  }
}

export function openAppForm() {
  updateEditing(null);
  updateAppDraft(null);
  updateCompounds([{ name: '', dose: '', unit: 'mg' }]);
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
  const item = {
    id: editing || uid(),
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
  db.applications = editing
    ? previousApplications.map((a) => (a.id === editing ? item : a))
    : [...previousApplications, item];
  rememberCompoundNames(compounds.map((c) => c.name));
  if (!save({ renderPage: false })) {
    db.applications = previousApplications;
    db.compoundCatalog = previousCatalog;
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
