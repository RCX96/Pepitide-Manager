const KEY = 'peptide-manager-v1';
const BACKUP_META_KEY = 'peptide-manager-backup-meta-v2.2';
// Chave publicável do Supabase: feita para ir no app. A proteção real é o RLS (cada conta lê só o que é dela).
const SUPABASE_URL = 'https://bcmshjfolhetogfkebnj.supabase.co';
const SUPABASE_KEY = 'sb_publishable_Jo-vZQmILG2MDXT0LEDYjg_xZV2TWNb';
const CYCLE_ID_RE = /^[a-f0-9-]{1,64}$/i;
const blank = () => ({
  applications: [],
  cycles: [],
  weights: [],
  goal: null,
  trash: [],
  compoundCatalog: [],
  reminders: [],
});
let db,
  loadError = '';
try {
  const stored = localStorage.getItem(KEY);
  const parsed = stored ? JSON.parse(stored) : {};
  if (stored) {
    validateBackup(parsed);
  }
  db = { ...blank(), ...parsed };
} catch (e) {
  loadError =
    'Não foi possível ler os dados locais. Nenhum dado foi apagado. Faça uma cópia dos dados do navegador antes de tentar recuperar: ' +
    e.message;
  db = blank();
}
let tab = 'inicio',
  editing = null,
  draftFromCalendar = false,
  appDraft = null,
  compounds = [{ name: '', dose: '', unit: 'mg' }],
  applicationFilter = '',
  catalogFilter = '',
  suppressHomeCalendar = false,
  supabaseClient = null,
  supabaseUser = null,
  supabaseSyncStatus = '',
  supabaseSyncError = '',
  supabaseLastSync =
    typeof localStorage !== 'undefined'
      ? localStorage.getItem('peptide-supabase-last-sync') || ''
      : '',
  syncTimer = null;
const LOCK_KEY = 'peptide-manager-lock-v1';
let unlocked = !localStorage.getItem(LOCK_KEY);
const $ = (id) => document.getElementById(id),
  esc = (x) =>
    String(x ?? '').replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
    );
