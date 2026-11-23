# Peptide Manager

PWA de registro pessoal de aplicações e ciclos. Funciona offline e guarda os
registros no navegador. Quando você entra em uma conta, o app também sincroniza uma cópia com o
Supabase.

**Aviso:** o aplicativo é um diário. Ele não avalia segurança, compatibilidade ou doses de
compostos e não substitui orientação profissional.

- Fontes: <https://github.com/RCX96/Pepitide-Manager>
- App: <https://rcx96.github.io/Pepitide-Manager/>
- Versão atual: 2.28

## O que faz

- **Aplicações:** data, horário, ciclo vinculado, compostos por seringa e observações.
- **Ciclos:** início, fim, pausas e retomadas; o tempo ativo desconta os dias em pausa.
- **Início:** calendário das aplicações por dia e tempo dos ciclos ativos.
- **Relatórios:** filtros por período e ciclo, exportação CSV e impressão/PDF.
- **Ajustes:** backup JSON com verificação SHA-256, restauração validada, lixeira e diagnóstico de
  integridade.
- **Sincronização na nuvem:** conta por e-mail e senha no Supabase; cada registro sobe sozinho e
  desce em um aparelho novo ao entrar na mesma conta.
- **Catálogo de compostos:** sugestões de nomes salvos para agilizar novos registros.
- **Proteção local:** código de bloqueio com hash (AES-256-GCM disponível no backup criptografado).

## Privacidade e armazenamento

- Os registros ficam no `localStorage` deste navegador, na chave `peptide-manager-v1`.
- Com a conta na nuvem ativa, uma cópia fica na tabela `user_data` do Supabase. O acesso é protegido
  por RLS: cada conta lê e grava apenas a própria linha.
- Sem conta, o app funciona só neste navegador.
- Limpar os dados do navegador apaga os registros locais. Se a conta na nuvem já estiver conectada,
  entre novamente para baixar a cópia da nuvem.
- O conteúdo local não é criptografado em repouso, mas é possível exportar um backup
  **criptografado** (AES-256-GCM) com senha própria no painel de **Ajustes**.

## Sincronizar entre o desktop e o celular

O app usa a mesma conta Supabase nos dois aparelhos. A URL e a chave pública do projeto já estão
configuradas em `js/state.js`. A chave pública pode ficar no aplicativo. A proteção dos dados depende do
RLS da tabela `user_data`.

### Configure a tabela uma vez

Para o projeto já configurado do app, pule esta seção. Se você estiver configurando outro projeto
Supabase, abra o **SQL Editor** e execute este script:

```sql
create table if not exists public.user_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.user_data enable row level security;

drop policy if exists "user_data_owner" on public.user_data;

create policy "user_data_owner"
on public.user_data
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
```

O script cria uma linha por conta. O campo `data` guarda o estado do app em JSON.

### Conecte o primeiro aparelho

1. Abra o app no desktop ou no celular.
2. Abra **Ajustes**.
3. Em **Sincronização na nuvem**, informe um e-mail e uma senha com pelo menos seis caracteres.
4. Toque em **Criar conta**.
5. Se a confirmação de e-mail estiver ativa no Supabase, confirme o e-mail e toque em **Já tenho conta**.
6. Aguarde o status **Sincronizado**.

Se esse aparelho já tiver registros e a conta ainda não tiver dados, o app envia os registros locais
para a nuvem depois do cadastro.

### Conecte o segundo aparelho

1. Abra o mesmo app no segundo aparelho.
2. Abra **Ajustes**.
3. Informe o mesmo e-mail e a mesma senha.
4. Toque em **Já tenho conta**.
5. Aguarde o status **Sincronizado**.

Ao entrar, o app baixa os dados da nuvem e substitui os dados locais desse aparelho. O botão
**Sincronizar agora** faz a mesma operação.

### Entenda quando a sincronização acontece

- Cada salvamento local agenda o envio para a nuvem quando você está conectado.
- Ao abrir o app ou voltar para ele, e também quando a conexão volta, o app se alinha com a nuvem:
  envia se houver alteração local ainda não enviada; se não houver, baixa a cópia da nuvem.
- O status **Sincronizado** confirma o último envio ou carregamento concluído.
- Sem internet, o app continua salvando no navegador. Quando a conexão voltar, toque em
  **Sincronizar agora**.
- A sincronização não mescla alterações feitas em dois aparelhos. Se dois aparelhos editarem sem
  sincronizar, o envio de um deles pode substituir o estado salvo pelo outro.
- O backup JSON continua separado. A nuvem guarda o estado atual e não mantém versões antigas.

### Resolva os erros mais comuns

- **A tabela `user_data` ainda não existe:** execute o script de configuração no SQL Editor.
- **Erro ao carregar** ou **Erro ao sincronizar:** confira a conexão, a URL do projeto e a política RLS.
- **Falha ao entrar:** confira o e-mail e a senha. Se a confirmação de e-mail estiver ativa, confirme
  a mensagem recebida antes de entrar.

## Estrutura

```
index.html            interface da PWA
js/                   módulos ES do aplicativo
  main.js             entrada, eventos delegados e inicialização
  state.js            estado compartilhado, migrações e setters
  util.js             helpers de data, texto e identificadores
  ui.js               renderização, navegação e diálogos
  calendar.js         calendário e painel inicial
  apps.js             aplicações e compostos
  cycles.js           ciclos
  lock.js             bloqueio local do aplicativo
  sync.js             sincronização Supabase
  backup.js           backup, importação e lixeira
  reports.js          relatórios
styles.css            temas, componentes e animações
manifest.webmanifest  metadados da PWA
service-worker.js     cache offline (network-first na navegação)
icon-192.png          ícone
icon-512.png          ícone
icon-maskable-512.png ícone com margem segura (Android)
tests/logic.test.mjs  testes das funções puras
vendor/supabase.js    cliente Supabase local (sem CDN)
```

O aplicativo inicia em `js/main.js` e registra o service worker, quando disponível. As funções de
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

O aplicativo é um front-end estático. O branch `main` é a fonte da verdade; o GitHub Pages ou outro
servidor estático expõe a PWA sem um servidor próprio. A sincronização usa o projeto Supabase
configurado em `js/state.js`.

## Versionamento

- `index.html` exibe a versão no rodapé e carrega `js/main.js`/`styles.css` com `?v=<versão>`.
- Cada versão publicada recebe uma tag e uma release no GitHub (`v2.4`, por exemplo).
- O cache do service worker usa o mesmo número (`peptide-manager-shell-v2.28`); ao publicar,
  atualize `CACHE_VERSION` em `service-worker.js` e o `?v=` em `index.html`. O app mostra
  “Nova versão disponível” quando a versão nova assume o controle.

## Limitações conhecidas

- A sincronização não mescla alterações simultâneas entre aparelhos.
- O conteúdo local não é criptografado, salvo no backup criptografado com senha própria.
- Sem testes de interface automatizados (apenas testes de lógica pura).
