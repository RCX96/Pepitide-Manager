import { BACKUP_META_KEY, CYCLE_ID_RE, KEY, db, supabaseUser, updateDb } from './state.js';
import { markPendingPush, scheduleCloudSync } from './sync.js';
import { confirmDialog, promptDialog, render, showToast, syncNav } from './ui.js';
import { $, base64ToBytes, bytesToBase64, esc, save, strictDate, today } from './util.js';

export async function restoreTrash(id) {
  const entry = (db.trash || []).find((x) => x.trashId === id);
  if (!entry) {
    return;
  }
  if (!(await confirmDialog('', 'Restaurar este registro da lixeira?'))) {
    return;
  }
  const type = entry.type;
  if (!['applications', 'cycles', 'weights'].includes(type)) {
    return;
  }
  const item = JSON.parse(JSON.stringify(entry.item));
  if (db[type].some((x) => x.id === item.id)) {
    showToast('Já existe um registro com o mesmo identificador.');
    return;
  }
  db[type].push(item);
  db.trash = db.trash.filter((x) => x.trashId !== id);
  if (type === 'cycles' && Array.isArray(entry.linkedApplicationIds)) {
    for (const appId of entry.linkedApplicationIds) {
      const app = db.applications.find((a) => a.id === appId);
      if (app && (app.cycleId === null || app.cycleId === undefined)) {
        app.cycleId = item.id;
      }
    }
  }
  save();
}

export async function deleteTrash(id) {
  if (
    !(await confirmDialog(
      '',
      'Excluir permanentemente este item da lixeira? Esta ação não pode ser desfeita.',
    ))
  ) {
    return;
  }
  db.trash = db.trash.filter((x) => x.trashId !== id);
  save();
}

export function downloadRawData() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      return showToast('Não há dados locais para copiar.');
    }
    const a = document.createElement('a'),
      u = URL.createObjectURL(new Blob([raw], { type: 'application/json' }));
    a.href = u;
    a.download = 'peptide-manager-recuperacao-bruta-' + today() + '.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(u), 5000);
  } catch (e) {
    showToast('Falha ao criar cópia bruta: ' + e.message);
  }
}

export function verifyLocalData() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      return showToast('Não há registros salvos neste navegador.');
    }
    const d = JSON.parse(raw);
    validateBackup(d);
    showToast(
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
    showToast(
      'Atenção: os dados salvos não passaram na verificação. Não apague os dados do navegador. ' +
        e.message,
    );
  }
}

export function validateBackup(d) {
  if (
    !d ||
    typeof d !== 'object' ||
    !['applications', 'cycles', 'weights'].every((k) => Array.isArray(d[k])) ||
    (d.trash !== undefined && !Array.isArray(d.trash)) ||
    (d.compoundCatalog !== undefined && !Array.isArray(d.compoundCatalog)) ||
    (d.reminders !== undefined && !Array.isArray(d.reminders)) ||
    (d.deleted !== undefined && !Array.isArray(d.deleted)) ||
    (d.schemaVersion !== undefined && Number(d.schemaVersion) > 3)
  ) {
    if (d && Number(d.schemaVersion) > 3) {
      throw Error('Este backup vem de uma versão mais nova do app.');
    }
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
      if (t.linkedApplicationIds !== undefined) {
        if (
          !Array.isArray(t.linkedApplicationIds) ||
          !t.linkedApplicationIds.every((x) => typeof x === 'string')
        ) {
          throw Error('Lixeira inválida');
        }
      }
      trashIds.add(t.trashId);
    }
  }
  return true;
}

export function backupStatusText() {
  try {
    const m = JSON.parse(localStorage.getItem(BACKUP_META_KEY) || 'null');
    return m && m.preparedAt
      ? 'Último arquivo preparado: ' +
          new Date(m.preparedAt).toLocaleString('pt-BR') +
          ' • ' +
          esc(m.fileName || '')
      : 'Nenhum backup V2.2 preparado neste navegador.';
  } catch {
    return 'Histórico de backups indisponível.';
  }
}

export async function sha256Text(s) {
  if (!globalThis.crypto || !crypto.subtle) {
    throw Error('Verificação SHA-256 requer HTTPS ou ambiente seguro');
  }
  const bytes = new TextEncoder().encode(s);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (x) => x.toString(16).padStart(2, '0')).join('');
}

