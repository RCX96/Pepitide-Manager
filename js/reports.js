import { compoundColorIndex } from './calendar.js';
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
import { emptyState, render, showToast } from './ui.js';
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
    ? `<div class="report-table-wrap"><table class="report-table"><thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((v, i) => `<td data-label="${esc(headers[i])}">${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`
    : emptyState('Nenhum registro para os filtros selecionados.');
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

export function getWeeklyData(apps) {
  if (!apps.length) {
    return [];
  }
  const weeks = new Map();
  for (const app of apps) {
    const d = new Date(app.date + 'T12:00:00Z');
    const day = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() - day);
    const key = d.toISOString().slice(0, 10);
    weeks.set(key, (weeks.get(key) || 0) + 1);
  }
  return Array.from(weeks.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, count]) => {
      const parts = date.split('-');
      return {
        label: `${parts[2]}/${parts[1]}`,
        count,
      };
    });
}

export function barChartSVG(data) {
  if (!data || !data.length) {
    return '';
  }
  const height = 150;
  const width = Math.max(280, data.length * 44);
  const paddingBottom = 28;
  const paddingTop = 20;
  const chartHeight = height - paddingBottom - paddingTop;
  const max = Math.max(...data.map((d) => d.count), 1);
  const barWidth = Math.min(24, Math.floor((width - 40) / data.length) - 6);

  const bars = data
    .map((d, i) => {
      const barH = Math.max(4, Math.round((d.count / max) * chartHeight));
      const x = 25 + i * ((width - 40) / data.length) + 4;
      const y = paddingTop + chartHeight - barH;
      return `
        <rect x="${x}" y="${y}" width="${barWidth}" height="${barH}" rx="4" fill="var(--accent, #62e6d5)" />
        <text x="${x + barWidth / 2}" y="${y - 4}" text-anchor="middle" font-size="10" fill="var(--text-strong, #fff)">${d.count}</text>
        <text x="${x + barWidth / 2}" y="${height - 8}" text-anchor="middle" font-size="10" fill="var(--muted, #91a4bf)">${d.label}</text>
      `;
    })
    .join('');

  return `<div class="chart-container">
    <svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" data-min-width="${width}" aria-hidden="true">
      <line x1="15" y1="${paddingTop + chartHeight}" x2="${width - 10}" y2="${paddingTop + chartHeight}" stroke="var(--line, rgba(148,163,184,0.2))" stroke-width="1" />
      ${bars}
    </svg>
  </div>`;
}

export function compoundBarsHTML(apps) {
  const counts = new Map();
  for (const a of apps) {
    for (const c of a.compounds || []) {
      if (c.name) {
        counts.set(c.name, (counts.get(c.name) || 0) + 1);
      }
    }
  }
  if (!counts.size) {
    return '';
  }
  const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  const max = Math.max(...sorted.map((s) => s[1]), 1);
  return `<div class="compound-bars">${sorted
    .map(([name, count]) => {
      const pct = Math.round((count / max) * 100);
      const color = compoundColorIndex(name);
      return `<div class="compound-bar-row">
        <span class="compound-bar-name">${esc(name)}</span>
        <div class="compound-bar-track">
          <div class="compound-bar-fill c${color}" data-pct="${pct}"></div>
        </div>
        <span class="compound-bar-count">${count}</span>
      </div>`;
    })
    .join('')}</div>`;
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

  const weekly = getWeeklyData(apps);
  const chartsHTML = apps.length
    ? `<div class="panel report-charts">
        <div class="chart-block">
          <h2>Aplicações por semana</h2>
          ${barChartSVG(weekly)}
        </div>
        <div class="chart-block">
          <h2>Aplicações por composto</h2>
          ${compoundBarsHTML(apps)}
        </div>
        <p class="sr-only">Gráficos de resumo com ${apps.length} aplicações distribuídas no período.</p>
      </div>`
    : emptyState('Sem dados para o período selecionado.');

  return `<h1>Relatórios e exportação</h1>
  <div class="grid report-metrics">
    <div class="metric"><span>Aplicações</span><strong>${apps.length}</strong></div>
    <div class="metric"><span>Ciclos no período</span><strong>${cycles.length}</strong></div>
  </div>
  <div class="panel report-filters">
    <h2>Filtros e exportação</h2>
    <div class="two">
      <div><label for="reportFrom">De</label><input id="reportFrom" type="date" value="${esc(reportFrom)}"></div>
      <div><label for="reportTo">Até</label><input id="reportTo" type="date" value="${esc(reportTo)}"></div>
    </div>
    <label for="reportCycle">Ciclo (aplicações e ciclos)</label>
    <select id="reportCycle">${choices}</select>
    <div class="row actions">
      <button type="button" class="primary" data-action="report-set">Aplicar filtros</button>
      <button type="button" data-action="report-clear">Limpar filtros</button>
    </div>
    <div class="row actions export-actions">
      <button type="button" data-action="report-csv" data-id="applications">CSV aplicações</button>
      <button type="button" data-action="report-csv" data-id="cycles">CSV ciclos</button>
      <button type="button" data-action="print">Imprimir / Salvar PDF</button>
    </div>
  </div>
  ${chartsHTML}
  <div class="report-tables">
    <details class="panel report-section" open>
      <summary>Aplicações</summary>
      ${reportTable(['Data', 'Hora', 'Ciclo', 'Compostos e doses', 'Observações'], reportAppRows(apps))}
    </details>
    <details class="panel report-section" open>
      <summary>Ciclos</summary>
      ${reportTable(['Nome', 'Início', 'Fim', 'Estado', 'Dias ativos', 'Aplicações vinculadas'], reportCycleRows(cycles))}
    </details>
  </div>`;
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
