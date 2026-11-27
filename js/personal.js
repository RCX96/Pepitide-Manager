import { db } from './state.js';
import { button, confirmDialog, promptDialog, showToast } from './ui.js';
import { dateFmt, esc, save, strictDate, today, uid } from './util.js';

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

export async function planApplication(date) {
  if (!strictDate(date)) {
    return;
  }
  const title = (
    await promptDialog({
      title: 'Planejar aplicação',
      text: `Identificação do compromisso de ${dateFmt(date)}`,
    })
  )?.trim();
  if (title && title.length > 120) {
    showToast('Use até 120 caracteres no nome.', 'error');
  } else if (title) {
    storePersonalEntry({ id: uid(), kind: 'plan', title, date, status: 'planned' });
  }
}

export function setPlanStatus(id, status) {
  const plan = personalEntries('plan').find((entry) => entry.id === id);
  if (plan && plan.status !== 'recorded') {
    storePersonalEntry({ ...plan, status });
  }
}

export function plannedApplicationsHTML(date) {
  const labels = { planned: 'Planejado', skipped: 'Pulado', recorded: 'Registrado' };
  const plans = personalEntries('plan').filter((entry) => entry.date === date);
  return `<section><h3>Planejamento</h3>
    ${button('+ Planejar aplicação', 'new-plan', date)}
    ${plans
      .map(
        (
          plan,
        ) => `<div class="item"><div class="row between"><strong>${esc(plan.title)}</strong><span class="pill">${labels[plan.status]}</span></div>
      <div class="row">${plan.status === 'planned' ? button('Registrar', 'record-plan', plan.id) + button('Marcar como pulado', 'skip-plan', plan.id) : ''}
      ${plan.status === 'skipped' ? button('Voltar a planejar', 'reopen-plan', plan.id) : ''}
      ${button('Excluir do planejamento', 'delete-personal', plan.id)}</div></div>`,
      )
      .join('')}
  </section>`;
}

export function diaryHTML() {
  const entries = personalEntries('diary').sort(
    (a, b) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt),
  );
  return `<section class="panel"><h2>Diário</h2><form data-form="diary">
    <label for="diaryDate">Data do diário</label><input id="diaryDate" name="date" type="date" required value="${today()}">
    <label for="diaryNotes">Observações ou sintomas</label><textarea id="diaryNotes" name="notes" required maxlength="5000"></textarea>
    <button class="primary" type="submit">Salvar no diário</button></form>
    ${
      entries.length
        ? entries
            .map(
              (entry) => `<article class="item"><b>${dateFmt(entry.date)}</b>
      <p>${esc(entry.notes).replaceAll('\n', '<br>')}</p>${button('Excluir anotação', 'delete-personal', entry.id)}</article>`,
            )
            .join('')
        : '<p class="muted">Nenhuma anotação no diário.</p>'
    }</section>`;
}

export function submitDiary(form) {
  const data = new FormData(form);
  const date = data.get('date');
  const notes = String(data.get('notes') || '').trim();
  if (!strictDate(date) || !notes) {
    showToast('Informe uma data e escreva uma anotação.', 'error');
    return;
  }
  storePersonalEntry({ id: uid(), kind: 'diary', date, notes });
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
