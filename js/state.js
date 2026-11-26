import { validateBackup } from './backup.js';

export let historyCompound = readViewPreference('history-compound', '');
export let reportFrom = '',
  reportTo = '',
  reportCycle = 'all';

export const KEY = 'peptide-manager-v1';

export const BACKUP_META_KEY = 'peptide-manager-backup-meta-v2.2';
// Chave publicável do Supabase: feita para ir no app. A proteção real é o RLS (cada conta lê só o que é dela).

export const SUPABASE_URL = 'https://bcmshjfolhetogfkebnj.supabase.co';

export const SUPABASE_KEY = 'sb_publishable_Jo-vZQmILG2MDXT0LEDYjg_xZV2TWNb';

export const CYCLE_ID_RE = /^[a-f0-9-]{1,64}$/i;

export const blank = () => ({
  applications: [],
  cycles: [],
  weights: [],
  goal: null,
  trash: [],
  compoundCatalog: [],
  reminders: [],
  deleted: [],
  schemaVersion: 3,
});

export const SCHEMA_VERSION = 3;

export const MIGRATIONS = [
  {
    to: 1,
    run(d) {
      const now = new Date().toISOString();
      for (const type of ['applications', 'cycles', 'weights']) {
        for (const r of d[type] || []) {
          if (!r.updatedAt) {
            r.updatedAt = now;
          }
        }
      }
      return d;
    },
  },
  {
    to: 2,
    run(d) {
      if (!Array.isArray(d.deleted)) {
        d.deleted = [];
      }
      return d;
    },
  },
  {
    to: 3,
    run(d) {
      if (!Number.isFinite(Number(d.schemaVersion))) {
        d.schemaVersion = 3;
      }
      return d;
    },
  },
];

export function runMigrations(input) {
  const d = { ...blank(), ...(input || {}) };
  let version = Number(input && input.schemaVersion) || 0;
  for (const m of MIGRATIONS) {
    if (version < m.to) {
      m.run(d);
      version = m.to;
      d.schemaVersion = version;
    }
  }
  return d;
}

export let db,
  loadError = '';
try {
  const stored = localStorage.getItem(KEY);
  const parsed = stored ? JSON.parse(stored) : {};
  if (stored) {
    validateBackup(parsed);
  }
  db = runMigrations(parsed);
  if (!Array.isArray(db.trash)) {
    db.trash = [];
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
  } catch {
    /* ignora */
  }
} catch (e) {
  loadError =
    'Não foi possível ler os dados locais. Nenhum dado foi apagado. Faça uma cópia dos dados do navegador antes de tentar recuperar: ' +
    e.message;
  db = blank();
}
/* exported submitApp, submitCycle, setApplicationFilter, homeCalendar, lastCompoundEntry, reminderMatchesDate */

export function readViewPreference(name, fallback) {
  try {
    return JSON.parse(localStorage.getItem('peptide-view-' + name)) ?? fallback;
  } catch {
    return fallback;
  }
}

export function writeViewPreference(name, value) {
  try {
    localStorage.setItem('peptide-view-' + name, JSON.stringify(value));
  } catch {
    // A interface continua funcionando sem armazenamento disponível.
  }
}

const emptyHistoryFilters = { cycle: '', compound: '', from: '', to: '' };

export let tab = 'inicio',
  editing = null,
  appDraft = null,
  compounds = [{ name: '', dose: '', unit: 'mg' }],
  applicationFilter = readViewPreference('search', ''),
  applicationHistoryFilters = { ...emptyHistoryFilters, ...readViewPreference('history', {}) },
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

export const LOCK_KEY = 'peptide-manager-lock-v2';

export const LEGACY_LOCK_KEY = 'peptide-manager-lock-v1';

export let unlocked = !localStorage.getItem(LOCK_KEY) && !localStorage.getItem(LEGACY_LOCK_KEY);

export function updateDb(v) {
  db = v;
}
export function updateLoadError(v) {
  loadError = v;
}
export function updateTab(v) {
  tab = v;
}
export function updateEditing(v) {
  editing = v;
}
export function updateAppDraft(v) {
  appDraft = v;
}
export function updateCompounds(v) {
  compounds = v;
}
export function updateApplicationFilter(v) {
  applicationFilter = v;
  writeViewPreference('search', v);
}
export function updateApplicationHistoryFilters(filters) {
  applicationHistoryFilters = filters;
  writeViewPreference('history', filters);
}
export function updateCatalogFilter(v) {
  catalogFilter = v;
}
export function updateSuppressHomeCalendar(v) {
  suppressHomeCalendar = v;
}
export function updateSupabaseClient(v) {
  supabaseClient = v;
}
export function updateSupabaseUser(v) {
  supabaseUser = v;
}
export function updateSupabaseSyncStatus(v) {
  supabaseSyncStatus = v;
}
export function updateSupabaseSyncError(v) {
  supabaseSyncError = v;
}
export function updateSupabaseLastSync(v) {
  supabaseLastSync = v;
}
export function updateSyncTimer(v) {
  syncTimer = v;
}
export function updateUnlocked(v) {
  unlocked = v;
}
export function updateHistoryCompound(v) {
  historyCompound = v;
  writeViewPreference('history-compound', v);
}
export function updateReportFrom(v) {
  reportFrom = v;
}
export function updateReportTo(v) {
  reportTo = v;
}
export function updateReportCycle(v) {
  reportCycle = v;
}
