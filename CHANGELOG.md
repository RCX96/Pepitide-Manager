# CHANGELOG

## 2.39

- **Aplicações:** salva e reutiliza modelos de preenchimento revisáveis.
- **Calendário:** separa planejamentos, itens pulados e aplicações registradas.
- **Diário:** anotações e sintomas com data na tela Início, independentes dos ciclos.
- **Estabilidade:** teste de navegador para atualização de uma instalação com cache antigo.

## 2.38.2

- **Atualização do app:** o carregamento espera o cache da nova versão para evitar a mistura de
  módulos antigos e novos. O aplicativo continua disponível offline após a instalação.

## 2.38.1

- **Ciclos:** permite remover uma pausa lançada por engano após confirmar o período.
  O app recalcula os dias ativos e retoma o ciclo se a pausa removida ainda estava em andamento.

## 2.38

- **Calendário:** edição e duplicação na lista do dia.
- **Exclusão:** ação Desfazer com recuperação pela lixeira.
- **Sincronização:** horário, envio pendente, status e nova tentativa no cabeçalho.
- **Ciclos:** primeira e última aplicação e atalho para o histórico do ciclo.
- **Histórico:** exportação CSV da lista filtrada, com contagem de registros.
- **Preferências:** o navegador guarda a seleção do calendário, os filtros e as seções recolhíveis.

## 2.37

- **Calendário:** tocar em um dia mostra seus registros. O botão Nova aplicação abre o formulário
  com a data selecionada.
- **Histórico:** a busca aceita filtros combinados por ciclo, composto e período inclusivo.

## 2.36.1

- **Aplicações:** o botão do histórico vazio abre o formulário, e a navegação de volta encerra a
  edição sem duplicar registros.
- **Calendário:** tocar em um dia abre o formulário com a data selecionada.
- **Salvamento:** se a gravação falhar, o formulário mantém os dados para uma nova tentativa.

## 2.36

- **Aplicações:** o formulário saiu da página e passa a abrir somente em popup. O botão "Nova
  aplicação", estendido por toda a largura do conteúdo, e os botões Editar e Duplicar abrem o mesmo
  diálogo, com os dados do registro quando aplicável.
- **Atalhos:** "Repetir último registro" e o clique em um dia do calendário também abrem o popup.

## 2.35

- **Início:** o botão "Registrar aplicação" agora abre o formulário de nova aplicação em um popup,
  com fechar pelo X, pelo fundo ou após salvar.
- **Aplicações no desktop:** busca, histórico e histórico por composto ocupam toda a largura do
  conteúdo, nessa ordem; o formulário fica compacto acima deles.

## 2.34

- **Aplicações:** o histórico virou uma seção recolhível com seta, como o histórico por composto.
- **Ajustes:** corrigida a duplicação do catálogo de compostos, da aparência, da proteção local e do
  backup criptografado no fim da página.
- **Relatórios no desktop:** o gráfico de aplicações por semana ocupa a largura da coluna de
  gráficos e fica acima do gráfico por composto, alinhado ao painel de filtros e exportação.

## 2.33

- **Relatórios:** as tabelas de Aplicações e Ciclos ficam uma abaixo da outra, ocupando toda a
  largura, e cada uma passa a ser uma seção recolhível com seta, igual ao histórico por composto.

## 2.32

- **Aplicações:** no celular, a busca vem antes do histórico e o histórico por composto fica dobrado
  no fim; no desktop, o formulário fica em uma coluna fixa e busca, histórico e filtro por composto
  na outra.
- **Relatórios:** o resumo vai ao topo, filtros e exportação ficam no mesmo painel, os gráficos ficam
  lado a lado no desktop e as tabelas ocupam a largura da página.
- **Tabelas no celular:** cada linha passa a ser um cartão com o nome do campo, sem colunas cortadas.

## 2.31

- **Navegação:** a aba ativa passa a constar na URL (`?tab=`), o botão Voltar do aparelho troca de
  aba e os atalhos do manifesto abrem a seção correta.
- **Foco e formulários:** editar aplicação ou ciclo rola ao formulário e foca o primeiro campo; o
  foco é preservado depois de atualizar a tela; ciclos e aplicações ganham `label` associado e erro
  inline com `aria-invalid`.
- **PWA:** ícone para iPhone, capturas de tela no manifesto, aviso de offline e service worker que
  só guarda no cache um HTML íntegro e da versão atual.
- **Segurança:** o SHA-256 do backup é descrito como checksum de corrupção, backups v2 sem checksum
  são recusados e as actions do CI ficam fixadas por SHA.
- **Acessibilidade:** link para pular ao conteúdo e diálogos com título e descrição associados.

## 2.30

- **Legibilidade no celular:** calendário com marcadores coloridos de 8px estáveis por composto (`--c1` a `--c8`) em telas estreitas e pílulas em telas maiores; tamanhos mínimos de fonte padronizados (≥12px para leitura, 11px para rótulos em caixa alta); alvos de toque com área mínima de 44px; suporte à área segura (`safe-area-inset-top` e `bottom`) para iPhone e entalhes.
- **Efeitos e desempenho:** superfícies em dois níveis (painéis comuns sólidos sem `backdrop-filter`; destaque com blur condicional); efeitos de `:hover` restritos a mouse/ponteiro fino; remoção do brilho do ponteiro e do ripple em JS em favor de `:active` em CSS; animações de entrada otimizadas e limitadas.
- **Tokens e padronização:** escalas de espaçamento (`--space-1` a `--space-6`) e tipografia (`--fs-label` a `--fs-2xl`); sombras semânticas (`--shadow-sm`, `--shadow-md`, `--shadow-lg`); cores e raios unificados.
- **Fonte Inter:** arquivos latin woff2 hospedados localmente no repositório em `fonts/` e incluídos no cache do service worker.
- **Hierarquia e conteúdo:** bloco "Hoje" no topo da tela Início com data por extenso, registros do dia, repetição rápida e botão primário contextual; ciclos com barra de progresso horizontal e agrupamento de finalizados em `<details>`; relatórios com gráfico semanal em SVG puro e barras por composto; componente padronizado de estados vazios (`empty-state`); indicador de sincronização e subtítulo no cabeçalho.
- **Navegação:** ícones SVG inline em duas linhas nas abas inferiores; barra lateral esquerda fixa de 88px em telas desktop acima de 1000px com layout em grade de duas colunas para Aplicações e Relatórios.
- **Temas e acessibilidade:** tema claro, escuro e automático com seletor de aparência em Ajustes (persistido no `localStorage`); contraste medido e validado por teste automatizado (`tests/contrast.test.mjs`).
- **Decisões registradas:** fonte Inter hospedada no repositório; brilho do ponteiro removido; barra lateral no desktop ativada; tema claro com paleta suave e alto contraste.

## 2.29

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
