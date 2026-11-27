import { validateBackup } from './backup.js';
import {
  KEY,
  SUPABASE_KEY,
  SUPABASE_URL,
  blank,
  db,
  loadError,
  supabaseClient,
  supabaseLastSync,
  supabaseSyncError,
  supabaseSyncStatus,
  supabaseUser,
  syncTimer,
  tab,
  updateDb,
  updateSupabaseClient,
  updateSupabaseLastSync,
  updateSupabaseSyncError,
  updateSupabaseSyncStatus,
  updateSupabaseUser,
  updateSyncTimer,
} from './state.js';
import { button, confirmDialog, promptDialog, render, showToast } from './ui.js';
import { esc, uniqueCompoundNames } from './util.js';

export function getSupabaseConfig() {
  const url =
    (typeof localStorage !== 'undefined' && localStorage.getItem('peptide-supabase-url')) ||
    SUPABASE_URL;
  const key =
    (typeof localStorage !== 'undefined' && localStorage.getItem('peptide-supabase-key')) ||
    SUPABASE_KEY;
  return { url, key };
}

export function initSupabase() {
  const { url, key } = getSupabaseConfig();
  if (!url || !key) {
    updateSupabaseClient(null);
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
      updateSupabaseClient(
        createFn(url, key, {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
          },
        }),
      );
      supabaseClient.auth
        .getSession()
        .then(({ data }) => {
          if (data?.session?.user) {
            updateSupabaseUser(data.session.user);
            updateSupabaseSyncStatus('Conectado');
            syncWithCloud();
          }
        })
        .catch(() => {});
      supabaseClient.auth.onAuthStateChange((event, session) => {
        updateSupabaseUser(session?.user || null);
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

export const PENDING_KEY = 'peptide-supabase-pending';

export const cloudHooks = {};

export function markPendingPush() {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(PENDING_KEY, '1');
    }
  } catch {
    /* armazenamento indisponível */
  }
}

export function clearPendingPush() {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(PENDING_KEY);
    }
  } catch {
    /* armazenamento indisponível */
  }
}

export function hasPendingPush() {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(PENDING_KEY) === '1';
  } catch {
    return false;
  }
}

export function mergeDb(local, cloud) {
  local = local || blank();
  cloud = cloud || blank();
  const result = { ...blank(), ...local };
  const deletedMap = new Map();
  for (const t of [...(local.deleted || []), ...(cloud.deleted || [])]) {
    const key = t.type + ':' + t.id;
    const existing = deletedMap.get(key);
    if (!existing || (t.deletedAt || '') > (existing.deletedAt || '')) {
      deletedMap.set(key, t);
    }
  }
  result.deleted = Array.from(deletedMap.values());
  if (result.deleted.length > 5000) {
    result.deleted = result.deleted.slice(result.deleted.length - 5000);
  }
  const tombstoneTime = (type, id) => {
    const t = result.deleted.find((x) => x.type === type && x.id === id);
    return t ? t.deletedAt || '' : '';
  };
  const isDeleted = (type, id, updatedAt) => {
    const t = tombstoneTime(type, id);
    if (!t) {
      return false;
    }
    return t > (updatedAt || '');
  };

  const types = ['applications', 'cycles', 'weights', 'personalEntries'];
  for (const type of types) {
    const localArr = Array.isArray(local[type]) ? local[type] : [];
    const cloudArr = Array.isArray(cloud[type]) ? cloud[type] : [];
    const byId = new Map();
    for (const r of [...localArr, ...cloudArr]) {
      const id = r.id;
      const existing = byId.get(id);
      const rTime = r.updatedAt || '';
      if (!existing) {
        byId.set(id, r);
      } else {
        const eTime = existing.updatedAt || '';
        if (rTime > eTime) {
          byId.set(id, r);
        }
      }
    }
    const merged = [];
    for (const [id, r] of byId) {
      if (isDeleted(type, id, r.updatedAt)) {
        continue;
      }
      merged.push(r);
    }
    result[type] = merged;
  }

  const trashMap = new Map();
  for (const t of [...(local.trash || []), ...(cloud.trash || [])]) {
    if (!trashMap.has(t.trashId)) {
      trashMap.set(t.trashId, t);
    }
  }
  result.trash = Array.from(trashMap.values()).filter(
    (entry) =>
      !result[entry.type]?.some(
        (record) => record.id === entry.item.id && (record.updatedAt || '') > entry.deletedAt,
      ),
  );

  result.compoundCatalog = uniqueCompoundNames([
    ...(local.compoundCatalog || []),
    ...(cloud.compoundCatalog || []),
  ]);

  const remMap = new Map();
  for (const r of [...(local.reminders || []), ...(cloud.reminders || [])]) {
    if (!remMap.has(r.id)) {
      remMap.set(r.id, r);
    }
  }
  result.reminders = Array.from(remMap.values());

  if (local.goal !== null && local.goal !== undefined) {
    result.goal = local.goal;
  } else if (cloud.goal !== null && cloud.goal !== undefined) {
    result.goal = cloud.goal;
  } else {
    result.goal = null;
  }

  return result;
}

