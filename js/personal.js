import { db } from './state.js';
import { button, confirmDialog, showToast } from './ui.js';
import { $, dateFmt, esc, save, strictDate, today, uid } from './util.js';

export function personalEntries(kind) {
  return (db.personalEntries || []).filter((entry) => entry.kind === kind);
}

export function storePersonalEntry(entry) {
  const previous = db.personalEntries || [];
  const updated = { ...entry, updatedAt: new Date().toISOString() };
  db.personalEntries = [...previous.filter((item) => item.id !== entry.id), updated];
  if (!save()) {
    db.personalEntries = previous;
    return false;
  }
  return true;
}

function personalDialog(title, fields, submit) {
  const dialog = document.createElement('dialog');
  dialog.setAttribute('aria-label', title);
  dialog.innerHTML = `<h2>${esc(title)}</h2><form>${fields}
    <p role="alert" hidden></p>
    <div class="row between"><button type="button" data-cancel>Cancelar</button>
    <button type="submit" class="primary">OK</button></div></form>`;
  dialog.querySelector('[data-cancel]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => dialog.remove(), { once: true });
  dialog.querySelector('form').addEventListener('submit', (event) => {
    event.preventDefault();
    const error = submit(new FormData(event.target));
    if (!error) {
      dialog.close();
      return;
    }
    const alert = dialog.querySelector('[role="alert"]');
    alert.textContent = error;
    alert.hidden = false;
  });
  document.body.appendChild(dialog);
  dialog.showModal();
}

export function planApplication(date, existing = null) {
  if (!strictDate(date)) {
    return;
  }
  const templates = personalEntries('template');
  const options = templates
    .map(
      (entry) =>
        `<option value="${esc(entry.id)}" ${existing?.templateId === entry.id ? 'selected' : ''}>${esc(entry.title)}</option>`,
    )
    .join('');
  personalDialog(
    existing ? 'Remarcar compromisso' : 'Planejar aplicação',
    `<label for="planTitle">Nome do compromisso</label><input id="planTitle" name="title" required maxlength="120" value="${esc(existing?.title || '')}">
    <label for="planDate">Data do compromisso</label><input type="date" id="planDate" name="date" required value="${esc(date)}">
    <label for="planTemplate">Modelo (opcional)</label><select id="planTemplate" name="templateId"><option value="">Sem modelo</option>${options}</select>`,
    (data) => {
      const date = data.get('date');
      const title = String(data.get('title') || '').trim();
      if (!title || !strictDate(date)) {
        return 'Informe o nome e uma data válida.';
      }
      if (existing && !personalEntries('plan').includes(existing)) {
        return 'O compromisso mudou. Feche e tente novamente.';
      }
      const templateId = data.get('templateId');
      if (templateId && !personalEntries('template').some((entry) => entry.id === templateId)) {
        return 'O modelo selecionado foi removido. Feche e tente novamente.';
      }
      return storePersonalEntry({
        id: existing?.id || uid(),
        kind: 'plan',
        title,
        date,
        templateId,
        status: existing?.status || 'planned',
      })
        ? ''
        : 'Não foi possível salvar o compromisso. Tente novamente.';
    },
  );
}

export function reschedulePlan(id) {
  const plan = personalEntries('plan').find((entry) => entry.id === id);
  if (plan?.status === 'planned') {
    planApplication(plan.date, plan);
  }
}

export function setPlanStatus(id, status) {
  const plan = personalEntries('plan').find((entry) => entry.id === id);
  if (plan && plan.status !== 'recorded') {
    storePersonalEntry({ ...plan, status });
  }
}

function planActions(plan) {
  return (
    button('Registrar', 'record-plan', plan.id) +
    button('Marcar como pulado', 'skip-plan', plan.id) +
    button('Remarcar', 'reschedule-plan', plan.id)
  );
}

export function todayAgendaHTML(date) {
  const plans = personalEntries('plan').filter(
    (entry) => entry.date === date && entry.status === 'planned',
  );
  return `<section aria-labelledby="todayAgendaTitle"><h3 id="todayAgendaTitle">Agenda de hoje</h3>
    ${plans.length ? plans.map((plan) => `<div class="item"><strong>${esc(plan.title)}</strong><div class="row">${planActions(plan)}</div></div>`).join('') : '<p class="muted">Nenhum compromisso pendente para hoje.</p>'}
  </section>`;
}

export function plannedApplicationsHTML(date) {
  const labels = { planned: 'Planejado', skipped: 'Pulado', recorded: 'Registrado' };
  const plans = personalEntries('plan').filter((entry) => entry.date === date);
  const templates = personalEntries('template');
  return `<section><h3>Planejamento</h3>
    ${button('+ Planejar aplicação', 'new-plan', date)}
    ${plans
      .map((plan) => {
        const template = templates.find((entry) => entry.id === plan.templateId);
        return `<div class="item"><div class="row between"><strong>${esc(plan.title)}</strong><span class="pill">${labels[plan.status]}</span></div>
        ${plan.templateId ? `<p class="muted">Modelo: ${esc(template?.title || 'Removido')}</p>` : ''}
        <div class="row">${plan.status === 'planned' ? planActions(plan) : ''}
        ${plan.status === 'skipped' ? button('Voltar a planejar', 'reopen-plan', plan.id) : ''}
        ${button('Excluir do planejamento', 'delete-personal', plan.id)}</div></div>`;
      })
      .join('')}
  </section>`;
}

const diaryFilters = { query: '', from: '', to: '' };

function diaryEntriesHTML() {
  const { query, from, to } = diaryFilters;
  const term = query.trim().toLocaleLowerCase('pt-BR');
  const entries = personalEntries('diary')
    .filter(
      (entry) =>
        (!from || entry.date >= from) &&
        (!to || entry.date <= to) &&
        entry.notes.toLocaleLowerCase('pt-BR').includes(term),
    )
    .sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt));
  if (!entries.length) {
    return `<p class="muted">${term || from || to ? 'Nenhuma anotação corresponde aos filtros.' : 'Nenhuma anotação no diário.'}</p>`;
  }
  return entries
    .map(
      (entry) => `<article class="item"><b>${dateFmt(entry.date)}</b>
    <p>${esc(entry.notes).replaceAll('\n', '<br>')}</p>
    <div class="row">${button('Editar anotação', 'edit-diary', entry.id)}${button('Excluir anotação', 'delete-personal', entry.id)}</div>
    </article>`,
    )
    .join('');
}