const today = () => new Date().toLocaleDateString('en-CA');
const save = () => {
  if (loadError) {
    alert('Gravação bloqueada: os dados locais precisam ser recuperados antes de continuar.');
    return;
  }
  try {
    validateBackup(db);
    localStorage.setItem(KEY, JSON.stringify(db));
    scheduleCloudSync();
    render();
  } catch (e) {
    alert(
      'Não foi possível salvar com segurança: ' +
        e.message +
        '\nOs dados persistidos não foram substituídos. Recarregue o aplicativo para recuperar o último estado salvo.',
    );
    console.error(e);
  }
};
const dateFmt = (s) => (s ? new Date(s + 'T12:00:00').toLocaleDateString('pt-BR') : '—');
const num = (n) => Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const uid = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Date.now().toString(16) + '-' + Math.floor(Math.random() * 0xffffffff).toString(16);
};
function uniqueCompoundNames(names) {
  const result = [];
  const seen = new Set();
  for (const value of names) {
    const name = String(value ?? '').trim();
    const key = name.toLocaleLowerCase('pt-BR');
    if (name && !seen.has(key)) {
      seen.add(key);
      result.push(name);
    }
  }
  return result.slice(0, 200);
}
function rememberedCompoundNames() {
  return uniqueCompoundNames([
    ...(Array.isArray(db.compoundCatalog) ? db.compoundCatalog : []),
    ...db.applications.flatMap((a) => (a.compounds || []).map((c) => c.name)),
  ]);
}
function rememberCompoundNames(names) {
  db.compoundCatalog = uniqueCompoundNames([...(db.compoundCatalog || []), ...names]);
}
function lastCompoundEntry(name) {
  const key = String(name || '')
    .trim()
    .toLocaleLowerCase('pt-BR');
  return db.applications
    .slice()
    .reverse()
    .flatMap((a) => a.compounds || [])
    .find(
      (c) =>
        String(c.name || '')
          .trim()
          .toLocaleLowerCase('pt-BR') === key,
    );
}
function filteredApplications() {
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
function setApplicationFilter(value) {
  applicationFilter = String(value || '');
  render();
}
function renameCompound(oldName, newName) {
  const clean = String(newName || '').trim();
  if (!clean) {
    return;
  }
  db.compoundCatalog = uniqueCompoundNames(
    (db.compoundCatalog || []).map((n) => (n === oldName ? clean : n)),
  );
  save();
}
function removeCompoundName(name) {
  db.compoundCatalog = (db.compoundCatalog || []).filter((n) => n !== name);
  save();
}
let historyCompound = '';
function reminderMatchesDate(reminder, date) {
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
function remindersOnDate(date) {
  return (db.reminders || []).filter((r) => reminderMatchesDate(r, date));
}
function saveReminder(e) {
  e.preventDefault();
  const f = new FormData(e.target);
  const item = {
    id: uid(),
    compoundName: String(f.get('compoundName') || '').trim(),
    date: f.get('date'),
    time: f.get('time') || '',
    repeat: f.get('repeat') || 'none',
    active: true,
  };
  if (!item.compoundName || !strictDate(item.date)) {
    return alert('Informe composto e data válidos.');
  }
  db.reminders = Array.isArray(db.reminders) ? db.reminders : [];
  db.reminders.push(item);
  rememberCompoundNames([item.compoundName]);
  save();
}
function deleteReminder(id) {
  db.reminders = (db.reminders || []).filter((r) => r.id !== id);
  save();
}
function quickRegister() {
  const latest = db.applications
    .slice()
    .sort((a, b) => `${b.date}${b.time || ''}`.localeCompare(`${a.date}${a.time || ''}`))[0];
  if (latest) {
    return copyApp(latest.id);
  }
  setTab('aplicacoes');
}
function compoundHistory(name) {
  const key = String(name || '')
    .trim()
    .toLocaleLowerCase('pt-BR');
  return db.applications
    .filter((a) =>
      (a.compounds || []).some(
        (c) =>
          String(c.name || '')
            .trim()
            .toLocaleLowerCase('pt-BR') === key,
      ),
    )
    .sort((a, b) => b.date.localeCompare(a.date));
}
async function hashText(value) {
  if (crypto?.subtle) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  return btoa(unescape(encodeURIComponent(value)));
}
async function setLock() {
  const first = prompt('Crie um código local com pelo menos 4 caracteres:');
  if (!first || first.length < 4) {
    return alert('O código precisa ter pelo menos 4 caracteres.');
  }
  const second = prompt('Repita o código:');
  if (first !== second) {
    return alert('Os códigos não conferem.');
  }
  localStorage.setItem(LOCK_KEY, await hashText(first));
  unlocked = true;
  alert('Código local criado.');
  render();
}
async function removeLock() {
  const code = prompt('Digite o código atual para remover a proteção:');
  if (!code || (await hashText(code)) !== localStorage.getItem(LOCK_KEY)) {
    return alert('Código incorreto.');
  }
  localStorage.removeItem(LOCK_KEY);
  alert('Proteção removida.');
  render();
}
async function unlockApp() {
  const input = $('unlockCode');
  if (!input || (await hashText(input.value)) !== localStorage.getItem(LOCK_KEY)) {
    alert('Código incorreto.');
    return;
  }
  unlocked = true;
  render();
}
function compoundNameList() {
  return `<datalist id="compoundNames">${rememberedCompoundNames()
    .map((name) => `<option value="${esc(name)}"></option>`)
    .join('')}</datalist>`;
}
const button = (label, action, id = '', cls = '', extra = '') =>
  `<button type="button" class="${cls}" data-action="${action}"${id !== '' && id !== null && id !== undefined ? ` data-id="${esc(id)}"` : ''}${extra}>${label}</button>`;
const navs = [
  ['inicio', '⌂ Início'],
  ['aplicacoes', '♢ Aplicações'],
  ['ciclos', '◷ Ciclos'],
  ['relatorios', '▤ Relatórios'],
  ['configuracoes', '⚙ Ajustes'],
];
function navHTML() {
  return navs
    .map(
      ([id, label]) =>
        `<button type="button" data-action="set-tab" data-id="${esc(id)}">${label}</button>`,
    )
    .join('');
}
function setTab(t) {
  tab = t;
  editing = null;
  render();
  syncNav();
}
function syncNav() {
  const n = $('bottom-nav');
  if (!n || !n.querySelectorAll) {
    return;
  }
  for (const b of n.querySelectorAll('button')) {
    b.classList.toggle('active', b.getAttribute('data-id') === tab);
  }
}
function extraPanels() {
  if (tab === 'aplicacoes') {
    return `<div class="panel quick-filter"><h2>Buscar aplicações</h2><label class="sr-only" for="applicationSearch">Buscar aplicações</label><input id="applicationSearch" type="search" aria-label="Buscar aplicações" value="${esc(applicationFilter)}" placeholder="Composto, data ou observação" oninput="setApplicationFilter(this.value)"></div>`;
  }
  if (tab === 'configuracoes') {
    const names = rememberedCompoundNames().filter(
      (n) =>
        !catalogFilter ||
        n.toLocaleLowerCase('pt-BR').includes(catalogFilter.toLocaleLowerCase('pt-BR')),
    );
    return `<div class="panel"><h2>Catálogo de compostos</h2><input type="search" placeholder="Filtrar catálogo" value="${esc(catalogFilter)}" oninput="catalogFilter=this.value;render()"><div class="catalog-list">${names.length ? names.map((name) => `<div class="row between catalog-row"><span>${esc(name)}</span><span class="row"><button type="button" data-action="rename-compound" data-id="${esc(name)}">Renomear</button><button type="button" class="danger" data-action="remove-compound-name" data-id="${esc(name)}">Remover</button></span></div>`).join('') : '<p class="empty">Nenhum composto salvo.</p>'}</div></div><div class="panel"><h2>Proteção local</h2>${localStorage.getItem('peptide-manager-lock-v1') ? button('Alterar código local', 'set-lock') + button('Remover código local', 'remove-lock') : button('Criar código local', 'set-lock', '', 'primary')}</div>`;
  }
  return '';
}
function animateRender() {
  const app = $('app');
  if (!app || typeof app.querySelectorAll !== 'function') {
    return;
  }
  const nodes = app.querySelectorAll('.panel, .metric, .item, .calendar-day');
  nodes.forEach((node, index) => {
    node.classList.add('reveal');
    const show = () => node.classList.add('is-visible');
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => setTimeout(show, Math.min(index * 28, 240)));
    } else {
      show();
    }
  });
}
function compoundsOnDate(date) {
  return uniqueCompoundNames(
    db.applications
      .filter((a) => a.date === date)
      .flatMap((a) => (a.compounds || []).map((c) => c.name)),
  );
}
function decorateCalendarCompounds() {
  const app = $('app');
  if (!app || typeof app.querySelectorAll !== 'function') {
    return;
  }
  app.querySelectorAll('.calendar-day').forEach((day) => {
    const date = day.getAttribute('data-id');
    const summary = day.querySelector('.calendar-count');
    if (!date || !summary) {
      return;
    }
    const names = compoundsOnDate(date);
    summary.innerHTML = names.length
      ? names.map((name) => `<span class="calendar-compound">${esc(name)}</span>`).join('')
      : '<span class="calendar-compound empty">Sem composto</span>';
    day.setAttribute(
      'aria-label',
      `${dateFmt(date)}: ${names.length ? names.join(', ') : 'Nenhum composto'}`,
    );
  });
  const selected = app.querySelector('.calendar-day.selected');
  const grid = selected?.closest('.calendar-grid');
  if (selected && grid && window.matchMedia?.('(max-width: 700px)').matches) {
    grid.scrollLeft = Math.max(
      0,
      selected.offsetLeft - (grid.clientWidth - selected.offsetWidth) / 2,
    );
  }
}
function applicationsExtraPanel() {
  const names = rememberedCompoundNames();
  const history = historyCompound ? compoundHistory(historyCompound) : [];
  return `<div class="panel"><h2>Histórico por composto</h2><label for="historyCompound">Composto</label><select id="historyCompound" aria-label="Filtrar histórico por composto" onchange="historyCompound=this.value;render()"><option value="">Escolha um composto</option>${names.map((n) => `<option value="${esc(n)}" ${historyCompound === n ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>${historyCompound ? (history.length ? history.map((a) => `<div class="item"><b>${dateFmt(a.date)} ${esc(a.time || '')}</b><p>${a.compounds.map((c) => `${esc(c.name)} (${esc(c.dose)} ${esc(c.unit)})`).join(' + ')}</p></div>`).join('') : '<p class="empty">Nenhum registro para este composto.</p>') : ''}</div>`;
}
function encryptedBackupPanel() {
  return `<div class="panel"><h2>Backup criptografado</h2><div class="row">${button('Exportar criptografado', 'export-encrypted', '', 'primary')}${button('Importar criptografado', 'import-encrypted')}</div></div>`;
}
function appendRendered(html) {
  const app = $('app');
  if (app && typeof app.insertAdjacentHTML === 'function') {
    app.insertAdjacentHTML('beforeend', html);
  }
}
function render() {
  if (!unlocked) {
    $('bottom-nav').innerHTML = '';
    $('app').innerHTML =
      '<div class="panel lock-screen"><h1>Aplicativo protegido</h1><p>Digite seu código local para abrir os registros.</p><input id="unlockCode" type="password" autocomplete="current-password" placeholder="Código local"><button type="button" class="primary" data-action="unlock-app">Desbloquear</button></div>';
    return;
  }
  if (loadError) {
    $('bottom-nav').innerHTML = '';
    $('app').innerHTML =
      '<h1>Recuperação de dados</h1><div class="panel"><p class="warning">' +
      esc(loadError) +
      '</p><p>O aplicativo bloqueou alterações para evitar substituir dados que não conseguiu ler. Não limpe o armazenamento do navegador. Se tiver um backup JSON, use o procedimento de recuperação com apoio técnico.</p><button type="button" data-action="download-raw">Baixar cópia bruta dos dados locais</button></div>';
    return;
  }
  $('bottom-nav').innerHTML = navHTML();
  suppressHomeCalendar = tab === 'inicio';
  $('app').innerHTML = {
    inicio: home,
    aplicacoes: applications,
    ciclos: cycles,
    peso: weight,
    relatorios: reports,
    configuracoes: dataPage,
  }[tab]();
  suppressHomeCalendar = false;
  if (tab === 'inicio') {
    $('app').innerHTML = $('app')
      .innerHTML.replace(/<div class="metric"><span>Peso atual<\/span>[\s\S]*?<\/div>/, '')
      .replace(/<div class="metric"><span>Meta de peso<\/span>[\s\S]*?<\/div>/, '')
      .replace(/<button[^>]*data-id="peso"[^>]*>[^<]*<\/button>/, '');
    $('app').innerHTML = calendarPage() + $('app').innerHTML;
  }
  if (tab === 'aplicacoes' || tab === 'configuracoes') {
    appendRendered(extraPanels());
  }
  if (tab === 'aplicacoes') {
    $('app').innerHTML = $('app').innerHTML.replace(
      /<label>Local da aplicação<\/label><select name="site">[\s\S]*?<\/select>/,
      '',
    );
    $('app').innerHTML = $('app').innerHTML.replace('Ciclo (opcional)', 'Ciclo obrigatório');
    appendRendered(applicationsExtraPanel());
    const cycleSelect = document.querySelector('select[name="cycleId"]');
    if (cycleSelect) {
      cycleSelect.required = true;
      const emptyCycle = cycleSelect.querySelector('option[value=""]');
      if (emptyCycle) {
        emptyCycle.textContent = 'Selecione um ciclo';
      }
    }
  }
  if (tab === 'configuracoes') {
    appendRendered(encryptedBackupPanel());
  }
  decorateCalendarCompounds();
  animateRender();
}
function confirmDelete(type, id) {
  if (type === 'cycles' && (!id || !CYCLE_ID_RE.test(id))) {
    return;
  }
  const item = db[type]?.find((x) => x.id === id);
  if (!item) {
    return;
  }
  let label = 'o registro';
  if (type === 'applications') {
    label = `a aplicação de ${dateFmt(item.date)}`;
  } else if (type === 'cycles') {
    label = `o ciclo ${item.name || ''}`;
  } else if (type === 'weights') {
    label = `a pesagem de ${dateFmt(item.date)}`;
  }
  $('confirmText').textContent = `Excluir ${label}?`;
  $('confirmYes').onclick = () => {
    if (type === 'cycles' && (!id || !CYCLE_ID_RE.test(id))) {
      return;
    }
    const it = db[type]?.find((x) => x.id === id);
    if (!it) {
      return;
    }
    db.trash = Array.isArray(db.trash) ? db.trash : [];
    db.trash.push({
      trashId: uid(),
      type,
      deletedAt: new Date().toISOString(),
      item: JSON.parse(JSON.stringify(it)),
    });
    db[type] = db[type].filter((x) => x.id !== id);
    if (type === 'cycles') {
      db.applications.forEach((a) => {
        if (a.cycleId === id) {
          a.cycleId = null;
        }
      });
    }
    $('confirmDialog').close();
    save();
  };
  $('confirmDialog').showModal();
}
function dayCount(a, b) {
  if (!a || !b) {
    return 0;
  }
  const x = Date.parse(a + 'T12:00:00Z'),
    y = Date.parse(b + 'T12:00:00Z');
  return Math.max(0, Math.floor((y - x) / 86400000) + 1);
}
function elapsedCycle(c) {
  const end = c.status === 'finished' ? c.end || today() : today();
  let days = dayCount(c.start, end);
  for (const pause of c.pauses || []) {
    const pEnd = pause.end || end;
    if (pause.start <= end) {
      days -= Math.max(
        0,
        Math.floor(
          (Date.parse(pEnd + 'T12:00:00Z') - Date.parse(pause.start + 'T12:00:00Z')) / 86400000,
        ) + (pause.end ? 0 : 1),
      );
    }
  }
  return Math.max(0, days);
}
function cycleDuration(c) {
  const days = elapsedCycle(c);
  return `${days} dia${days === 1 ? '' : 's'} de ciclo`;
}

let calendarView = 'week',
  calendarFocus = today().slice(0, 7),
  calendarSelected = today();
function calUTC(s) {
  return new Date(s + 'T12:00:00Z');
}
function calISO(d) {
  return d.toISOString().slice(0, 10);
}
function calMove(n) {
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
function calSetView(v) {
  calendarView = v;
  render();
}
function calSelect(s) {
  calendarSelected = s;
  calendarFocus = s.slice(0, 7);
  render();
}
function calToday() {
  calendarSelected = today();
  calendarFocus = calendarSelected.slice(0, 7);
  render();
}
function calendarPage() {
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

function homeCalendar() {
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
    const compounds = names.length
      ? `<span class="cal-compounds">${names.map((n) => `<span>${esc(n)}</span>`).join('')}</span>`
      : '';
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

function backupReminder() {
  return '';
}
function home() {
  const active = db.cycles.filter((x) => x.status === 'active' && CYCLE_ID_RE.test(x.id));
  const paused = db.cycles.filter((x) => x.status === 'paused' && CYCLE_ID_RE.test(x.id));
  return `<div class="grid"><div class="metric"><span>Aplicações</span><strong>${db.applications.length}</strong></div><div class="metric"><span>Ciclos em andamento</span><strong>${active.length}</strong></div></div><div class="panel"><h2>Tempo dos ciclos</h2>${active.length || paused.length ? [...active, ...paused].map((c) => `<div class="item"><div class="row between"><b>${esc(c.name)}</b><span class="pill">${c.status === 'paused' ? 'Pausado' : 'Em andamento'}</span></div><p><strong>${cycleDuration(c)}</strong> <span class="muted">• desde ${dateFmt(c.start)}</span></p><div class="row">${button(c.status === 'paused' ? 'Retomar ciclo' : 'Pausar ciclo', c.status === 'paused' ? 'resume-cycle' : 'pause-cycle', c.id)}${button('Ver ciclo', 'set-tab', 'ciclos')}</div></div>`).join('') : '<p class="empty">Nenhum ciclo em andamento ou pausado.</p>'}</div>`;
}
function compoundFields() {
  return compounds
    .map(
      (c, i) =>
        `<div class="item"><div class="row between"><b>Composto ${i + 1}</b>${compounds.length > 1 ? button('Remover', 'remove-compound', i, 'danger') : ''}</div><label for="compoundName${i}">Nome</label><input id="compoundName${i}" list="compoundNames" aria-label="Nome do composto ${i + 1}" value="${esc(c.name)}" oninput="compounds[${i}].name=this.value" onblur="const last=lastCompoundEntry(this.value);if(last&&!compounds[${i}].dose){compounds[${i}].dose=last.dose;compounds[${i}].unit=last.unit;$('compoundList').innerHTML=compoundFields()}" placeholder="Nome do composto"><div class="two"><div><label for="compoundDose${i}">Dose</label><input id="compoundDose${i}" aria-label="Dose do composto ${i + 1}" type="number" min="0" step="any" value="${esc(c.dose)}" oninput="compounds[${i}].dose=this.value" placeholder="Ex.: 1.5"></div><div><label for="compoundUnit${i}">Unidade</label><select id="compoundUnit${i}" aria-label="Unidade do composto ${i + 1}" onchange="compounds[${i}].unit=this.value">${['mg', 'mcg', 'mL', 'UI'].map((u) => `<option ${c.unit === u ? 'selected' : ''}>${u}</option>`).join('')}</select></div></div></div>`,
    )
    .join('');
}
function addCompound() {
  compounds.push({ name: '', dose: '', unit: 'mg' });
  $('compoundList').innerHTML = compoundFields();
}
function removeCompound(i) {
  compounds.splice(i, 1);
  $('compoundList').innerHTML = compoundFields();
}
function editApp(id) {
  const a = db.applications.find((x) => x.id === id);
  if (!a) {
    return;
  }
  editing = id;
  appDraft = null;
  compounds = a.compounds.map((c) => ({ ...c }));
  render();
}
function copyApp(id) {
  const a = db.applications.find((x) => x.id === id);
  if (!a) {
    return;
  }
  editing = null;
  appDraft = {
    id: null,
    date: today(),
    _isCopy: true,
    compounds: a.compounds.map((c) => ({ ...c })),
  };
  compounds = appDraft.compounds.map((c) => ({ ...c }));
  render();
}
function resetApp() {
  editing = null;
  appDraft = null;
  compounds = [{ name: '', dose: '', unit: 'mg' }];
  render();
}
function applications() {
  const visible = filteredApplications()
    .slice()
    .sort((x, y) => y.date.localeCompare(x.date));
  const a = editing ? db.applications.find((x) => x.id === editing) : appDraft;
  const mode = editing ? 'Editar' : a && a._isCopy === true ? 'Nova (cópia)' : 'Nova';
  return `<h1>Aplicações</h1><div class="panel"><h2>${mode} aplicação</h2><form id="appForm" onsubmit="submitApp(event)"><div class="two"><div><label for="appDate">Data</label><input id="appDate" name="date" type="date" required value="${a?.date || today()}"></div><div><label for="appTime">Horário (opcional)</label><input id="appTime" name="time" type="time" value="${a?.time || ''}"></div></div><label for="appCycle">Ciclo obrigatório</label><select id="appCycle" name="cycleId"><option value="">Sem ciclo</option>${db.cycles
    .filter((c) => CYCLE_ID_RE.test(c.id))
    .map(
      (c) =>
        `<option value="${esc(c.id)}" ${a?.cycleId === c.id ? 'selected' : ''}>${esc(c.name)}</option>`,
    )
    .join(
      '',
    )}</select>${compoundNameList()}<div id="compoundList">${compoundFields()}</div>${button('+ Adicionar composto', 'add-compound')}<label for="appNotes">Observações</label><textarea id="appNotes" name="notes" placeholder="Observações opcionais">${esc(a?.notes || '')}</textarea><div class="row actions"><button class="primary" type="submit">${a ? 'Salvar alterações' : 'Salvar aplicação'}</button>${a ? button('Cancelar', 'cancel-app') : ''}</div></form></div><div class="panel"><h2>Histórico de aplicações</h2>${
    visible.length
      ? visible
          .map(
            (x) =>
              `<div class="item"><div class="row between"><b>${dateFmt(x.date)} ${esc(x.time || '')}</b></div><p>${x.compounds.map((c) => `${esc(c.name)} (${esc(c.dose)} ${esc(c.unit)})`).join(' + ')}</p><p class="muted">${esc(db.cycles.find((c) => c.id === x.cycleId)?.name || 'Sem ciclo')} ${x.notes ? '• ' + esc(x.notes) : ''}</p><div class="row">${button('Duplicar', 'copy-app', x.id)}${button('Editar', 'edit-app', x.id)}${button('Excluir', 'delete-app', x.id, 'danger')}</div></div>`,
          )
          .join('')
      : '<p class="empty">Nenhuma aplicação registrada.</p>'
  }</div>`;
}
function submitApp(e) {
  e.preventDefault();
  const f = new FormData(e.target);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(f.get('date')))) {
    alert('Informe uma data válida.');
    return;
  }
  if (
    compounds.some(
      (c) =>
        !c.name.trim() ||
        !(Number(c.dose) > 0) ||
        !Number.isFinite(Number(c.dose)) ||
        !['mg', 'mcg', 'mL', 'UI'].includes(c.unit),
    )
  ) {
    alert('Preencha o nome e uma dose maior que zero para cada composto.');
    return;
  }
  const cycleId = String(f.get('cycleId') || '');
  if (!CYCLE_ID_RE.test(cycleId) || !db.cycles.some((c) => c.id === cycleId)) {
    alert('Selecione um ciclo válido para vincular a aplicação.');
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
  };
  if (editing) {
    db.applications = db.applications.map((a) => (a.id === editing ? item : a));
  } else {
    db.applications.push(item);
  }
  rememberCompoundNames(compounds.map((c) => c.name));
  editing = null;
  appDraft = null;
  compounds = [{ name: '', dose: '', unit: 'mg' }];
  save();
}
function cycleDetails(x) {
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
  return `<p><strong>${active} dias ativos</strong> <span class="muted">• ${total} dias corridos • ${appCount} aplicação(ões)</span></p><p class="muted">Início: ${dateFmt(x.start)}${x.status === 'finished' && x.end ? ' • Término: ' + dateFmt(x.end) : ''}</p>${periods ? `<details><summary>Pausas (${(x.pauses || []).length})</summary><div class="item">${periods}</div></details>` : ''}`;
}
function cycles() {
  const c = editing ? db.cycles.find((x) => x.id === editing && CYCLE_ID_RE.test(x.id)) : null;
  const validCycles = db.cycles.filter(
    (x) => x && typeof x.id === 'string' && CYCLE_ID_RE.test(x.id),
  );
  return `<h1>Ciclos salvos</h1><div class="panel"><h2>${c ? 'Editar ciclo' : 'Novo ciclo'}</h2><form onsubmit="submitCycle(event)"><label>Nome</label><input name="name" required value="${esc(c?.name || '')}" placeholder="Ex.: Ciclo de novembro"><div class="two"><div><label>Data de início</label><input type="date" name="start" required value="${c?.start || today()}"></div><div><label>Data de término (opcional)</label><input type="date" name="end" value="${c?.end || ''}"></div></div><label>Situação</label><select name="status"><option value="active" ${!c || c.status === 'active' ? 'selected' : ''}>Em andamento</option><option value="paused" ${c?.status === 'paused' ? 'selected' : ''}>Pausado</option><option value="finished" ${c?.status === 'finished' ? 'selected' : ''}>Finalizado</option></select><label>Observações</label><textarea name="notes">${esc(c?.notes || '')}</textarea><div class="row actions"><button type="submit" class="primary">Salvar ciclo</button>${c ? button('Cancelar', 'cancel-cycle') : ''}</div></form></div><div class="panel"><h2>Meus ciclos</h2>${validCycles.length ? validCycles.map((x) => `<div class="item"><div class="row between"><b>${esc(x.name)}</b><span class="pill">${x.status === 'active' ? 'Em andamento' : x.status === 'paused' ? 'Pausado' : 'Finalizado'}</span></div>${cycleDetails(x)}<p>${esc(x.notes || '')}</p><div class="row">${button('Editar', 'edit-cycle', x.id)}${x.status === 'active' ? button('Pausar', 'pause-cycle', x.id) : x.status === 'paused' ? button('Retomar', 'resume-cycle', x.id) : button('Reabrir', 'resume-cycle', x.id)}${x.status !== 'finished' ? button('Finalizar', 'finish-cycle', x.id) : ''}${button('Excluir', 'delete-cycle', x.id, 'danger')}</div></div>`).join('') : '<p class="empty">Nenhum ciclo salvo.</p>'}</div>`;
}
function changeCycleStatus(id, status) {
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
  save();
}
function submitCycle(e) {
  e.preventDefault();
  const f = new FormData(e.target);
  if (f.get('end') && f.get('end') < f.get('start')) {
    alert('A data final deve ser igual ou posterior ao início.');
    return;
  }
  const old = editing ? db.cycles.find((x) => x.id === editing && CYCLE_ID_RE.test(x.id)) : null;
  const cycleId = editing || uid();
  if (!CYCLE_ID_RE.test(cycleId)) {
    alert('Identificador de ciclo inválido.');
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
  };
  if (editing) {
    db.cycles = db.cycles.map((x) => (x.id === editing ? item : x));
  } else {
    db.cycles.push(item);
  }
  if (item.status !== f.get('status')) {
    changeCycleStatusWithoutSave(item, f.get('status'));
  }
  editing = null;
  save();
}
function changeCycleStatusWithoutSave(c, status) {
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

function chartSVG(rows) {
  const data = rows
    .filter((r) => Number.isFinite(Number(r.value)) && Number(r.value) > 0)
    .map((r) => ({ date: r.date, value: Number(r.value) }))
    .sort((a, b) => a.date.localeCompare(b.date));
  if (!data.length) {
    return '<div class="empty">Registre uma pesagem para visualizar o gráfico.</div>';
  }
  const W = 720,
    H = 290,
    L = 54,
    R = 22,
    T = 24,
    B = 48,
    pw = W - L - R,
    ph = H - T - B;
  const values = data.map((r) => r.value);
  if (Number(db.goal) > 0) {
    values.push(Number(db.goal));
  }
  let lo = Math.min(...values),
    hi = Math.max(...values);
  let pad = Math.max(1, (hi - lo) * 0.16);
  lo -= pad;
  hi += pad;
  const y = (v) => T + ((hi - v) / (hi - lo)) * ph;
  const dates = data.map((d) => new Date(d.date + 'T12:00:00').getTime());
  const start = Math.min(...dates),
    end = Math.max(...dates);
  const x = (i) => (start === end ? L + pw / 2 : L + ((dates[i] - start) / (end - start)) * pw);
  const pts = data.map((d, i) => `${x(i).toFixed(1)},${y(d.value).toFixed(1)}`).join(' ');
  let grid = '';
  for (let i = 0; i <= 4; i++) {
    let val = hi - ((hi - lo) * i) / 4,
      yy = y(val);
    grid += `<line x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}" stroke="#2b5968" stroke-dasharray="4 5"/><text x="${L - 9}" y="${yy + 4}" text-anchor="end" font-size="12" fill="#93c5fd">${num(val)}</text>`;
  }
  const labels =
    data.length === 1
      ? [0]
      : [0, Math.floor((data.length - 1) / 2), data.length - 1].filter(
          (v, i, a) => a.indexOf(v) === i,
        );
  let ticks = labels
    .map(
      (i) =>
        `<text x="${x(i)}" y="${H - 15}" text-anchor="middle" font-size="12" fill="#93c5fd">${dateFmt(data[i].date)}</text>`,
    )
    .join('');
  let goal =
    Number(db.goal) > 0
      ? `<line x1="${L}" x2="${W - R}" y1="${y(Number(db.goal))}" y2="${y(Number(db.goal))}" stroke="#f97316" stroke-width="2" stroke-dasharray="8 5"/>`
      : '';
  let circles = data
    .map(
      (d, i) =>
        `<circle cx="${x(i)}" cy="${y(d.value)}" r="5" fill="#2563eb" stroke="#ffffff" stroke-width="2"><title>${dateFmt(d.date)}: ${num(d.value)} kg</title></circle>`,
    )
    .join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Evolução de peso em quilogramas" style="display:block;max-width:100%;height:auto;min-height:200px">${grid}${goal}<polyline fill="none" stroke="#2563eb" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" points="${pts}"/>${circles}${ticks}<text x="${L}" y="15" font-size="12" fill="#93c5fd">Peso (kg)</text></svg>`;
}
let weightPeriod = 'all';
function weightRows() {
  const rows = db.weights.slice().sort((a, b) => a.date.localeCompare(b.date));
  if (weightPeriod === 'all') {
    return rows;
  }
  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - Number(weightPeriod) + 1);
  return rows.filter((x) => new Date(x.date + 'T12:00:00') >= cutoff);
}
function weight() {
  const sorted = db.weights.slice().sort((a, b) => a.date.localeCompare(b.date));
  const first = sorted[0],
    last = sorted.at(-1);
  const delta = first && last ? Number(last.value) - Number(first.value) : null;
  const v = editing ? db.weights.find((x) => x.id === editing) : null;
  const filtered = weightRows(),
    pf = filtered[0],
    pl = filtered.at(-1);
  const periodDelta = pf && pl && filtered.length > 1 ? Number(pl.value) - Number(pf.value) : null;
  const percent =
    first && last && Number(first.value) > 0 ? (100 * delta) / Number(first.value) : null;
  const goal = Number(db.goal);
  const progress =
    first && last && goal > 0 && Number(first.value) !== goal
      ? Math.max(
          0,
          Math.min(
            100,
            (100 * (Number(first.value) - Number(last.value))) / (Number(first.value) - goal),
          ),
        )
      : null;
  const avg = filtered.length
    ? filtered.reduce((a, w) => a + Number(w.value), 0) / filtered.length
    : null;
  const opt = [
    ['all', 'Todo o período'],
    ['7', '7 dias'],
    ['30', '30 dias'],
    ['90', '90 dias'],
    ['180', '6 meses'],
    ['365', '1 ano'],
  ]
    .map(
      ([val, label]) =>
        `<option value="${val}" ${weightPeriod === val ? 'selected' : ''}>${label}</option>`,
    )
    .join('');
  return `<h1>Evolução de peso</h1><div class="grid"><div class="metric"><span>Peso inicial</span><strong>${first ? num(first.value) + ' kg' : '—'}</strong></div><div class="metric"><span>Peso atual</span><strong>${last ? num(last.value) + ' kg' : '—'}</strong></div><div class="metric"><span>Variação total</span><strong>${delta === null ? '—' : (delta > 0 ? '+' : '') + num(delta) + ' kg'}</strong></div><div class="metric"><span>Meta</span><strong>${goal > 0 ? num(goal) + ' kg' : '—'}</strong></div></div><div class="panel"><h2>Gráfico de evolução</h2><label for="period">Período</label><select id="period" onchange="drawChart()">${opt}</select><div id="chartTarget">${chartSVG(filtered)}</div><p class="muted">A distância horizontal representa o tempo entre pesagens. Linha pontilhada: meta de peso, quando definida.</p><div class="two"><div class="item"><div class="muted">Variação no período</div><h2>${periodDelta === null ? '—' : (periodDelta > 0 ? '+' : '') + num(periodDelta) + ' kg'}</h2></div><div class="item"><div class="muted">Média no período</div><h2>${avg === null ? '—' : num(avg) + ' kg'}</h2></div></div><p class="muted">${filtered.length} pesagem(ns) no período • Variação desde o início: ${percent === null ? '—' : (percent > 0 ? '+' : '') + num(percent) + '%'}</p></div><div class="panel"><h2>Progresso da meta</h2>${progress === null ? '<p class="muted">Defina uma meta e registre pesagens para acompanhar seu progresso.</p>' : `<div class="row between"><strong>${num(progress)}%</strong><span class="muted">${num(Math.abs(Number(last.value) - goal))} kg de diferença até a meta</span></div><div style="background:#e5e7eb;border-radius:99px;height:12px;overflow:hidden;margin:12px 0"><div style="background:linear-gradient(90deg,#2563eb,#93c5fd);width:${progress}%;height:100%"></div></div><p class="muted">O progresso compara a primeira e a última pesagem com a meta definida. Não representa uma previsão.</p>`}</div><div class="panel"><h2>${v ? 'Editar' : 'Nova'} pesagem</h2><form onsubmit="submitWeight(event)"><div class="two"><div><label>Data</label><input type="date" name="date" value="${v?.date || today()}" required></div><div><label>Peso (kg)</label><input type="number" name="value" min="0.1" max="500" step="0.01" required value="${v?.value || ''}" placeholder="Ex.: 88.4"></div></div><div class="row actions"><button type="submit" class="primary">Salvar pesagem</button>${v ? button('Cancelar', 'cancel-weight') : ''}</div></form><form onsubmit="saveGoal(event)"><label>Meta de peso (kg)</label><div class="row"><input style="flex:1" type="number" name="goal" min="0.1" max="500" step="0.01" value="${db.goal || ''}" placeholder="Defina sua meta"><button type="submit">Salvar meta</button></div></form></div><div class="panel"><h2>Histórico de pesagens</h2>${
    sorted.length
      ? sorted
          .slice()
          .reverse()
          .map(
            (x) =>
              `<div class="item row between"><div><b>${num(x.value)} kg</b><div class="muted">${dateFmt(x.date)}</div></div><div class="row">${button('Editar', 'edit-weight', x.id)}${button('Excluir', 'delete-weight', x.id, 'danger')}</div></div>`,
          )
          .join('')
      : '<p class="empty">Nenhuma pesagem registrada.</p>'
  }</div>`;
}
function drawChart() {
  weightPeriod = $('period').value;
  render();
}
function submitWeight(e) {
  e.preventDefault();
  const f = new FormData(e.target);
  const value = Number(f.get('value'));
  if (!Number.isFinite(value) || value <= 0 || value > 500) {
    alert('Informe um peso válido.');
    return;
  }
  const date = String(f.get('date') || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(new Date(date + 'T12:00:00').getTime())) {
    alert('Informe uma data válida.');
    return;
  }
  const item = { id: editing || uid(), date, value };
  if (editing) {
    db.weights = db.weights.map((x) => (x.id === editing ? item : x));
  } else {
    db.weights.push(item);
  }
  editing = null;
  save();
}
function saveGoal(e) {
  e.preventDefault();
  const n = Number(new FormData(e.target).get('goal'));
  db.goal = n > 0 ? n : null;
  save();
}
function restoreTrash(id) {
  const entry = (db.trash || []).find((x) => x.trashId === id);
  if (!entry) {
    return;
  }
  if (!confirm('Restaurar este registro da lixeira?')) {
    return;
  }
  const type = entry.type;
  if (!['applications', 'cycles', 'weights'].includes(type)) {
    return;
  }
  const item = JSON.parse(JSON.stringify(entry.item));
  if (db[type].some((x) => x.id === item.id)) {
    alert('Já existe um registro com o mesmo identificador.');
    return;
  }
  db[type].push(item);
  db.trash = db.trash.filter((x) => x.trashId !== id);
  save();
}
function deleteTrash(id) {
  if (!confirm('Excluir permanentemente este item da lixeira? Esta ação não pode ser desfeita.')) {
    return;
  }
  db.trash = db.trash.filter((x) => x.trashId !== id);
  save();
}
function getSupabaseConfig() {
  const url =
    (typeof localStorage !== 'undefined' && localStorage.getItem('peptide-supabase-url')) ||
    SUPABASE_URL;
  const key =
    (typeof localStorage !== 'undefined' && localStorage.getItem('peptide-supabase-key')) ||
    SUPABASE_KEY;
  return { url, key };
}

