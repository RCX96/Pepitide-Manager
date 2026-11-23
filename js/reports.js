import {
  CYCLE_ID_RE,
  db,
  reportCycle,
  reportFrom,
  reportTo,
  updateReportCycle,
  updateReportFrom,
  updateReportTo,
} from './state.js';
import { render, showToast } from './ui.js';
import { $, csvCell, dateFmt, elapsedCycle, esc, num, today } from './util.js';

export function reportFiltered() {
  const inRange = (date) => (!reportFrom || date >= reportFrom) && (!reportTo || date <= reportTo);
  const apps = db.applications
    .filter((a) => inRange(a.date) && (reportCycle === 'all' || a.cycleId === reportCycle))
    .sort((a, b) => (a.date + ' ' + (a.time || '')).localeCompare(b.date + ' ' + (b.time || '')));
  const cycles = db.cycles.filter(
    (c) =>
      (reportCycle === 'all' || c.id === reportCycle) &&
      (!reportTo || c.start <= reportTo) &&
      (!reportFrom || (c.end || today()) >= reportFrom),
  );
  const weights = db.weights
    .filter((w) => inRange(w.date))
    .sort((a, b) => a.date.localeCompare(b.date));
  return { apps, cycles, weights };
}

export function reportSet() {
  const from = $('reportFrom').value,
    to = $('reportTo').value;
  if (from && to && from > to) {
    showToast('A data inicial não pode ser posterior à final.');
    return;
  }
  updateReportFrom(from);
  updateReportTo(to);
  updateReportCycle($('reportCycle').value);
  render();
}

export function reportTable(headers, rows) {
  return rows.length
    ? `<div class="report-table-wrap"><table class="report-table"><thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((v) => `<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`
    : '<p class="empty">Nenhum registro para os filtros selecionados.</p>';
}

export function reportAppRows(apps) {
  return apps.map((a) => [
    dateFmt(a.date),
    a.time || '—',
    db.cycles.find((c) => c.id === a.cycleId)?.name || 'Sem ciclo',
    a.compounds.map((c) => `${c.name}: ${num(c.dose)} ${c.unit}`).join(' + '),
    a.notes || '',
  ]);
}

export function reportCycleRows(cycles) {
  return cycles.map((c) => [
    c.name,
    dateFmt(c.start),
    c.end ? dateFmt(c.end) : '—',
    { active: 'Em andamento', paused: 'Pausado', finished: 'Finalizado' }[c.status] || c.status,
    String(elapsedCycle(c)),
    String(db.applications.filter((a) => a.cycleId === c.id).length),
  ]);
}

export function reportWeightRows(weights) {
  return weights.map((w, i) => [
    dateFmt(w.date),
    num(w.value) + ' kg',
    i
      ? (Number(w.value) - Number(weights[i - 1].value) > 0 ? '+' : '') +
        num(Number(w.value) - Number(weights[i - 1].value)) +
        ' kg'
      : '—',
  ]);
}

export function reportsLegacy() {
  const { apps, cycles } = reportFiltered();
  const choices = [
    `<option value="all">Todos os ciclos</option>`,
    ...db.cycles
      .filter((c) => CYCLE_ID_RE.test(c.id))
      .map(
        (c) =>
          `<option value="${esc(c.id)}" ${reportCycle === c.id ? 'selected' : ''}>${esc(c.name)}</option>`,
      ),
  ].join('');
  return `<h1>Relatórios e exportação</h1><div class="panel report-filters"><h2>Filtros</h2><div class="two"><div><label>De</label><input id="reportFrom" type="date" value="${esc(reportFrom)}"></div><div><label>Até</label><input id="reportTo" type="date" value="${esc(reportTo)}"></div></div><label>Ciclo (aplicações e ciclos)</label><select id="reportCycle">${choices}</select><div class="row actions"><button type="button" class="primary" data-action="report-set">Aplicar filtros</button><button type="button" data-action="report-clear">Limpar filtros</button></div></div><div class="grid"><div class="metric"><span>Aplicações</span><strong>${apps.length}</strong></div><div class="metric"><span>Ciclos no período</span><strong>${cycles.length}</strong></div></div><div class="panel report-tools"><button type="button" class="primary" data-action="report-csv" data-id="applications">CSV aplicações</button><button type="button" data-action="report-csv" data-id="cycles">CSV ciclos</button><button type="button" data-action="print">Imprimir / Salvar PDF</button></div><div class="panel"><h2>Aplicações</h2>${reportTable(['Data', 'Hora', 'Ciclo', 'Compostos e doses', 'Observações'], reportAppRows(apps))}</div><div class="panel"><h2>Ciclos</h2>${reportTable(['Nome', 'Início', 'Fim', 'Estado', 'Dias ativos', 'Aplicações vinculadas'], reportCycleRows(cycles))}</div>`;
}

export function reports() {
  return reportsLegacy();
}

export function exportReportCSV(kind) {
  const data = reportFiltered();
  const map = {
    applications: {
      headers: ['Data', 'Hora', 'Ciclo', 'Compostos e doses', 'Observações'],
      rows: reportAppRows(data.apps),
    },
    cycles: {
      headers: ['Nome', 'Início', 'Fim', 'Estado', 'Dias ativos', 'Aplicações vinculadas'],
      rows: reportCycleRows(data.cycles),
    },
    weights: {
      headers: ['Data', 'Peso', 'Diferença desde a pesagem anterior'],
      rows: reportWeightRows(data.weights),
    },
  };
  const entry = map[kind];
  if (!entry) {
    return;
  }
  const csv =
    '\ufeff' + [entry.headers, ...entry.rows].map((row) => row.map(csvCell).join(';')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `peptide-manager-${kind}-${today()}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