export async function makeBackupFile() {
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

export function noteBackupPrepared(filename) {
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

export function downloadBackupBlob(blob, filename) {
  const a = document.createElement('a');
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 15000);
}

export async function exportData() {
  try {
    const { blob, filename } = await makeBackupFile();
    downloadBackupBlob(blob, filename);
    noteBackupPrepared(filename);
    showToast(
      'Checksum de corrupção conferido e download solicitado. Ele não comprova autenticidade; confirme no gerenciador de arquivos que o arquivo foi salvo.',
    );
  } catch (e) {
    showToast('Backup não gerado: ' + e.message);
  }
}

export async function deriveBackupKey(password, salt, iterations = 120000) {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function exportEncryptedData() {
  try {
    const password = await promptDialog({
      title: 'Backup criptografado',
      text: 'Defina uma senha para criptografar este backup:',
      type: 'password',
    });
    if (!password || password.length < 6) {
      return showToast('Use uma senha com pelo menos 6 caracteres.');
    }
    const { blob, filename } = await makeBackupFile();
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const iterations = 600000;
    const key = await deriveBackupKey(password, salt, iterations);
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
      iterations,
      salt: bytesToBase64(salt),
      iv: bytesToBase64(iv),
      data: bytesToBase64(new Uint8Array(cipher)),
    };
    const encryptedName = filename.replace('.json', '.encrypted.json');
    downloadBackupBlob(
      new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
      encryptedName,
    );
    showToast('Backup criptografado gerado. Guarde a senha separadamente.');
  } catch (e) {
    showToast('Backup criptografado não gerado: ' + e.message);
  }
}

export async function importEncryptedData() {
  const file = $('restoreFile').files[0];
  if (!file) {
    return showToast('Selecione um arquivo criptografado.');
  }
  try {
    const payload = JSON.parse(await file.text());
    if (!payload.encrypted || payload.algorithm !== 'AES-256-GCM') {
      throw Error('Arquivo criptografado inválido');
    }
    const password = await promptDialog({
      title: 'Backup criptografado',
      text: 'Digite a senha deste backup:',
      type: 'password',
    });
    if (!password) {
      return;
    }
    const key = await deriveBackupKey(
      password,
      base64ToBytes(payload.salt),
      payload.iterations || 120000,
    );
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: base64ToBytes(payload.iv) },
      key,
      base64ToBytes(payload.data),
    );
    const obj = JSON.parse(new TextDecoder().decode(plain));
    validateBackup(obj.data);
    if (
      !(await confirmDialog(
        '',
        `Backup descriptografado: ${obj.data.applications.length} aplicações, ${obj.data.cycles.length} ciclos e ${obj.data.weights.length} pesagens. Substituir os dados atuais?`,
      ))
    ) {
      return;
    }
    localStorage.setItem(KEY + '-pre-restore', JSON.stringify(db));
    updateDb({ ...blank(), ...obj.data });
    save();
    showToast('Backup criptografado restaurado.');
  } catch {
    showToast('Não foi possível abrir o backup criptografado. Verifique a senha e o arquivo.');
  }
}

export async function shareBackup() {
  try {
    const { blob, filename } = await makeBackupFile();
    const file = new File([blob], filename, { type: 'application/json' });
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Backup Peptide Manager' });
      noteBackupPrepared(filename);
      showToast(
        'Compartilhamento concluído ou encaminhado. Verifique no Google Drive se o arquivo foi salvo.',
      );
    } else {
      downloadBackupBlob(blob, filename);
      noteBackupPrepared(filename);
      showToast(
        'Compartilhamento de arquivos não disponível aqui. O download foi solicitado. Envie o arquivo manualmente ao Google Drive.',
      );
    }
  } catch (e) {
    if (e.name === 'AbortError') {
      return;
    }
    showToast('Não foi possível preparar ou compartilhar: ' + e.message);
  }
}

export async function importData() {
  const file = $('restoreFile').files[0];
  if (!file) {
    return showToast('Selecione um arquivo JSON.');
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
    if ((obj.version ?? 1) >= 2 && obj.integrity === undefined) {
      throw Error('Backup v2 sem checksum de integridade');
    }
    let integrity = 'Backup antigo sem checksum (somente estrutura validada).';
    if (obj.integrity !== undefined) {
      if (
        !obj.integrity ||
        obj.integrity.algorithm !== 'SHA-256' ||
        typeof obj.integrity.dataHash !== 'string' ||
        !/^[a-f0-9]{64}$/.test(obj.integrity.dataHash)
      ) {
        throw Error('Checksum de integridade inválido');
      }
      const actual = await sha256Text(JSON.stringify(obj.data));
      if (actual !== obj.integrity.dataHash) {
        throw Error(
          'Falha no checksum: conteúdo diferente do backup original (possível corrupção)',
        );
      }
      integrity = 'Checksum SHA-256 de corrupção conferido (não comprova autenticidade).';
    }
    const summary = `${integrity}\nAplicações: ${obj.data.applications.length}\nCiclos: ${obj.data.cycles.length}\nPesagens: ${obj.data.weights.length}\nLixeira: ${(obj.data.trash || []).length}\n\nA restauração substitui os registros atuais. Deseja continuar?`;
    if (!(await confirmDialog('', summary))) {
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
      updateDb(incoming);
      markPendingPush();
      scheduleCloudSync();
      render();
      syncNav();
      showToast(
        'Backup restaurado e validado.' +
          (supabaseUser
            ? '\n\nA restauração também substituirá a cópia na nuvem quando a sincronização ocorrer.'
            : ''),
      );
    } catch (e) {
      updateDb(old);
      throw Error('Falha ao gravar os dados. Os registros anteriores foram mantidos.');
    }
  } catch (e) {
    showToast('Não foi possível importar: ' + e.message);
  }
}

// V2.0: relatórios são somente leitura; nenhum dado é alterado pelos filtros.