function initSupabase() {
  const { url, key } = getSupabaseConfig();
  if (!url || !key) {
    supabaseClient = null;
    return null;
  }
  const createFn =
    (typeof window !== 'undefined' && window.supabase && window.supabase.createClient) ||
    (typeof supabase !== 'undefined' && supabase.createClient);
  if (!createFn) {
    return null;
  }
  try {
    if (!supabaseClient) {
      supabaseClient = createFn(url, key, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
        },
      });
      supabaseClient.auth
        .getSession()
        .then(({ data }) => {
          if (data?.session?.user) {
            supabaseUser = data.session.user;
            supabaseSyncStatus = 'Conectado';
            pullFromCloud({ replaceLocal: true });
          }
        })
        .catch(() => {});
      supabaseClient.auth.onAuthStateChange((event, session) => {
        supabaseUser = session?.user || null;
        if (session?.user && event === 'SIGNED_IN') {
          pullFromCloud({ replaceLocal: true });
        }
        if (tab === 'configuracoes') {
          render();
        }
      });
    }
    return supabaseClient;
  } catch (err) {
    console.error('Falha ao inicializar Supabase:', err);
    return null;
  }
}

function scheduleCloudSync() {
  if (!supabaseClient || !supabaseUser) {
    return;
  }
  if (syncTimer) {
    clearTimeout(syncTimer);
  }
  syncTimer = setTimeout(pushToCloud, 800);
}

