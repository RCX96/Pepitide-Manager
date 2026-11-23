import { db, suppressHomeCalendar } from './state.js';
import { render } from './ui.js';
import { $, dateFmt, esc, today, uniqueCompoundNames } from './util.js';

/** Hash estável nome → índice 0-7 → variável CSS --c1..--c8 */
export function compoundColorIndex(name) {
  let h = 0;
  const s = String(name).toLocaleLowerCase('pt-BR');
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return (Math.abs(h) % 8) + 1;
}

/** Renderiza pontos coloridos (mobile ≤480px) ou pílulas texto (>480px)
 *  num contêiner já inserido no DOM. */
export function renderCompoundMarkers(container, names, isMobile) {
  if (isMobile) {
    const show = names.length > 3 ? names.slice(0, 2) : names.slice(0, 3);
    const extra = names.length - show.length;
    const dots = show
      .map((n) => `<span class="cal-dot c${compoundColorIndex(n)}" title="${esc(n)}"></span>`)
      .join('');
    const extraSpan = extra > 0 ? `<span class="cal-dot-extra">+${extra}</span>` : '';
    container.innerHTML = `<span class="cal-dots">${dots}${extraSpan}</span>`;
  } else {
    container.innerHTML = names
      .map((n) => `<span class="c${compoundColorIndex(n)}">${esc(n)}</span>`)
      .join('');
  }
}

export function compoundsOnDate(date) {
  return uniqueCompoundNames(
    db.applications
      .filter((a) => a.date === date)
      .flatMap((a) => (a.compounds || []).map((c) => c.name)),
  );
}

export function decorateCalendarCompounds() {
  const app = $('app');
  if (!app || typeof app.querySelectorAll !== 'function') {
    return;
  }
  const isMobile = window.matchMedia?.('(max-width: 480px)').matches;
  app.querySelectorAll('.calendar-day').forEach((day) => {
    const date = day.getAttribute('data-id');
    const summary = day.querySelector('.calendar-count');
    if (!date || !summary) {
      return;
    }
    const names = compoundsOnDate(date);
    if (names.length) {
      if (isMobile) {
        const show = names.length > 3 ? names.slice(0, 2) : names.slice(0, 3);
        const extra = names.length - show.length;
        const dots = show
          .map((n) => `<span class="cal-dot c${compoundColorIndex(n)}" title="${esc(n)}"></span>`)
          .join('');
        const extraSpan = extra > 0 ? `<span class="cal-dot-extra">+${extra}</span>` : '';
        summary.innerHTML = `<span class="cal-dots">${dots}${extraSpan}</span>`;
      } else {
        summary.innerHTML = names
          .map(
            (name) =>
              `<span class="calendar-compound c${compoundColorIndex(name)}">${esc(name)}</span>`,
          )
          .join('');
      }
    } else {
      summary.innerHTML = '';
    }
    day.setAttribute(
      'aria-label',
      `${dateFmt(date)}: ${names.length ? names.join(', ') : 'Nenhum composto'}`,
    );
  });

  // legenda dos compostos visíveis no período
  const calPanel = app.querySelector('.panel');
  if (calPanel) {
    const visibleDates = [...app.querySelectorAll('.calendar-day[data-id]')].map((d) =>
      d.getAttribute('data-id'),
    );
    const seenNames = new Map();
    for (const date of visibleDates) {
      for (const name of compoundsOnDate(date)) {
        if (!seenNames.has(name)) {
          seenNames.set(name, compoundColorIndex(name));
        }
      }
    }
    const existing = calPanel.querySelector('.cal-legend');
    if (existing) {
      existing.remove();
    }
    if (seenNames.size) {
      const legendHTML = `<div class="cal-legend">${[...seenNames.entries()]
        .map(
          ([name, index]) =>
            `<span class="cal-legend-item"><span class="cal-legend-dot c${index}"></span>${esc(name)}</span>`,
        )
        .join('')}</div>`;
      calPanel.insertAdjacentHTML('beforeend', legendHTML);
    }
  }

  const selected = app.querySelector('.calendar-day.selected');
  const grid = selected?.closest('.calendar-grid');
  if (selected && grid && window.matchMedia?.('(max-width: 700px)').matches) {
    grid.scrollLeft = Math.max(
      0,
      selected.offsetLeft - (grid.clientWidth - selected.offsetWidth) / 2,
    );
  }
}

