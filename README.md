# Peptide Manager

PWA de registro pessoal de aplicações, ciclos e evolução de peso. Funciona offline, guarda tudo no navegador e não envia dados para servidor.

**Aviso:** o aplicativo é um diário. Ele não avalia segurança, compatibilidade ou doses de compostos e não substitui orientação profissional.

- Produção: <https://pepitide-manager.vercel.app>
- Versão atual: 2.3

## O que faz

- **Aplicações:** data, horário, local, ciclo vinculado, compostos por seringa e observações.
- **Ciclos:** início, fim, pausas e retomadas; o tempo ativo desconta os dias em pausa.
- **Peso:** pesagens, meta, gráfico e variação por período.
- **Calendário:** consulta das aplicações registradas por dia, sem cálculo de doses.
- **Relatórios:** filtros por período e ciclo, exportação CSV e impressão/PDF.
- **Dados:** backup JSON com verificação SHA-256, restauração validada, lixeira e diagnóstico de integridade.

## Privacidade e armazenamento

- Os registros ficam no `localStorage` deste navegador, na chave `peptide-manager-v1`.
- Não há conta, sincronização automática nem backend.
- Limpar os dados do navegador apaga os registros: exporte backups com frequência (o app lembra após 14 dias).
- O conteúdo não é criptografado em repouso; quem tiver acesso ao perfil do navegador pode ler os dados.

## Estrutura

```
index.html            aplicativo completo (HTML, CSS e JavaScript inline)
manifest.webmanifest  metadados da PWA
service-worker.js     cache offline (network-first na navegação)
icon-192.png          ícone
icon-512.png          ícone
vercel.json           headers de segurança e cache
tests/logic.test.mjs  testes das funções puras
```

O script inline termina com `render()` e registra o service worker. As funções de domínio (`dayCount`, `elapsedCycle`, `strictDate`, `validateBackup`, `csvCell`) são puras o bastante para serem testadas fora do navegador.

## Desenvolvimento

Pré-requisito: Node.js 20 ou superior.

```bash
node --test tests/
```

Para abrir o app, sirva a pasta por HTTP (o service worker e a instalação da PWA exigem `https` ou `localhost`):

```bash
npx serve .
```

Abrir `index.html` direto no disco também funciona, mas sem modo offline.

## Deploy

O deploy é feito pela Vercel a partir da branch `main`. Alterações entram por pull request; a `main` é a fonte da verdade.

## Versionamento

- `index.html` exibe a versão no cabeçalho.
- Cada versão publicada recebe uma tag e uma release no GitHub (`v2.3`, por exemplo).
- O cache do service worker usa o mesmo número (`peptide-manager-shell-v2.3`); ao publicar, atualize a constante `CACHE` para invalidar o cache antigo.

## Limitações conhecidas

- Sem sincronização entre aparelhos; a transferência é manual por backup JSON.
- Sem criptografia dos dados locais.
- Sem testes de interface automatizados.