async function pushToCloud() {
  if (!supabaseClient || !supabaseUser) {
    return;
  }
  try {
    supabaseSyncStatus = 'Sincronizando...';
    supabaseSyncError = '';
    if (tab === 'configuracoes') {
      render();
    }
    const payload = {
      user_id: supabaseUser.id,
      data: db,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabaseClient
      .from('user_data')
      .upsert(payload, { onConflict: 'user_id' });
    if (error) {
      supabaseSyncStatus = 'Erro ao sincronizar';
      supabaseSyncError =
        error.code === '42P01' || error.code === 'PGRST205'
          ? 'A tabela user_data ainda não existe neste projeto Supabase.'
          : error.message;
      console.warn('Erro ao salvar no Supabase:', error.message);
    } else {
      supabaseSyncStatus = 'Sincronizado';
      markCloudSynced();
    }
  } catch {
    supabaseSyncStatus = 'Offline';
  }
  if (tab === 'configuracoes') {
    render();
  }
}

function markCloudSynced() {
  supabaseLastSync = new Date().toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('peptide-supabase-last-sync', supabaseLastSync);
  }
}

function localRecordCount() {
  return (db.applications?.length || 0) + (db.cycles?.length || 0);
}

async function pullFromCloud({ replaceLocal = false } = {}) {
  if (!supabaseClient || !supabaseUser) {
    return;
  }
  try {
    supabaseSyncStatus = 'Carregando dados...';
    supabaseSyncError = '';
    if (tab === 'configuracoes') {
      render();
    }
    const { data, error } = await supabaseClient
      .from('user_data')
      .select('data, updated_at')
      .eq('user_id', supabaseUser.id)
      .maybeSingle();

    if (error) {
      supabaseSyncStatus = 'Erro ao carregar';
      supabaseSyncError =
        error.code === '42P01' || error.code === 'PGRST205'
          ? 'A tabela user_data ainda não existe neste projeto Supabase.'
          : error.message;
      console.warn('Erro ao ler do Supabase:', error.message);
      return;
    }

    const cloudDb = data?.data;
    if (cloudDb && typeof cloudDb === 'object' && Array.isArray(cloudDb.applications)) {
      // Baixa da nuvem somente quando este aparelho ainda não tem registros.
      // Assim, um registro excluído aqui não volta na próxima sincronização.
      if (replaceLocal || localRecordCount() === 0) {
        db = { ...db, ...cloudDb };
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(KEY, JSON.stringify(db));
        }
        render();
      }
    } else if (localRecordCount() > 0) {
      await pushToCloud();
      return;
    }
    supabaseSyncStatus = 'Sincronizado';
    markCloudSynced();
  } catch {
    supabaseSyncStatus = 'Offline';
  }
  if (tab === 'configuracoes') {
    render();
  }
}

