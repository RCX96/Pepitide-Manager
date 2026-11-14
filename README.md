# Peptide Manager

PWA de registro pessoal de aplicações, ciclos e evolução de peso. Funciona offline, guarda tudo
no navegador e não envia dados para servidor.

**Aviso:** o aplicativo é um diário. Ele não avalia segurança, compatibilidade ou doses de
compostos e não substitui orientação profissional.

- Fontes: <https://github.com/RCX96/Pepitide-Manager>
- Versão atual: 2.4

## O que faz

- **Aplicações:** data, horário, local, ciclo vinculado, compostos por seringa e observações.
- **Ciclos:** início, fim, pausas e retomadas; o tempo ativo desconta os dias em pausa.
- **Peso:** pesagens, meta, gráfico e variação por período.
- **Calendário:** consulta das aplicações registradas por dia, sem cálculo de doses.
- **Relatórios:** filtros por período e ciclo, exportação CSV e impressão/PDF.
- **Dados:** backup JSON com verificação SHA-256, restauração validada, lixeira e diagnóstico de
  integridade.
- **Lembretes:** notificações recorrentes de composto (uma vez, todos os dias ou toda semana),
  exibidas no inicial e no calendário.
- **Catálogo de compostos:** sugestões de nomes salvos para agilizar novos registros.
- **Proteção local:** código de bloqueio com hash (AES-256-GCM disponível no backup criptografado).

## Privacidade e armazenamento

- Os registros ficam no `localStorage` deste navegador, na chave `peptide-manager-v1`.
- Não há conta, sincronização automática nem backend.
- Limpar os dados do navegador apaga os registros: exporte backups com frequência (o app lembra
  após 14 dias).
- O conteúdo local não é criptografado em repouso, mas é possível exportar um backup
  **criptografado** (AES-256-GCM) com senha própria no painel de **Dados**.

## Estrutura

```
index.html            interface da PWA
app.js                lógica do aplicativo (todas as telas e ações)
styles.css            temas, componentes e animações
manifest.webmanifest  metadados da PWA
service-worker.js     cache offline (network-first na navegação)
icon-192.png          ícone
icon-512.png          ícone
tests/logic.test.mjs  testes das funções puras
```

O aplicativo termina com `render()` e registra o service worker, quando disponível. As funções de
domínio (`dayCount`, `elapsedCycle`, `strictDate`, `validateBackup`, `csvCell`) são puras o
suficiente para serem testadas fora do navegador.

## Desenvolvimento

Pré-requisito: Node.js 20 ou superior.

```bash
npm test        # rodar os testes
npm run lint    # lint do JavaScript
npm run format  # formatar com Prettier
npm run format:check  # conferir formatação sem alterar
```

Para abrir o app, sirva a pasta por HTTP (o service worker e a instalação da PWA exigem `https`
ou `localhost`):

```bash
npx serve .
```

Abrir `index.html` direto no disco também funciona, mas sem modo offline.

## Deploy

O aplicativo é estático. O branch `main` é a fonte da verdade; o GitHub Pages (ou qualquer
servidor estático) expõe a PWA sem precisar de backend ou de uma provedora de deploy separada.

## Versionamento

- `index.html` exibe a versão no cabeçalho.
- Cada versão publicada recebe uma tag e uma release no GitHub (`v2.4`, por exemplo).
- O cache do service worker usa o mesmo número (`peptide-manager-shell-v2.4`); ao publicar,
  atualize a constante `CACHE` para invalidar o cache antigo.

## Limitações conhecidas

- Sem sincronização entre aparelhos; a transferência é manual por backup JSON.
- O conteúdo local não é criptografado, salvo no backup criptografado com senha própria.
- Sem testes de interface automatizados (apenas testes de lógica pura).
