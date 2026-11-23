# CHANGELOG

## 2.29 (em desenvolvimento)

- Sincronização segura: envio falho não apaga alterações locais; dados corrompidos não sobem; validação de dados da nuvem; mesclagem por registro com `updatedAt` e tombstones.
- Restaurar backup logado agenda sincronização.
- Restaurar ciclo da lixeira religa aplicações.
- Bloqueio local com PBKDF2-SHA-256, salt, 600k iterações, migração do formato antigo, rate limiting.
- Backup criptografado com 600k iterações, campo `iterations` para compatibilidade.
- Diálogos nativos substituindo `alert/confirm/prompt`.
- `aria-current="page"` na navegação.
- CSP restritiva no `index.html`.
- Preservação de rascunho do formulário durante edição.
- `app.js` dividido em módulos ES em `js/` (entry point `js/main.js`); service worker e deploy
  publicam a pasta `js/` e `vendor/`.