async function handleSupabaseAuth(mode, email, password) {
  if (!supabaseClient) {
    initSupabase();
  }
  if (!supabaseClient) {
    alert('Não foi possível iniciar a conexão com a nuvem. Verifique a internet e tente de novo.');
    return;
  }
  if (!email || !password) {
    alert('Preencha e-mail e senha.');
    return;
  }
  if (password.length < 6) {
    alert('A senha precisa ter pelo menos 6 caracteres.');
    return;
  }
  try {
    supabaseSyncStatus = mode === 'signup' ? 'Criando conta...' : 'Entrando...';
    supabaseSyncError = '';
    render();
    if (mode === 'signup') {
      const { data, error } = await supabaseClient.auth.signUp({ email, password });
      if (error) {
        supabaseSyncStatus = '';
        supabaseSyncError = error.message;
        alert('Erro ao criar conta: ' + error.message);
        render();
        return;
      }
      if (data?.session?.user) {
        supabaseUser = data.session.user;
        supabaseSyncStatus = 'Sincronizado';
        await pullFromCloud();
        await pushToCloud();
      } else {
        alert(
          'Conta criada. Confirme o e-mail enviado pelo Supabase e depois toque em "Já tenho conta".',
        );
      }
    } else if (mode === 'signin') {
      const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
      if (error) {
        supabaseSyncStatus = '';
        supabaseSyncError = error.message;
        alert('Falha ao entrar: ' + error.message);
        render();
        return;
      }
      supabaseUser = data?.user || supabaseUser;
      await pullFromCloud({ replaceLocal: true });
    }
    render();
  } catch (e) {
    supabaseSyncStatus = '';
    supabaseSyncError = e.message;
    alert('Erro de conexão: ' + e.message);
    render();
  }
}