export function scheduleCloudSync() {
  if (loadError) {
    return;
  }
  if (!supabaseClient || !supabaseUser) {
    return;
  }
  markPendingPush();
  if (syncTimer) {
    clearTimeout(syncTimer);
  }
  updateSyncTimer(setTimeout(pushToCloud, 800));
}

export async function syncWithCloud() {
  if (loadError) {
    return;
  }
  if (!supabaseClient || !supabaseUser) {
    return;
  }
  if (hasPendingPush()) {
    const ok = await (cloudHooks.pushToCloud || pushToCloud)();
    if (!ok) {
      updateSupabaseSyncStatus('Alterações pendentes');
      updateSupabaseSyncError(
        'Há alterações locais ainda não enviadas. Elas foram mantidas neste aparelho.',
      );
      if (tab === 'configuracoes') {
        render();
      }
      return;
    }
  }
  await (cloudHooks.pullFromCloud || pullFromCloud)({ replaceLocal: true });
}

export function setupCloudResumeSync() {
  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        syncWithCloud();
      }
    });
  }
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('online', () => syncWithCloud());
  }
}

export async function pushToCloud() {
  if (loadError) {
    return false;
  }
  if (!supabaseClient || !supabaseUser) {
    return false;
  }
  try {
    updateSupabaseSyncStatus('Sincronizando...');
    updateSupabaseSyncError('');
    if (tab === 'configuracoes') {
      render();
    }
    // Trava extra: se o banco local estiver vazio e a nuvem tiver registros,
    // pede confirmação antes de enviar (evita apagar a nuvem acidentalmente).
    if (localRecordCount() === 0) {
      // verificação rápida da nuvem
      try {
        const { data } = await supabaseClient
          .from('user_data')
          .select('data')
          .eq('user_id', supabaseUser.id)
          .maybeSingle();
        const cloudCount =
          (data?.data?.applications?.length || 0) + (data?.data?.cycles?.length || 0);
        if (cloudCount > 0) {
          const ok = await confirmDialog(
            '',
            'O aparelho está vazio, mas a nuvem tem registros. Enviar este estado vazio apagará a nuvem. Continuar?',
          );
          if (!ok) {
            updateSupabaseSyncStatus('Alterações pendentes');
            updateSupabaseSyncError('');
            return false;
          }
        }
      } catch {
        /* ignora falha na verificação prévia */
      }
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
      updateSupabaseSyncStatus('Erro ao sincronizar');
      updateSupabaseSyncError(
        error.code === '42P01' || error.code === 'PGRST205'
          ? 'A tabela user_data ainda não existe neste projeto Supabase.'
          : error.message,
      );
      console.warn('Erro ao salvar no Supabase:', error.message);
      return false;
    } else {
      updateSupabaseSyncStatus('Sincronizado');
      markCloudSynced();
      clearPendingPush();
      return true;
    }
  } catch {
    updateSupabaseSyncStatus('Offline');
    return false;
  } finally {
    if (tab === 'configuracoes') {
      render();
    }
  }
}

export function markCloudSynced() {
  updateSupabaseLastSync(
    new Date().toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    }),
  );
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('peptide-supabase-last-sync', supabaseLastSync);
  }
}

export function localRecordCount() {
  return (db.applications?.length || 0) + (db.cycles?.length || 0);
}

export async function pullFromCloud({ replaceLocal = false } = {}) {
  if (loadError) {
    return;
  }
  if (!supabaseClient || !supabaseUser) {
    return;
  }
  try {
    updateSupabaseSyncStatus('Carregando dados...');
    updateSupabaseSyncError('');
    if (tab === 'configuracoes') {
      render();
    }
    const { data, error } = await supabaseClient
      .from('user_data')
      .select('data, updated_at')
      .eq('user_id', supabaseUser.id)
      .maybeSingle();

    if (error) {
      updateSupabaseSyncStatus('Erro ao carregar');
      updateSupabaseSyncError(
        error.code === '42P01' || error.code === 'PGRST205'
          ? 'A tabela user_data ainda não existe neste projeto Supabase.'
          : error.message,
      );
      console.warn('Erro ao ler do Supabase:', error.message);
      return;
    }

    const cloudDb = data?.data;
    if (cloudDb && typeof cloudDb === 'object' && Array.isArray(cloudDb.applications)) {
      // Valida os dados da nuvem antes de aplicar.
      let valid = false;
      try {
        validateBackup({ ...blank(), ...cloudDb });
        valid = true;
      } catch {
        valid = false;
      }
      if (!valid) {
        updateSupabaseSyncStatus('Erro ao carregar');
        updateSupabaseSyncError('Os dados da nuvem não passaram na verificação.');
        if (tab === 'configuracoes') {
          render();
        }
        return;
      }
      // Baixa da nuvem quando este aparelho ainda não tem registros ou quando o
      // chamador pede a substituição (entrar na conta, voltar ao app, sincronizar agora).
      if (replaceLocal || localRecordCount() === 0) {
        try {
          const prior = localStorage.getItem(KEY);
          if (prior !== null) {
            localStorage.setItem(KEY + '-pre-cloud-pull', prior);
          }
        } catch {
          /* ignora */
        }
        const merged = mergeDb(db, cloudDb);
        // valida resultado
        try {
          validateBackup(merged);
        } catch {
          updateSupabaseSyncStatus('Erro ao carregar');
          updateSupabaseSyncError('Os dados da nuvem não passaram na verificação.');
          if (tab === 'configuracoes') {
            render();
          }
          return;
        }
        updateDb(merged);
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(KEY, JSON.stringify(db));
        }
        clearPendingPush();
        // envia resultado mesclado se diferir da nuvem
        try {
          if (JSON.stringify(merged) !== JSON.stringify(cloudDb)) {
            await pushToCloud();
          }
        } catch {
          /* ignora */
        }
        render();
      }
    } else if (localRecordCount() > 0) {
      await pushToCloud();
      return;
    }
    updateSupabaseSyncStatus('Sincronizado');
    markCloudSynced();
  } catch {
    updateSupabaseSyncStatus('Offline');
  }
  if (tab === 'configuracoes') {
    render();
  }
}