export let calendarView = 'week',
  calendarFocus = today().slice(0, 7),
  calendarSelected = today();

export function calUTC(s) {
  return new Date(s + 'T12:00:00Z');
}

export function calISO(d) {
  return d.toISOString().slice(0, 10);
}

export function calMove(n) {
  const [y, m] = calendarFocus.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1, 12));
  calendarFocus = calISO(d).slice(0, 7);
  if (calendarView === 'week') {
    const selected = calUTC(calendarSelected);
    selected.setUTCDate(selected.getUTCDate() + 7 * n);
    calendarSelected = calISO(selected);
    calendarFocus = calendarSelected.slice(0, 7);
  }
  render();
}

export function calSetView(v) {
  calendarView = v;
  render();
}

export function calSelect(s) {
  calendarSelected = s;
  calendarFocus = s.slice(0, 7);
  render();
}

export function calToday() {
  calendarSelected = today();
  calendarFocus = calendarSelected.slice(0, 7);
  render();
}

export function calendarPage() {
  const [year, month] = calendarFocus.split('-').map(Number),
    start = new Date(Date.UTC(year, month - 1, 1, 12)),
    monthTitle = start.toLocaleDateString('pt-BR', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });
  let days = [];
  if (calendarView === 'month') {
    const first = (start.getUTCDay() + 6) % 7;
    const length = new Date(Date.UTC(year, month, 0, 12)).getUTCDate();
    for (let i = 0; i < first; i++) {
      days.push(null);
    }
    for (let d = 1; d <= length; d++) {
      days.push(`${calendarFocus}-${String(d).padStart(2, '0')}`);
    }
  } else {
    const anchor = calUTC(calendarSelected),
      weekday = (anchor.getUTCDay() + 6) % 7;
    anchor.setUTCDate(anchor.getUTCDate() - weekday);
    for (let i = 0; i < 7; i++) {
      const d = new Date(anchor);
      d.setUTCDate(d.getUTCDate() + i);
      days.push(calISO(d));
    }
  }
  const counts = {};
  for (const a of db.applications) {
    counts[a.date] = (counts[a.date] || 0) + 1;
  }
  const chosen = db.applications
    .filter((a) => a.date === calendarSelected)
    .sort((a, b) => (a.time || '').localeCompare(b.time || ''));
  const heading =
    calendarView === 'month' ? monthTitle : `Semana de ${dateFmt(days[0])} a ${dateFmt(days[6])}`;
  const calendarClass =
    calendarView === 'week' ? 'calendar-grid calendar-week-grid' : 'calendar-grid';
  return `<h1>Calendário de aplicações</h1><div class="panel"><div class="calendar-tools"><div class="row"><button type="button" data-action="cal-prev" aria-label="Período anterior">‹</button><button type="button" data-action="cal-today">Hoje</button><button type="button" data-action="cal-next" aria-label="Próximo período">›</button></div><div class="row"><button type="button" class="${calendarView === 'month' ? 'primary' : ''}" data-action="cal-view" data-id="month">Mês</button><button type="button" class="${calendarView === 'week' ? 'primary' : ''}" data-action="cal-view" data-id="week">Semana</button></div></div><h2>${esc(heading)}</h2><div class="${calendarClass}">${['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((w) => `<div class="calendar-weekday">${w}</div>`).join('')}${days.map((s) => (s ? `<button type="button" class="calendar-day ${s === calendarSelected ? 'selected' : ''} ${s === today() ? 'today' : ''}" data-action="cal-select" data-id="${esc(s)}" aria-label="${dateFmt(s)}: ${counts[s] || 0} aplicação(ões)"><span>${Number(s.slice(-2))}</span>${counts[s] ? `<span class="calendar-count">${counts[s]} aplicação${counts[s] === 1 ? '' : 'ões'}</span>` : ''}</button>` : '<div class="calendar-empty"></div>')).join('')}</div></div><div class="panel calendar-list"><h2>Aplicações de ${dateFmt(calendarSelected)}</h2>${chosen.length ? chosen.map((a) => `<div class="item"><b>${esc(a.time || 'Horário não informado')}</b><p>${a.compounds.map((c) => `${esc(c.name)} (${esc(c.dose)} ${esc(c.unit)})`).join(' + ')}</p><p class="muted">${esc(db.cycles.find((c) => c.id === a.cycleId)?.name || 'Sem ciclo')}${a.notes ? ' • ' + esc(a.notes) : ''}</p></div>`).join('') : '<p class="empty">Nenhuma aplicação registrada neste dia.</p>'}</div>`;
}