async function handleSupabaseSignOut() {
  if (supabaseClient) {
    await supabaseClient.auth.signOut();
    supabaseUser = null;
    supabaseSyncStatus = '';
    supabaseSyncError = '';
    render();
  }
}

function cloudSyncPanel() {
  if (!supabaseUser) {
    return `<div class="panel"><h2>Sincronização na nuvem</h2><p class="muted">Crie sua conta uma vez. Depois disso, cada registro sobe sozinho para a nuvem e abre no celular e no computador.</p><label for="cloudEmail">E-mail</label><input type="email" id="cloudEmail" placeholder="seu@email.com" autocomplete="email"><label for="cloudPassword">Senha (mínimo 6 caracteres)</label><input type="password" id="cloudPassword" placeholder="Sua senha" autocomplete="current-password"><div class="row actions">${button('Criar conta', 'cloud-signup', '', 'primary')}${button('Já tenho conta', 'cloud-login')}</div><p class="muted">Primeiro acesso? Use <strong>Criar conta</strong>. Depois, use <strong>Já tenho conta</strong> com o mesmo e-mail e senha.</p>${
      supabaseSyncError
        ? `<p class="muted"><strong>Último erro:</strong> ${esc(supabaseSyncError)}</p>`
        : ''
    }</div>`;
  }
  return `<div class="panel"><h2>Sincronização na nuvem</h2><p><strong>Conta:</strong> ${esc(supabaseUser.email)}</p><p class="muted">Status: <span class="pill">${esc(supabaseSyncStatus || 'Sincronizado')}</span> ${supabaseLastSync ? '• ' + esc(supabaseLastSync) : ''}</p>${
    supabaseSyncError
      ? `<p class="muted"><strong>Último erro:</strong> ${esc(supabaseSyncError)}</p>`
      : ''
  }<div class="row actions">${button('Sincronizar agora', 'cloud-sync', '', 'primary')}${button('Sair da conta', 'cloud-logout')}</div></div>`;
}