export async function handleSupabaseAuth(mode, email, password) {
  if (!supabaseClient) {
    initSupabase();
  }
  if (!supabaseClient) {
    showToast(
      'Não foi possível iniciar a conexão com a nuvem. Verifique a internet e tente de novo.',
    );
    return;
  }
  if (!email || !password) {
    showToast('Preencha e-mail e senha.');
    return;
  }
  if (password.length < 6) {
    showToast('A senha precisa ter pelo menos 6 caracteres.');
    return;
  }
  try {
    updateSupabaseSyncStatus(mode === 'signup' ? 'Criando conta...' : 'Entrando...');
    updateSupabaseSyncError('');
    render();
    if (mode === 'signup') {
      const { data, error } = await supabaseClient.auth.signUp({ email, password });
      if (error) {
        updateSupabaseSyncStatus('');
        updateSupabaseSyncError(error.message);
        showToast('Erro ao criar conta: ' + error.message);
        render();
        return;
      }
      if (data?.session?.user) {
        updateSupabaseUser(data.session.user);
        updateSupabaseSyncStatus('Sincronizado');
        await pullFromCloud();
        await pushToCloud();
      } else {
        showToast(
          'Conta criada. Confirme o e-mail enviado pelo Supabase e depois toque em "Já tenho conta".',
        );
      }
    } else if (mode === 'signin') {
      const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
      if (error) {
        updateSupabaseSyncStatus('');
        updateSupabaseSyncError(error.message);
        showToast('Falha ao entrar: ' + error.message);
        render();
        return;
      }
      updateSupabaseUser(data?.user || supabaseUser);
      await pullFromCloud({ replaceLocal: true });
    }
    render();
  } catch (e) {
    updateSupabaseSyncStatus('');
    updateSupabaseSyncError(e.message);
    showToast('Erro de conexão: ' + e.message);
    render();
  }
}

export async function handleSupabaseSignOut() {
  if (supabaseClient) {
    await supabaseClient.auth.signOut();
    updateSupabaseUser(null);
    updateSupabaseSyncStatus('');
    updateSupabaseSyncError('');
    render();
  }
}

export async function handlePasswordReset() {
  const email = await promptDialog({
    title: 'Recuperar senha',
    text: 'Digite o e-mail da sua conta:',
  });
  if (!email) {
    return;
  }
  try {
    const { error } = await supabaseClient.auth.resetPasswordForEmail(email);
    if (error) {
      showToast('Erro: ' + error.message, 'error');
      return;
    }
    showToast('Enviamos um link de recuperação para o seu e-mail.');
  } catch (e) {
    showToast('Erro: ' + e.message, 'error');
  }
}

export async function deleteCloudData() {
  if (!supabaseUser) {
    return;
  }
  const ok = await confirmDialog(
    'Excluir dados da nuvem',
    'Isto apaga a cópia na nuvem. Os dados deste aparelho permanecem. Continuar?',
  );
  if (!ok) {
    return;
  }
  try {
    const { error } = await supabaseClient
      .from('user_data')
      .delete()
      .eq('user_id', supabaseUser.id);
    if (error) {
      showToast('Erro ao excluir: ' + error.message, 'error');
      return;
    }
    clearPendingPush();
    showToast('Dados da nuvem excluídos.');
  } catch (e) {
    showToast('Erro: ' + e.message, 'error');
  }
}

export function cloudSyncPanel() {
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
  }<div class="row actions">${button('Sincronizar agora', 'cloud-sync', '', 'primary')}${button('Sair da conta', 'cloud-logout')}${button('Esqueci minha senha', 'cloud-reset-password')}${button('Excluir meus dados da nuvem', 'cloud-delete-data', '', 'danger')}</div></div>`;
}
