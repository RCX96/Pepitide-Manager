# CHANGELOG

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