function dataPage() {
  const trash = (Array.isArray(db.trash) ? db.trash : []).filter((t) =>
    ['applications', 'cycles'].includes(t.type),
  );
  const names = { applications: 'Aplicação', cycles: 'Ciclo' };
  return `<h1>Ajustes</h1>${cloudSyncPanel()}<div class="panel"><h2>Backup</h2><p class="muted" id="backupStatus">${backupStatusText()}</p><div class="row">${button('Baixar backup JSON', 'export-data', '', 'primary')}${button('Compartilhar', 'share-backup')}</div></div><div class="panel"><h2>Restaurar backup</h2><input type="file" id="restoreFile" accept="application/json,.json"><div class="actions">${button('Importar arquivo', 'import-data')}</div></div><div class="panel"><h2>Lixeira • ${trash.length} registro(s)</h2>${
    trash.length
      ? trash
          .slice()
          .reverse()
          .map(
            (t) =>
              `<div class="item"><div class="row between"><b>${names[t.type] || 'Registro'}: ${esc(t.item.name || t.item.date || 'Sem nome')}</b><span class="muted">${new Date(t.deletedAt).toLocaleDateString('pt-BR')}</span></div><div class="row">${button('Restaurar', 'restore-trash', t.trashId)}${button('Apagar definitivamente', 'delete-trash', t.trashId, 'danger')}</div></div>`,
          )
          .join('')
      : '<p class="empty">A lixeira está vazia.</p>'
  }</div><div class="panel"><h2>Dados no aparelho</h2><p class="muted">${supabaseUser ? 'Os registros ficam salvos neste navegador e também na sua conta na nuvem.' : 'Os registros ficam salvos neste navegador. Ative a conta na nuvem acima para ter cópia online.'}</p><div class="row">${button('Verificar integridade', 'verify-local')}</div></div>`;
}
function strictDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return false;
  }
  const x = new Date(s + 'T12:00:00Z');
  return !Number.isNaN(x.getTime()) && x.toISOString().slice(0, 10) === s;
}
function downloadRawData() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      return alert('Não há dados locais para copiar.');
    }
    const a = document.createElement('a'),
      u = URL.createObjectURL(new Blob([raw], { type: 'application/json' }));
    a.href = u;
    a.download = 'peptide-manager-recuperacao-bruta-' + today() + '.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(u), 5000);
  } catch (e) {
    alert('Falha ao criar cópia bruta: ' + e.message);
  }
}
function verifyLocalData() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      return alert('Não há registros salvos neste navegador.');
    }
    const d = JSON.parse(raw);
    validateBackup(d);
    alert(
      'Verificação concluída.\nAplicações: ' +
        d.applications.length +
        '\nCiclos: ' +
        d.cycles.length +
        '\nPesagens: ' +
        d.weights.length +
        '\nLixeira: ' +
        (d.trash || []).length +
        '\n\nA verificação não substitui o backup externo.',
    );
  } catch (e) {
    alert(
      'Atenção: os dados salvos não passaram na verificação. Não apague os dados do navegador. ' +
        e.message,
    );
  }
}
function validateBackup(d) {
  if (
    !d ||
    typeof d !== 'object' ||
    !['applications', 'cycles', 'weights'].every((k) => Array.isArray(d[k])) ||
    (d.trash !== undefined && !Array.isArray(d.trash)) ||
    (d.compoundCatalog !== undefined && !Array.isArray(d.compoundCatalog)) ||
    (d.reminders !== undefined && !Array.isArray(d.reminders))
  ) {
    throw Error('Estrutura do backup inválida');
  }
  for (const r of d.reminders || []) {
    if (
      !r ||
      typeof r.id !== 'string' ||
      !r.id ||
      !strictDate(r.date) ||
      typeof r.compoundName !== 'string' ||
      !r.compoundName.trim() ||
      !['none', 'daily', 'weekly'].includes(r.repeat || 'none')
    ) {
      throw Error('Lembrete inválido');
    }
  }
  if (
    d.compoundCatalog &&
    (d.compoundCatalog.length > 200 ||
      !d.compoundCatalog.every(
        (name) => typeof name === 'string' && name.trim() && name.length <= 120,
      ))
  ) {
    throw Error('Catálogo de compostos inválido');
  }
  if (d.goal !== null && d.goal !== undefined && (!Number.isFinite(d.goal) || d.goal <= 0)) {
    throw Error('Meta inválida');
  }
  const ids = new Set();
  for (const [type, rows] of [
    ['applications', d.applications],
    ['cycles', d.cycles],
    ['weights', d.weights],
  ]) {
    if (rows.length > 100000) {
      throw Error('Arquivo excede o limite de registros');
    }
    for (const r of rows) {
      if (
        !r ||
        typeof r.id !== 'string' ||
        !r.id ||
        ids.has(type + ':' + r.id) ||
        (typeof r.date === 'string' && !strictDate(r.date))
      ) {
        throw Error('Registro inválido em ' + type);
      }
      if (type === 'cycles' && !CYCLE_ID_RE.test(r.id)) {
        throw Error('Ciclo inválido: identificador inválido');
      }
      ids.add(type + ':' + r.id);
    }
  }
  for (const a of d.applications) {
    if (!strictDate(a.date)) {
      throw Error('Data inválida em aplicação');
    }
    if (a.cycleId && !CYCLE_ID_RE.test(a.cycleId)) {
      throw Error('Ciclo inválido em aplicação');
    }
    if (
      !Array.isArray(a.compounds) ||
      !a.compounds.length ||
      !a.compounds.every(
        (c) =>
          c &&
          typeof c.name === 'string' &&
          c.name.trim() &&
          Number.isFinite(Number(c.dose)) &&
          Number(c.dose) > 0 &&
          typeof c.unit === 'string',
      )
    ) {
      throw Error('Compostos inválidos no backup');
    }
  }
  for (const w of d.weights) {
    if (
      !strictDate(w.date) ||
      !Number.isFinite(Number(w.value)) ||
      Number(w.value) <= 0 ||
      Number(w.value) > 500
    ) {
      throw Error('Pesagem inválida');
    }
  }
  for (const c of d.cycles) {
    if (
      !c ||
      typeof c.id !== 'string' ||
      !CYCLE_ID_RE.test(c.id) ||
      typeof c.name !== 'string' ||
      !c.name.trim() ||
      !['active', 'paused', 'finished'].includes(c.status) ||
      !strictDate(c.start)
    ) {
      throw Error('Ciclo inválido');
    }
  }
  if (d.trash) {
    const trashIds = new Set();
    for (const t of d.trash) {
      if (
        !t ||
        typeof t.trashId !== 'string' ||
        !t.trashId ||
        trashIds.has(t.trashId) ||
        !['applications', 'cycles', 'weights'].includes(t.type) ||
        !t.item ||
        typeof t.item.id !== 'string'
      ) {
        throw Error('Lixeira inválida');
      }
      if (t.type === 'cycles' && !CYCLE_ID_RE.test(t.item.id)) {
        throw Error('Lixeira inválida');
      }
      trashIds.add(t.trashId);
    }
  }
  return true;
}
function backupStatusText() {
  try {
    const m = JSON.parse(localStorage.getItem(BACKUP_META_KEY) || 'null');
    return m && m.preparedAt
      ? 'Último arquivo preparado: ' +
          new Date(m.preparedAt).toLocaleString('pt-BR') +
          ' • ' +
          esc(m.fileName || '')
      : 'Nenhum backup V2.2 preparado neste navegador.';
  } catch (e) {
    return 'Histórico de backups indisponível.';
  }
}
async function sha256Text(s) {
  if (!globalThis.crypto || !crypto.subtle) {
    throw Error('Verificação SHA-256 requer HTTPS ou ambiente seguro');
  }
  const bytes = new TextEncoder().encode(s);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (x) => x.toString(16).padStart(2, '0')).join('');
}
async function makeBackupFile() {
  validateBackup(db);
  const snapshot = JSON.parse(JSON.stringify(db));
  validateBackup(snapshot);
  const digest = await sha256Text(JSON.stringify(snapshot));
  const payload = {
    app: 'Peptide Manager',
    version: 2,
    exportedAt: new Date().toISOString(),
    integrity: { algorithm: 'SHA-256', dataHash: digest },
    data: snapshot,
  };
  const json = JSON.stringify(payload, null, 2);
  const check = JSON.parse(json);
  validateBackup(check.data);
  if ((await sha256Text(JSON.stringify(check.data))) !== check.integrity.dataHash) {
    throw Error('Falha na conferência do backup');
  }
  const filename =
    'peptide-manager-backup-' +
    today() +
    '-' +
    new Date().toTimeString().slice(0, 8).replace(/:/g, '') +
    '.json';
  return { blob: new Blob([json], { type: 'application/json' }), filename };
}
function noteBackupPrepared(filename) {
  try {
    localStorage.setItem(
      BACKUP_META_KEY,
      JSON.stringify({ preparedAt: new Date().toISOString(), fileName: filename }),
    );
    const status = $('backupStatus');
    if (status) {
      status.textContent = backupStatusText();
    }
  } catch (e) {
    console.warn('Não foi possível registrar a data do backup', e);
  }
}
function downloadBackupBlob(blob, filename) {
  const a = document.createElement('a');
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 15000);
}
async function exportData() {
  try {
    const { blob, filename } = await makeBackupFile();
    downloadBackupBlob(blob, filename);
    noteBackupPrepared(filename);
    alert(
      'Backup verificado e download solicitado. Confirme no gerenciador de arquivos que ele foi salvo.',
    );
  } catch (e) {
    alert('Backup não gerado: ' + e.message);
  }
}
function bytesToBase64(bytes) {
  let text = '';
  for (const byte of bytes) {
    text += String.fromCharCode(byte);
  }
  return btoa(text);
}
function base64ToBytes(value) {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}
async function deriveBackupKey(password, salt) {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 120000, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}
async function exportEncryptedData() {
  try {
    const password = prompt('Defina uma senha para criptografar este backup:');
    if (!password || password.length < 6) {
      return alert('Use uma senha com pelo menos 6 caracteres.');
    }
    const { blob, filename } = await makeBackupFile();
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveBackupKey(password, salt);
    const cipher = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      await blob.arrayBuffer(),
    );
    const payload = {
      app: 'Peptide Manager',
      version: 3,
      encrypted: true,
      algorithm: 'AES-256-GCM',
      kdf: 'PBKDF2-SHA-256',
      salt: bytesToBase64(salt),
      iv: bytesToBase64(iv),
      data: bytesToBase64(new Uint8Array(cipher)),
    };
    const encryptedName = filename.replace('.json', '.encrypted.json');
    downloadBackupBlob(
      new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
      encryptedName,
    );
    alert('Backup criptografado gerado. Guarde a senha separadamente.');
  } catch (e) {
    alert('Backup criptografado não gerado: ' + e.message);
  }
}
async function importEncryptedData() {
  const file = $('restoreFile').files[0];
  if (!file) {
    return alert('Selecione um arquivo criptografado.');
  }
  try {
    const payload = JSON.parse(await file.text());
    if (!payload.encrypted || payload.algorithm !== 'AES-256-GCM') {
      throw Error('Arquivo criptografado inválido');
    }
    const password = prompt('Digite a senha deste backup:');
    if (!password) {
      return;
    }
    const key = await deriveBackupKey(password, base64ToBytes(payload.salt));
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: base64ToBytes(payload.iv) },
      key,
      base64ToBytes(payload.data),
    );
    const obj = JSON.parse(new TextDecoder().decode(plain));
    validateBackup(obj.data);
    if (
      !confirm(
        `Backup descriptografado: ${obj.data.applications.length} aplicações, ${obj.data.cycles.length} ciclos e ${obj.data.weights.length} pesagens. Substituir os dados atuais?`,
      )
    ) {
      return;
    }
    localStorage.setItem(KEY + '-pre-restore', JSON.stringify(db));
    db = { ...blank(), ...obj.data };
    save();
    alert('Backup criptografado restaurado.');
  } catch (e) {
    alert('Não foi possível abrir o backup criptografado. Verifique a senha e o arquivo.');
  }
}
async function shareBackup() {
  try {
    const { blob, filename } = await makeBackupFile();
    const file = new File([blob], filename, { type: 'application/json' });
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Backup Peptide Manager' });
      noteBackupPrepared(filename);
      alert(
        'Compartilhamento concluído ou encaminhado. Verifique no Google Drive se o arquivo foi salvo.',
      );
    } else {
      downloadBackupBlob(blob, filename);
      noteBackupPrepared(filename);
      alert(
        'Compartilhamento de arquivos não disponível aqui. O download foi solicitado. Envie o arquivo manualmente ao Google Drive.',
      );
    }
  } catch (e) {
    if (e.name === 'AbortError') {
      return;
    }
    alert('Não foi possível preparar ou compartilhar: ' + e.message);
  }
}
async function importData() {
  const file = $('restoreFile').files[0];
  if (!file) {
    return alert('Selecione um arquivo JSON.');
  }
  try {
    if (file.size > 15 * 1024 * 1024) {
      throw Error('Arquivo muito grande (limite: 15 MB)');
    }
    const obj = JSON.parse(await file.text());
    if (obj.app !== 'Peptide Manager' || !obj.data) {
      throw Error('Arquivo não reconhecido');
    }
    validateBackup(obj.data);
    let integrity = 'Backup antigo sem assinatura de integridade (somente estrutura validada).';
    if (obj.integrity !== undefined) {
      if (
        !obj.integrity ||
        obj.integrity.algorithm !== 'SHA-256' ||
        typeof obj.integrity.dataHash !== 'string' ||
        !/^[a-f0-9]{64}$/.test(obj.integrity.dataHash)
      ) {
        throw Error('Assinatura de integridade inválida');
      }
      const actual = await sha256Text(JSON.stringify(obj.data));
      if (actual !== obj.integrity.dataHash) {
        throw Error('Falha de integridade: conteúdo diferente do backup original');
      }
      integrity = 'SHA-256 conferido com sucesso.';
    }
    const summary = `${integrity}\nAplicações: ${obj.data.applications.length}\nCiclos: ${obj.data.cycles.length}\nPesagens: ${obj.data.weights.length}\nLixeira: ${(obj.data.trash || []).length}\n\nA restauração substitui os registros atuais. Deseja continuar?`;
    if (!confirm(summary)) {
      return;
    }
    const old = db;
    const incoming = { ...blank(), ...obj.data };
    try {
      const prior = localStorage.getItem(KEY);
      if (prior !== null) {
        localStorage.setItem(KEY + '-pre-restore', prior);
      }
      localStorage.setItem(KEY, JSON.stringify(incoming));
      db = incoming;
      render();
      syncNav();
      alert('Backup restaurado e validado.');
    } catch (e) {
      db = old;
      throw Error('Falha ao gravar os dados. Os registros anteriores foram mantidos.');
    }
  } catch (e) {
    alert('Não foi possível importar: ' + e.message);
  }
}