export function setDiaryFilter(field, value) {
  diaryFilters[field] = value;
  $('diaryEntries').innerHTML = diaryEntriesHTML();
}

function diaryFields(date, notes, prefix) {
  return `<label for="${prefix}Date">Data do diário</label><input id="${prefix}Date" name="date" type="date" required value="${esc(date)}">
    <label for="${prefix}Notes">Observações ou sintomas</label><textarea id="${prefix}Notes" name="notes" required maxlength="5000">${esc(notes)}</textarea>`;
}

export function diaryHTML() {
  return `<section class="panel" aria-labelledby="diaryTitle"><h2 id="diaryTitle">Diário</h2>
    <form data-form="diary">${diaryFields(today(), '', 'diary')}
      <button class="primary" type="submit">Salvar no diário</button></form>
    <label for="diarySearch">Buscar no diário</label><input id="diarySearch" type="search" data-diary-filter="query" value="${esc(diaryFilters.query)}">
    <div class="two"><div><label for="diaryFrom">Diário de</label><input id="diaryFrom" type="date" data-diary-filter="from" value="${esc(diaryFilters.from)}"></div>
    <div><label for="diaryTo">Diário até</label><input id="diaryTo" type="date" data-diary-filter="to" value="${esc(diaryFilters.to)}"></div></div>
    <div id="diaryEntries">${diaryEntriesHTML()}</div>
  </section>`;
}

function saveDiary(data, existing) {
  const date = data.get('date');
  const notes = String(data.get('notes') || '').trim();
  if (!strictDate(date) || !notes) {
    return 'Informe uma data e escreva uma anotação.';
  }
  if (existing && !personalEntries('diary').includes(existing)) {
    return 'A anotação mudou. Feche e tente novamente.';
  }
  return storePersonalEntry({ id: existing?.id || uid(), kind: 'diary', date, notes })
    ? ''
    : 'Não foi possível salvar a anotação. Tente novamente.';
}

export function submitDiary(form) {
  const error = saveDiary(new FormData(form));
  if (error) {
    showToast(error, 'error');
  }
}

export function editDiary(id) {
  const entry = personalEntries('diary').find((item) => item.id === id);
  if (entry) {
    personalDialog('Editar anotação', diaryFields(entry.date, entry.notes, 'editDiary'), (data) =>
      saveDiary(data, entry),
    );
  }
}

export async function deletePersonalEntry(id) {
  const entry = (db.personalEntries || []).find((item) => item.id === id);
  if (!entry || !(await confirmDialog('Excluir item', 'Confirma a exclusão deste item?'))) {
    return;
  }
  const previous = db.personalEntries;
  if (!previous.includes(entry)) {
    return;
  }
  const deleted = db.deleted;
  db.personalEntries = previous.filter((item) => item !== entry);
  db.deleted = [
    ...(deleted || []),
    {
      type: 'personalEntries',
      id,
      deletedAt: new Date(Math.max(Date.now(), Date.parse(entry.updatedAt) + 1)).toISOString(),
    },
  ];
  if (!save()) {
    db.personalEntries = previous;
    db.deleted = deleted;
    return false;
  }
  return true;
}