export function homeCalendar() {
  if (suppressHomeCalendar) {
    return '';
  }
  const [y, m] = today().split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1, 12));
  const length = new Date(Date.UTC(y, m, 0, 12)).getUTCDate();
  const first = (start.getUTCDay() + 6) % 7;
  const weekdays = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
  const weekdayHTML = weekdays.map((w) => `<div class="calendar-weekday">${w}</div>`).join('');
  const byDate = {};
  for (const a of db.applications) {
    if (!byDate[a.date]) {
      byDate[a.date] = [];
    }
    byDate[a.date].push(a);
  }
  let cells = '';
  for (let i = 0; i < first; i += 1) {
    cells += '<div class="calendar-empty"></div>';
  }
  for (let d = 1; d <= length; d += 1) {
    const date = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const apps = byDate[date] || [];
    const seen = new Set();
    const names = [];
    for (const a of apps) {
      for (const c of a.compounds || []) {
        const key = String(c.name).trim();
        if (key && !seen.has(key.toLocaleLowerCase('pt-BR'))) {
          seen.add(key.toLocaleLowerCase('pt-BR'));
          names.push(key);
        }
      }
    }
    const number = String(d).padStart(2, '0');
    const isMobile = window.matchMedia?.('(max-width: 480px)').matches;
    let compounds = '';
    if (names.length) {
      if (isMobile) {
        const show = names.length > 3 ? names.slice(0, 2) : names.slice(0, 3);
        const extra = names.length - show.length;
        const dots = show
          .map((n) => `<span class="cal-dot c${compoundColorIndex(n)}" title="${esc(n)}"></span>`)
          .join('');
        const extraSpan = extra > 0 ? `<span class="cal-dot-extra">+${extra}</span>` : '';
        compounds = `<span class="cal-dots">${dots}${extraSpan}</span>`;
      } else {
        compounds = `<span class="cal-compounds">${names
          .map((n) => `<span class="c${compoundColorIndex(n)}">${esc(n)}</span>`)
          .join('')}</span>`;
      }
    }
    cells += `
      <button class="cal-cell" data-action="quick-register-date" data-id="${date}" aria-label="${names.length ? `${dateFmt(date)}: ${names.join(', ')}` : `Registrar aplicação em ${dateFmt(date)}`} ">
        <span class="cal-day-number">${number}</span>
        ${compounds}
      </button>`;
  }
  const monthTitle = start.toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return `
    <div class="panel">
      <h2>Calendário de aplicações</h2>
      <p class="calendar-month-title">${monthTitle}</p>
      <p class="muted">Registros do mês. Clique em um dia para cadastrar aplicação na data indicada.</p>
      <div class="calendar-grid">${weekdayHTML}</div>
      <div class="calendar-grid calendar-date-grid">${cells}</div>
    </div>`;
}