// V2.0: relatórios são somente leitura; nenhum dado é alterado pelos filtros.
let reportFrom = '',
  reportTo = '',
  reportCycle = 'all';
function reportFiltered() {
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
function reportSet() {
  const from = $('reportFrom').value,
    to = $('reportTo').value;
  if (from && to && from > to) {
    alert('A data inicial não pode ser posterior à final.');
    return;
  }
  reportFrom = from;
  reportTo = to;
  reportCycle = $('reportCycle').value;
  render();
}
function reportTable(headers, rows) {
  return rows.length
    ? `<div class="report-table-wrap"><table class="report-table"><thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((v) => `<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`
    : '<p class="empty">Nenhum registro para os filtros selecionados.</p>';
}
function reportAppRows(apps) {
  return apps.map((a) => [
    dateFmt(a.date),
    a.time || '—',
    db.cycles.find((c) => c.id === a.cycleId)?.name || 'Sem ciclo',
    a.compounds.map((c) => `${c.name}: ${num(c.dose)} ${c.unit}`).join(' + '),
    a.notes || '',
  ]);
}
function reportCycleRows(cycles) {
  return cycles.map((c) => [
    c.name,
    dateFmt(c.start),
    c.end ? dateFmt(c.end) : '—',
    { active: 'Em andamento', paused: 'Pausado', finished: 'Finalizado' }[c.status] || c.status,
    String(elapsedCycle(c)),
    String(db.applications.filter((a) => a.cycleId === c.id).length),
  ]);
}
function reportWeightRows(weights) {
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
function reportsLegacy() {
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
function reports() {
  return reportsLegacy();
}
function csvCell(v) {
  let s = String(v ?? '');
  if (/^[\s]*[=+@]/.test(s) || /^[\s]*-[^\d]/.test(s)) {
    s = "'" + s;
  }
  return '"' + s.replace(/"/g, '""') + '"';
}
function exportReportCSV(kind) {
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

function handleAction(e) {
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
      appDraft = {
        id: null,
        date,
        time: '',
        site: 'Não informado',
        cycleId: null,
        notes: 'Registrado a partir do calendário',
        compounds: [{ name: '', dose: '', unit: 'mg' }],
      };
      compounds = appDraft.compounds.map((c) => ({ ...c }));
      draftFromCalendar = true;
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
        renameCompound(id, prompt('Novo nome do composto:', id));
      }
      break;
    case 'remove-compound-name':
      if (
        id &&
        confirm('Remover este nome das sugestões? Os registros existentes não serão alterados.')
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
        editing = id;
        render();
      }
      break;
    case 'cancel-cycle':
      editing = null;
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
    case 'edit-weight':
      if (id) {
        editing = id;
        render();
      }
      break;
    case 'cancel-weight':
      editing = null;
      render();
      syncNav();
      break;
    case 'delete-weight':
      if (id) {
        confirmDelete('weights', id);
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
      reportFrom = '';
      reportTo = '';
      reportCycle = 'all';
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
      pullFromCloud({ replaceLocal: true });
      break;
    case 'cloud-logout':
      handleSupabaseSignOut();
      break;
  }
}
function setupVisualEffects() {
  if (typeof document === 'undefined' || typeof document.addEventListener !== 'function') {
    return;
  }
  document.addEventListener('pointerdown', (e) => {
    const target =
      e.target && typeof e.target.closest === 'function' ? e.target.closest('button') : null;
    if (!target || typeof target.getBoundingClientRect !== 'function') {
      return;
    }
    const rect = target.getBoundingClientRect();
    const ripple = document.createElement('span');
    ripple.className = 'ripple';
    ripple.style.left = `${e.clientX - rect.left}px`;
    ripple.style.top = `${e.clientY - rect.top}px`;
    target.appendChild(ripple);
    setTimeout(() => ripple.remove(), 650);
  });
  document.addEventListener('pointermove', (e) => {
    if (document.documentElement && e.clientX !== undefined) {
      document.documentElement.style.setProperty('--pointer-x', `${e.clientX}px`);
      document.documentElement.style.setProperty('--pointer-y', `${e.clientY}px`);
    }
  });
}
setupVisualEffects();
if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
  document.addEventListener('click', handleAction);
} else if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('click', handleAction);
}

render();
syncNav();
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
}
