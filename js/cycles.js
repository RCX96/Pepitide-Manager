import { CYCLE_ID_RE, db, editing, updateEditing } from './state.js';
import { button, emptyState, showToast } from './ui.js';
import { dateFmt, dayCount, elapsedCycle, esc, save, today, uid } from './util.js';

export function cycleDetails(x) {
  const todayDate = today(),
    stop = x.status === 'finished' ? x.end || todayDate : todayDate;
  const total = dayCount(x.start, stop);
  const active = elapsedCycle(x);
  const periods = (x.pauses || [])
    .map(
      (p) =>
        `<div class="muted">⏸ ${dateFmt(p.start)} até ${p.end ? dateFmt(p.end) : 'em andamento'}</div>`,
    )
    .join('');
  const appCount = db.applications.filter((a) => a.cycleId === x.id).length;

  const durDays = dayCount(x.start, todayDate);
  const remaining = x.end && x.end > todayDate ? dayCount(todayDate, x.end) - 1 : 0;
  const totalPlanned = x.end ? dayCount(x.start, x.end) : 0;
  const pct =
    totalPlanned > 0
      ? Math.min(100, Math.round((durDays / totalPlanned) * 100))
      : x.status === 'finished'
        ? 100
        : 100;

  return `<p><strong>${active} dias ativos</strong> <span class="muted">• ${total} dias corridos • ${appCount} aplicação(ões)</span></p>
  <div class="cycle-progress" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="Progresso do ciclo ${esc(x.name)}">
    <div class="cycle-progress-fill" style="width:${pct}%;"></div>
  </div>
  ${remaining > 0 ? `<p class="muted">Faltam ${remaining} dias</p>` : ''}
  <p class="muted">Início: ${dateFmt(x.start)}${x.status === 'finished' && x.end ? ' • Término: ' + dateFmt(x.end) : ''}</p>
  ${periods ? `<details><summary>Pausas (${(x.pauses || []).length})</summary><div class="item">${periods}</div></details>` : ''}`;
}

export function renderCycleCard(x) {
  const statusLabel =
    x.status === 'active' ? 'Em andamento' : x.status === 'paused' ? 'Pausado' : 'Finalizado';
  return `<div class="item">
    <div class="row between">
      <b>${esc(x.name)}</b>
      <span class="pill ${x.status}">${statusLabel}</span>
    </div>
    ${cycleDetails(x)}
    <p>${esc(x.notes || '')}</p>
    <div class="row">
      ${button('Editar', 'edit-cycle', x.id)}
      ${x.status === 'active' ? button('Pausar', 'pause-cycle', x.id) : x.status === 'paused' ? button('Retomar', 'resume-cycle', x.id) : button('Reabrir', 'resume-cycle', x.id)}
      ${x.status !== 'finished' ? button('Finalizar', 'finish-cycle', x.id) : ''}
      ${button('Excluir', 'delete-cycle', x.id, 'danger')}
    </div>
  </div>`;
}

export function cycles() {
  const c = editing ? db.cycles.find((x) => x.id === editing && CYCLE_ID_RE.test(x.id)) : null;
  const validCycles = db.cycles.filter(
    (x) => x && typeof x.id === 'string' && CYCLE_ID_RE.test(x.id),
  );
  const ongoing = validCycles.filter((x) => x.status !== 'finished');
  const finished = validCycles.filter((x) => x.status === 'finished');

  let listHTML = '';
  if (!validCycles.length) {
    listHTML = emptyState('Nenhum ciclo salvo.', 'Criar o primeiro ciclo', 'set-tab', 'ciclos');
  } else {
    listHTML = ongoing.map(renderCycleCard).join('');
    if (finished.length) {
      listHTML += `<details class="finished-cycles">
        <summary>Ciclos finalizados (${finished.length})</summary>
        ${finished.map(renderCycleCard).join('')}
      </details>`;
    }
  }

  return `<h1>Ciclos salvos</h1>
  <div class="panel">
    <h2>${c ? 'Editar ciclo' : 'Novo ciclo'}</h2>
    <form data-form="cycle">
      <label>Nome</label>
      <input name="name" required value="${esc(c?.name || '')}" placeholder="Ex.: Ciclo de novembro">
      <div class="two">
        <div><label>Data de início</label><input type="date" name="start" required value="${c?.start || today()}"></div>
        <div><label>Data de término (opcional)</label><input type="date" name="end" value="${c?.end || ''}"></div>
      </div>
      <label>Situação</label>
      <select name="status">
        <option value="active" ${!c || c.status === 'active' ? 'selected' : ''}>Em andamento</option>
        <option value="paused" ${c?.status === 'paused' ? 'selected' : ''}>Pausado</option>
        <option value="finished" ${c?.status === 'finished' ? 'selected' : ''}>Finalizado</option>
      </select>
      <label>Observações</label>
      <textarea name="notes">${esc(c?.notes || '')}</textarea>
      <div class="row actions">
        <button type="submit" class="primary">Salvar ciclo</button>
        ${c ? button('Cancelar', 'cancel-cycle') : ''}
      </div>
    </form>
  </div>
  <div class="panel">
    <h2>Meus ciclos</h2>
    ${listHTML}
  </div>`;
}

export function changeCycleStatus(id, status) {
  if (!id || !CYCLE_ID_RE.test(id)) {
    return;
  }
  const c = db.cycles.find((x) => x.id === id);
  if (!c || c.status === status) {
    return;
  }
  const now = today();
  c.pauses = Array.isArray(c.pauses) ? c.pauses : [];
  if (c.status === 'paused') {
    const open = c.pauses.findLast((p) => !p.end);
    if (open) {
      open.end = now;
    }
  }
  if (status === 'paused') {
    c.pauses.push({ start: now, end: null });
  }
  if (status === 'finished') {
    c.end = now;
  }
  if (status === 'active' && c.status === 'finished') {
    c.end = '';
  }
  c.status = status;
  c.updatedAt = new Date().toISOString();
  save();
}

export function submitCycle(e) {
  e.preventDefault();
  const f = new FormData(e.target);
  if (f.get('end') && f.get('end') < f.get('start')) {
    showToast('A data final deve ser igual ou posterior ao início.');
    return;
  }
  const old = editing ? db.cycles.find((x) => x.id === editing && CYCLE_ID_RE.test(x.id)) : null;
  const cycleId = editing || uid();
  if (!CYCLE_ID_RE.test(cycleId)) {
    showToast('Identificador de ciclo inválido.');
    return;
  }
  const item = {
    id: cycleId,
    name: f.get('name').trim(),
    start: f.get('start'),
    end: f.get('end'),
    status: old?.status || 'active',
    notes: f.get('notes'),
    pauses: old?.pauses || [],
    updatedAt: new Date().toISOString(),
  };
  if (editing) {
    db.cycles = db.cycles.map((x) => (x.id === editing ? item : x));
  } else {
    db.cycles.push(item);
  }
  if (item.status !== f.get('status')) {
    changeCycleStatusWithoutSave(item, f.get('status'));
  }
  updateEditing(null);
  save();
}

export function changeCycleStatusWithoutSave(c, status) {
  const now = today();
  if (c.status === 'paused') {
    const open = c.pauses.findLast((p) => !p.end);
    if (open) {
      open.end = now;
    }
  }
  if (status === 'paused') {
    c.pauses.push({ start: now, end: null });
  }
  if (status === 'finished' && !c.end) {
    c.end = now;
  }
  if (status === 'active' && c.status === 'finished') {
    c.end = '';
  }
  c.status = status;
}
