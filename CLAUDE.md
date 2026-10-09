# Guarusolar — Sistema de Gestão

Contexto permanente deste repositório. Leia antes de qualquer tarefa.

## O que é

Sistema de gestão para a **Guarusolar**, empresa de energia solar de Guarulhos/SP.
Substitui o **Alvo**, ferramenta de mercado que a empresa usa hoje e pretende abandonar
(o cliente deixa de pagar a mensalidade do Alvo).

O sistema cobre o fluxo inteiro:

```
orçamento → aprovação → projeto → agenda das equipes → execução com fotos → validação → concluído
```

## Quem usa

| Papel | Onde usa | O que enxerga |
| --- | --- | --- |
| `COMERCIAL` | navegador no PC do escritório (site) | clientes, catálogo, orçamentos, PDF, WhatsApp |
| `GESTOR` | navegador no PC do escritório (site) | agenda das equipes, validação das fotos, projetos |
| `TECNICO` | navegador do próprio celular (PWA, sem instalar) | **somente** a agenda dele e o envio de fotos |
| `ADMIN` | ambos | tudo |

Decisão fechada com o cliente: **o sistema é só web**. O escritório usa o site no navegador do
PC e os **técnicos usam o site no celular** (PWA), porque usam aparelhos próprios e não devem
instalar nada. Os dois falam com a **mesma API e o mesmo banco**.

**Não haverá executável do escritório** (antes previsto com Electron ou Tauri), decidido pelo
cliente: na web a atualização é automática (cada publicação vale na próxima abertura), não há
instalação nos PCs e todos usam sempre a mesma versão.

**Sem executável (não aplicável):** um app empacotado abriria os arquivos por `file://`, o que
exigiria trocar o roteador por HashRouter e liberar CORS para a API em outra origem. Na versão
web, o escritório é servido pela própria API (mesma origem): `createBrowserRouter` continua
e não há CORS no navegador.

## Stack

- **Banco:** PostgreSQL + Prisma
- **API:** Node.js + TypeScript + Express + Zod (`apps/api`)
- **Front:** React + Vite + Tailwind CSS + shadcn/ui
- **Auth:** JWT com papéis
- **Arquivos (fotos e PDFs):** hoje em disco local; em produção no **OneDrive/SharePoint do cliente**
  via Microsoft Graph, aproveitando o plano Microsoft 365 que ele já paga
- **Hospedagem:** custo zero: Render (plano gratuito, região Virginia; dorme após 15 min) e
  Supabase (gratuito); backup noturno do banco pelo GitHub Actions. **Banco de produção em São
  Paulo por decisão do cliente (LGPD: dados de clientes brasileiros ficam no Brasil)**, aceitando
  ~120 ms por ida ao banco. Não proponha mover o banco para fora do Brasil

## Estrutura

Monorepo com npm workspaces. Instale e rode os comandos sempre a partir da raiz.

```
package.json                   workspaces e atalhos (build, dev:api, db:*)
apps/api/                      API (Express + Prisma)
  prisma/schema.prisma         tabelas (clientes, produtos, orçamentos, itens, projetos,
                               equipes, agendamentos, checklist de fotos, fotos, materiais)
  prisma/seed-base.ts          equipes, catálogo de exemplo e checklist (produção também, mas lá
                               sem o catálogo de exemplo; sem usuários)
  prisma/seed-teste.ts         usuários de teste (senha pública guarusolar123): NUNCA em produção
                               (recusa com NODE_ENV=production e em banco marcado como produção)
  scripts/usuario.ts           npm run usuario -- criar|nova-senha|trocar-email|desativar|listar: reais,
                               com senha temporária (troca obrigatória no primeiro acesso)
  scripts/conferir-producao.ts npm run db:conferir-producao: erro se o banco não tem a marca
                               (Publicar roda antes das migrations); /saude informa `producao`
  scripts/marcar-producao.ts   npm run db:marcar-producao: grava a marca de produção NO banco
                               (tabela AmbienteDoBanco; lib/ambienteDoBanco.ts confere)
  prisma/limpar.ts             apaga os dados de operação (npm run db:limpar)
  scripts/zerar-para-entrega.ts  npm run db:zerar-para-entrega -- --admin <e-mail>: o ÚNICO que apaga
                               em PRODUÇÃO (dados de teste antes da entrega): tudo do db:limpar,
                               mais a escala e todos os usuários menos o ADMIN indicado. Recusa
                               se esse ADMIN não existir/ativo; pede a frase "ZERAR PRODUCAO".
  src/server.ts                sobe a API e monta as rotas
  src/lib/appsWeb.ts           em produção a API entrega o escritório (/) e o técnico (/campo/):
                               assets/ com cache de 1 ano; index.html, sw.js e manifest sem cache;
                               página de reserva só para navegação (arquivo inexistente = 404)
  src/lib/senha.ts             regras da senha nova (8+, sem óbvias, sem e-mail/nome)
  src/lib/auth.ts              JWT, hash de senha, middleware autenticar/autorizar; conferirSenha
                               roda o bcrypt mesmo sem conta (tempo igual: não revela e-mails)
  src/lib/limiteLogin.ts       limite de tentativas de login, em memória: por e-mail (5 falhas ->
                               1, 5, 15, 60 min) e por IP (30 falhas em 15 min -> 5, 15, 60 min,
                               folga para técnicos na mesma rede). Com mais de uma instância da
                               API, mover para o banco ou Redis. Depende de TRUST_PROXY certo
  src/lib/conferencia-enums.ts falha o build se os enums do Prisma e do pacote divergirem
  src/lib/codigos.ts           GS-2026-0148 (orçamento) e PRJ-2026-0146 (projeto); contador
                               atômico por ano na tabela SequenciaCodigo (nunca contar linhas)
  src/lib/armazenamento.ts     camada das fotos: STORAGE_PROVIDER escolhe onde as NOVAS vão
                               ("disco" padrão, "sharepoint" produção); a leitura segue a chave
                               ("sp:<id>" = SharePoint; o resto, disco). O banco guarda a CHAVE
                               (FotoServico.arquivoChave), nunca uma URL. Foto refeita: o arquivo
                               antigo vai para "Substituídas/". Chave que saia da pasta é recusada
  src/lib/sharepoint.ts        Microsoft Graph com credencial de aplicativo (Sites.Selected):
                               token em memória, novas tentativas (Retry-After), falha vira
                               ArmazenamentoIndisponivel -> 503 (a fila do celular reenvia)
  src/lib/nomesDeArquivo.ts    pastas e nomes no SharePoint: Cliente – Cidade / PRJ / data e tipo /
                               "01 Item hh-mm-ss.jpg" (segundos: reenvio substitui, não duplica)
  scripts/sharepoint-conferir.ts  npm run sharepoint:conferir: testa credencial, site, biblioteca,
                               envio e leitura antes de ligar em produção
  src/lib/acesso.ts            regra 6 (técnico só vê os serviços em que está ESCALADO) num lugar
                               só: tecnicoPodeVer e filtroDoTecnico
  src/rotas/fotos.ts           GET /api/fotos/:id?tamanho=miniatura — ÚNICA saída das fotos:
                               login sempre; gestor vê todas, técnico só de serviço em que está
                               escalado (outro: 404),
                               comercial não (403). Não existe pasta pública de arquivos
  src/lib/erros.ts             ErroHttp, wrapper de rota async, tratador central; erros do Prisma viram
                               mensagem para o usuário (banco fora do ar = 503, P2025 = 404, P2002 = 409)
  src/lib/upload.ts            limite de tamanho das fotos (usado no multer e na mensagem)
  src/lib/zod-pt.ts            mensagens padrão do Zod em português (importado no server.ts)
  src/lib/pdf-orcamento.ts     proposta A4 (pdfmake), só com dados gravados: página 1 = proposta,
                               última = institucional. Caixas arredondadas = retângulo (canvas
                               fora do fluxo) sob tabela de altura fixa; alturas de texto MEDIDAS
                               com o pdfkit (nunca estimar). Fontes em WOFF (WOFF2 e IBM Plex Mono
                               quebram o subset do pdfkit; Bricolage só existe variável: títulos
                               em Plex negrito). Conferir com `npm run pdf:exemplo` e olhar o PDF
  src/conteudo/proposta.ts     EDITÁVEL: dados da empresa, textos fixos da página 1 e a página
                               institucional inteira. Orçamento: descricaoServico (título) e
                               detalharPrecosNoPdf (preço unitário e subtotal; padrão false)
  scripts/pdf-exemplo.ts       npm run pdf:exemplo [pasta]: PDFs de exemplo sem banco
  scripts/importar-produtos.ts npm run produtos:importar -- revisar|gravar: catálogo a partir de
                               .xlsx em duas etapas (revisão em Excel, depois grava tudo ou nada).
                               Categoria e unidade por palavra-chave (REGRAS, a primeira que casa
                               vence). Regras da Guarusolar: de nomes repetidos fica o de MAIOR valor (empate:
                               menor código); "MARGEM" sai N; código repetido entre itens diferentes
                               fica "?" para o usuário. O VALOR da planilha é PREÇO DE
                               VENDA (confirmado): entra sem margem e o custo fica em branco
  src/rotas/orcamentoPdf.ts    GET /api/orcamentos/:id/pdf?token= — público, protegido pelo tokenPdf
  src/rotas/                   auth, clientes, produtos, orcamentos, operacao (agenda,
                               validação e técnico)
apps/escritorio/               front do escritório (Vite + React + Tailwind v4 + shadcn/ui)
  src/estilos/tema.css         importa o Tailwind e o tema de packages/web
  src/main.tsx                 configurarApi({ chaveToken }) antes de renderizar
  src/lib/consultas.ts         React Query com aviso global de erro (toast); consulta cuja tela mostra o
                               erro no quadro leva meta { erroNaTela: true } e textoDoErro (sem aviso repetido)
  src/app/rotas.tsx            roteador de dados (createBrowserRouter, necessário para o
                               useBlocker); cada tela fica dentro de <RotaProtegida papeis={...}>
  src/paginas/orcamentos/      lista (/orcamentos: indicadores, filtros, status em 1 clique)
                               e gerador (/orcamentos/:id, com "novo" para criar): prévia com
                               calcularOrcamento, salvar via POST/PUT, WhatsApp; APROVADO
                               abre só para leitura. PERÍODO da lista e do pipeline (periodo.tsx,
                               API abertosSempre): em aberto (rascunho, enviado, em negociação)
                               aparecem SEMPRE, negociação não tem mês (decisão da Guarusolar);
                               aprovado e recusado entram pelo mês da DECISÃO (aprovadoEm/recusadoEm)
  src/paginas/orcamentos/Pipeline.tsx  Kanban (/pipeline): arrastar e soltar com
                               @atlaskit/pragmatic-drag-and-drop respeitando TRANSICOES_STATUS;
                               o menu de status do cartão é a alternativa por teclado
  src/paginas/orcamentos/MenuStatus.tsx  useMudancaDeStatus: confirmações de aprovar/recusar e
                               atualização otimista, usada na lista e no pipeline
  src/paginas/clientes/        lista (/clientes) e ficha (/clientes/:id) com os orçamentos do
                               cliente; desativar/reativar com confirmação
  src/components/DialogCliente formulário de cliente (criar e editar, com ViaCEP), usado no
                               gerador e na tela de clientes
  src/paginas/catalogo/        catálogo (/catalogo): filtros, ativar/desativar e painel lateral
                               de criar/editar com margem ao vivo (calcularMargem)
  src/paginas/agenda/          agenda das equipes (/agenda, só GESTOR): faixa "A agendar",
                               grade da semana (segunda a sábado) por equipe, agendar,
                               remarcar e cancelar. Datas como texto AAAA-MM-DD (dias.ts no
                               compartilhado); serviço de N dias pula o domingo (fimDoServico).
                               A duração não existe na API: o front pergunta os dias e manda dataFim.
                               A linha da equipe empilha em FAIXAS os serviços com dias em comum
                               (blocosDaSemana); com mais de uma faixa os blocos ficam compactos.
                               escala.tsx: "Quem vai" (QuemVai), avisos de conflito e os nomes
  src/paginas/validacao/       validação (/validacao, só GESTOR): fila à esquerda (aguardando,
                               depois devolvidos; serviço aberto em ?servico=), detalhe com fotos
                               OK/Refazer, foto ampliada (← → navegam, O/R marcam, Esc fecha),
                               motivo, aprovar com confirmação; ao resolver, a fila muda na hora
                               (setQueryData) e o próximo abre. fila.ts fica separado para o
                               contador do menu (app/ContadorValidacao) não puxar a tela
  src/paginas/usuarios/        usuários (/usuarios, só ADMIN; menu Administração): criar com senha
                               temporária mostrada UMA vez, nova senha, papel e equipe, ativar e
                               desativar. API em rotas/usuarios.ts (não se desativa nem se rebaixa;
                               sempre sobra um ADMIN ativo). npm run usuario é a alternativa
  src/paginas/projetos/        projetos (/projetos, COMERCIAL consulta, GESTOR age): lista com
                               filtros por situação (padrão "Em andamento") e "Próximo passo";
                               ficha com etapas, cliente e local (cópia do orçamento), orçamento
                               de origem, serviços, fotos (só gestor), potência e observações,
                               histórico e "Cancelar projeto" (só antes da execução). Agendar e
                               validar continuam na Agenda e na Validação: a ficha só leva até lá
  src/components/CampoBusca    autocomplete acessível (combobox ARIA), usado nas buscas
  src/app/menu.ts              itens do menu, os papéis de cada um, o grupo (Comercial ou
                               Operação) e o `contador` opcional (número ao lado do item)
  src/app/permissoes.ts        papéis do escritório e podeAcessar() (ADMIN acessa tudo)
  src/components/ui/           gerados pelo shadcn (npx shadcn@latest add ... --cwd apps/escritorio).
                               ATENÇÃO: o CLI instala um pacote npm "cn" e importa `from "cn"`;
                               depois de cada add, desinstale o "cn" e troque o import por
                               `from "@/lib/utils"`
  src/paginas/                 Login, Inicio, SemAcesso
apps/tecnico/                  app do técnico (PWA no navegador do celular; mesmo stack do escritório).
                               Build com base /campo/ (BASE_TECNICO troca); dev na raiz (5174)
  src/app/rotas.tsx            SessaoProvider com papeisAceitos=['TECNICO']: outros papéis recebem
                               o aviso para usar o escritório
  src/paginas/Agenda.tsx       hoje e os próximos 7 dias; serviço de vários dias aparece em cada
                               dia; no topo, os devolvidos pelo gestor e os em aberto de dias
                               anteriores; WhatsApp e "Como chegar"
  src/paginas/Servico.tsx      serviço aberto (protótipo "Técnico — concluir serviço"): checklist,
                               extras, observações e teste (rascunho no localStorage), botão do
                               rodapé que diz o que falta e leva até lá
  src/fotos/fila.ts            FILA OFFLINE das fotos (IndexedDB): a original é gravada no ato,
                               antes do preparo; um trabalhador prepara e outro envia, uma foto
                               por vez; rede/5xx tenta de novo (5 s, 15 s, 1 min, 5 min), 4xx vira
                               erro na tela, 401 pausa; acorda com `online`, com a volta à tela e
                               com qualquer consulta que dá certo. Leia o comentário do topo
                               antes de mexer
  src/fotos/                   reduzir.ts (2000 px, JPEG 85), metadados.ts (EXIF + posição do
                               navegador), useLocalizacao.ts (permissão pedida num toque próprio,
                               nunca junto com a câmera), envio.ts, useFotos.ts (a tela lê a fila)
  src/lib/consultas.ts         React Query persistido no localStorage (só agenda e serviços):
                               o app abre sem sinal com o que já foi carregado
  src/components/AvisoAtualizacao  versão nova do app só entra quando o técnico toca em
                               "Atualizar" (faixa no topo; embaixo cobriria o botão principal)
  vite.config.ts               service worker (vite-plugin-pwa): guarda o app, não a API. Só
                               funciona no build: teste com `npm run preview:tecnico` (5175).
                               Também o manifest (nome, cores, ícones, abre em /agenda)
  icones/                      app.svg (ícone PROVISÓRIO: sol) e gerar.mjs, que cria os PNGs em
                               public/ (`npm run icones -w @guarusolar/tecnico`). Chegando o logo,
                               troque o app.svg e rode de novo
  src/components/ConviteInstalacao  "Coloque o app na tela inicial": botão Instalar no Android
                               (beforeinstallprompt), passo a passo do Compartilhar no iPhone;
                               some se já instalado; "Agora não" vale por 7 dias
packages/compartilhado/        código usado pela API e pelos fronts (ESM, compilado com tsc)
  src/enums.ts                 enums do banco como listas `as const` + tipos
  src/calculo.ts               totais, desconto e condições de pagamento; calcularCartao
  src/taxasCartao.ts           EDITÁVEL: tabela de taxas do Mercado Pago (débito, 1x a 18x) e a
                               data da última atualização
  src/margemDoOrcamento.ts     EDITÁVEL: MARGEM_PADRAO (margem em reais de todo orçamento novo) e
                               distribuirMargem (preços do PDF detalhado)
  src/dias.ts                  dias como texto AAAA-MM-DD (somar, nome do dia, semana...)
  src/datas.ts                 fuso da empresa: diaDeHoje, formatarData/Hora/DataHora, tempoDesde
packages/web/                  código de NAVEGADOR usado pelos dois fronts (só fonte, sem build:
                               o Vite de cada app compila e o `tsc -b` de cada app confere)
  src/api.ts                   cliente HTTP: token no cabeçalho (chave própria de cada app),
                               JSON ou FormData, ErroApi, 401 encerra a sessão; ouvirDemora
                               avisa quando um GET ou o login passa de 4 s (servidor acordando)
  src/AvisoServidorAcordando.tsx  "Conectando ao sistema…" enquanto a Render acorda (30–60 s)
  src/sessao.tsx               usuário logado, entrar(), sair(), aviso de sessão expirada e
                               papeisAceitos (o app do técnico só aceita TECNICO)
  src/tema.css                 cores e fontes da marca como variáveis do shadcn; `@source './'`
                               faz o Tailwind de cada app gerar as classes escritas no pacote
  src/tiposServico.ts          cores dos tipos de serviço (agenda do escritório e do técnico)
  src/SituacaoServico.tsx      situação do serviço IGUAL em todas as telas (bolinha + texto; "Refazer
                               fotos" vira selo laranja). O selo preenchido é só do TIPO de serviço
  src/FormularioTrocaSenha.tsx troca da própria senha (escritório /conta/senha, técnico /senha);
                               a RotaProtegida leva quem tem senha temporária direto para ela
  src/ImagemProtegida.tsx      <img> de foto de serviço: busca com o token no cabeçalho (o navegador
                               não manda token em <img src>) e exibe; use com urlDaFoto(id)
Dockerfile, render.yaml        produção na Render, plano gratuito (README, "Publicar em produção");
                               a Render compila a imagem. Publicação só pelo Actions (autoDeploy off)
.github/workflows/             verificação (build a cada push), publicar (manual: migrations, deploy
                               hook da Render, confere versão e producao:true no /saude), backup do
                               banco (diário 14 dias, mensal 90) e restaurar backup (teste mensal
                               num banco descartável; emergência só em banco vazio)
```

O que depende de navegador ou React (fetch, localStorage, componentes, CSS) vai em
`packages/web`, nunca em `packages/compartilhado`: a API também carrega o `compartilhado`.

Ao mudar um enum no `schema.prisma`, atualize também `packages/compartilhado/src/enums.ts`;
o build da API acusa a divergência. A API é CommonJS e carrega o pacote (ESM) com o
`require()` de ESM do Node, por isso o projeto exige Node 22.12 ou mais recente.

O `.env` da API fica em `apps/api/.env`.

## Regras de negócio que não podem ser quebradas

1. **Quem calcula é o servidor.** O front envia itens, desconto e condição de pagamento;
   a API recalcula tudo com `calcularOrcamento` (`packages/compartilhado/src/calculo.ts`) e grava.
   Nunca aceitar total vindo do front. O front usa a mesma função só para a prévia em tela.
   **Cartão (Entrada + cartão):** a entrada é Pix ou transferência, sem taxa; só o saldo vai ao
   cartão, com a taxa da operadora (MDR) REPASSADA: cobrado = saldo ÷ (1 − taxa), arredondado
   para cima (nunca saldo × (1 + taxa)). Parcelas em centavos inteiros; a 1ª leva a sobra e a soma
   fecha com o cobrado. `valorTotal` = o que a Guarusolar recebe (indicadores, lista, pipeline);
   `valorTotalCliente` = o que o cliente paga (PDF e WhatsApp, sem linha de "taxa"). A taxa usada
   fica GRAVADA (`taxaCartaoPct`): renegociar a tabela não muda proposta salva. "Absorver a taxa"
   (negociação) cobra o saldo e grava em `valorTaxaAbsorvida` quanto a empresa deixa de receber.
   **Margem do orçamento:** a Guarusolar aplica uma margem de lucro em REAIS por proposta (não um
   percentual por item; na planilha antiga era o "material" MARGEM ALEATORIA). Ordem do cálculo:
   itens + margem = `subtotal` -> desconto geral -> desconto à vista -> total -> entrada e cartão.
   A margem entra ANTES do desconto (decisão): o cliente não a vê, e "10% de desconto" tem de ser
   10% do preço que ele vê; a tela avisa, sem bloquear, quando o desconto passa da margem.
   **O cliente NUNCA vê a margem**: nem linha no PDF, nem no WhatsApp. Com "detalhar preços", o PDF
   distribui a margem nos preços dos itens (`distribuirMargem`, centavos inteiros: a soma das
   linhas fecha com o subtotal); os preços gravados nos itens não mudam. Fica GRAVADA em
   `Orcamento.margem`; orçamento anterior ao campo tem zero e abre com zero (não com o padrão).
2. **Item do orçamento é cópia.** `descricao`, `unidade`, `precoUnitario` e `precoTabela` ficam
   gravados no item (e também a `descricaoTecnica`, que sai no PDF). Mudança futura no catálogo
   não altera orçamento antigo. Na edição (PUT),
   itens que já estavam no orçamento mantêm a cópia gravada; só itens novos copiam o catálogo.
   **Os dados do cliente também são cópia** (`clienteNome`, `clienteDocumento`, `clienteWhatsapp`,
   `clienteEmail`, endereço e `clienteCopiadoEm` no orçamento): o PDF e o texto do WhatsApp usam a
   cópia, e editar o cadastro não muda proposta salva. A cópia é feita ao criar, ao trocar de
   cliente e quando o vendedor pede "Usar dados atuais do cadastro" (`atualizarDadosCliente`); a
   tela avisa quando o cadastro diverge da cópia. O `clienteId` continua para a ficha, listas e
   relatórios (que mostram o cadastro atual), e o WhatsApp é enviado ao número ATUAL do cadastro.
   Cópia nula (orçamento criado pela versão anterior numa publicação): o documento usa o cadastro.
3. **Nada é apagado.** Cliente e produto são desativados (`ativo = false`).
4. **Aprovar orçamento cria o projeto** automaticamente, com status `AGUARDANDO_AGENDAMENTO`.
5. **Status seguem transições válidas** (mapa `TRANSICOES_STATUS` em
   `packages/compartilhado/src/status.ts`, usado pela API e pelo menu de status da lista).
   Orçamento `APROVADO` não pode ser editado.
6. **Técnico só acessa os serviços em que está ESCALADO** (tabela `EscalaServico`), validado no
   servidor, nunca apenas escondendo botões na interface. Vale também para as fotos
   (`lib/acesso.ts`). A equipe (`Usuario.equipeId`) é só a COMPOSIÇÃO PADRÃO e a linha da agenda:
   o serviço nasce com os técnicos ativos da equipe e o gestor troca quem vai, por serviço (a
   escala vale para o serviço inteiro, mesmo de vários dias). É cópia: mudar a equipe padrão de
   alguém não mexe em serviço já agendado. Sair da escala tira o acesso na hora, inclusive às
   fotos. A escala só muda com o serviço em aberto; depois fica como registro de quem foi, e cada
   troca entra no histórico do projeto. Serviço sem ninguém escalado é permitido (o gestor marca
   a data antes de definir quem vai) e aparece com o aviso "Sem técnico escalado". O "técnico
   responsável" não é mais usado (a coluna continua); mostra-se a escala e `enviadoPor`.
   **Fotos de serviço nunca têm link público**: só saem por `GET /api/fotos/:id`, com login
   e conferência de papel e equipe a cada pedido. Nada de `express.static` para arquivos de
   cliente. Única exceção proposital de conteúdo sem login: o PDF do orçamento, pelo `tokenPdf`.
7. **Concluir serviço exige o checklist completo** de fotos obrigatórias e a confirmação do
   teste do sistema. O checklist fica na tabela `ChecklistFoto`, editável por tipo de serviço.
   Fotos e envio para validação só com o serviço em aberto (agendado, em execução ou
   devolvido): `conferirServicoAberto` em `apps/api/src/rotas/operacao.ts`. Aprovar e devolver
   (gestor) só com o serviço aguardando validação ou devolvido: `servicoEmValidacao`. Devolver
   põe o projeto de volta em `EM_EXECUCAO`; aprovar conclui o projeto e marca todas as fotos OK
   (foto ainda marcada para refazer exige `confirmarFotosMarcadas`).
8. **Conflito de agenda AVISA, não bloqueia** (decisão da Guarusolar; antes bloqueava por
   equipe). A agenda trabalha com dias inteiros e uma visita técnica dura cerca de uma hora: a
   mesma dupla faz duas ou três no mesmo dia. `avisosDeConflito` (operacao.ts) diz onde a equipe
   e cada pessoa escalada já estão, com projeto e cliente; vem em `GET /api/agenda/conflitos` e
   na resposta de agendar e remarcar. Serviços cancelados não contam. Não reintroduza bloqueio.
   Cancelar um serviço devolve o projeto para `AGUARDANDO_AGENDAMENTO`.

## Convenções de código

- Código, nomes de variáveis, rotas, mensagens de erro e comentários **em português**.
- Enums e valores do banco em MAIÚSCULAS com underscore: `EM_NEGOCIACAO`, `PAINEL_SOLAR`.
- Validação de entrada sempre com **Zod**, no início da rota. As mensagens padrão já saem em
  português (`apps/api/src/lib/zod-pt.ts`); passe mensagem própria só quando a padrão não
  explicar o problema ao usuário (ex.: `.min(3, 'Informe o nome completo')`).
- Rotas assíncronas envolvidas no helper `rota()`; erros de regra com `new ErroHttp(status, msg)`.
- Dinheiro em `Decimal(12,2)` no banco e arredondado para centavos no cálculo.
- Documento e WhatsApp gravados **somente com dígitos**; a formatação é responsabilidade do front.
- Tabelas largas rolam dentro do próprio quadro (`relative overflow-x-auto`), nunca a página.
  O `relative` é obrigatório: sem ele, textos `sr-only` (absolutos) esticam a página.
- Mensagens de erro escritas para o usuário final, não para o desenvolvedor.
  Bom: "Faltam 2 fotos obrigatórias: Aterramento, Medidor".

## Identidade visual (aprovada pelo cliente)

Cores da marca: **azul, laranja e branco**.

| Uso | Cor |
| --- | --- |
| Azul escuro (menu, blocos de destaque) | `#0B2F5E` |
| Azul de ação (botões primários, links) | `#1257A6` |
| Laranja de destaque (logo, alertas, ênfase) | `#EE7C12` / `#F79433` |
| Fundo da aplicação | `#F4F6FA` |
| Cartões | `#FFFFFF`, borda `#D9E0EA` |
| Texto principal / secundário | `#10243D` / `#5A6675` |

**Laranja só em ícones, bordas, selos e no logo — nunca como fundo com texto branco**
(contraste de ~2,8:1, abaixo do mínimo de 4,5:1). Selo laranja = borda laranja, fundo
`destaque-suave` e texto `destaque-texto` (componente `Selo`). Botões usam o azul de ação.
**Única exceção aprovada:** o laranja escuro **`#C14D10`** pode ser fundo de texto branco
(4,84:1). Hoje é o bloco do valor total na proposta em PDF (`COR.laranjaFundo`); use esse tom,
e não o laranja da marca, se outro lugar precisar de laranja com texto branco.

Verde e vermelho ficam reservados para "Aprovado" e "Recusado". Tipografia do protótipo:
Bricolage Grotesque nos títulos, IBM Plex Sans no texto, IBM Plex Mono em códigos e valores.

**Pendências com o cliente:** códigos hexadecimais oficiais da marca e o arquivo do logo
(hoje há um ícone de sol provisório; no app do técnico, troque `apps/tecnico/icones/app.svg` e
rode `npm run icones -w @guarusolar/tecnico`).

## Design de referência

O protótipo navegável de todas as telas está em:
https://claude.ai/artifact/NLBwCgGbifMkGj4AVuHnLW

Telas desenhadas: painel de orçamentos com indicadores, pipeline Kanban, gerador de orçamento,
cadastro rápido de cliente, catálogo de itens, PDF do orçamento (A4), envio por WhatsApp,
app do técnico (celular), validação do serviço (gestor) e agenda das equipes.

## Estado atual

Pronto: schema do Prisma, seed e API completa (auth, clientes, produtos, orçamentos com
status e WhatsApp, agenda, validação e rotas do técnico). Monorepo com o pacote compartilhado.
Base do front do escritório: tema, cliente HTTP, sessão, login e rotas protegidas por papel.
Orçamentos no escritório: lista com indicadores e mudança de status, gerador para criar e
editar (cliente, itens, condições, salvar, WhatsApp) e modo leitura para aprovados.
Pipeline, clientes e catálogo prontos. Operação: agenda das equipes (semana; as visões
Dia e Mês aparecem desativadas), validação dos serviços pelo gestor e projetos (lista e ficha
da obra, com histórico).
App do técnico (`apps/tecnico`, PWA): login só para TECNICO, agenda, serviço com checklist de
fotos (câmera, redução no aparelho, data e local), observações, teste e envio para validação;
fila offline das fotos, abre sem sinal, versão nova com "Atualizar", instalação na tela
inicial. Testado no Chrome do computador; **falta o teste num celular de verdade**, que
precisa de HTTPS (câmera, localização e service worker não funcionam por IP da rede local) —
o usuário combina com o Gustavo como expor o ambiente.

Próximos passos, nesta ordem:

1. ~~Front do escritório: **gerador de orçamentos**~~ (feito).
2. ~~Demais telas do escritório: lista, pipeline, catálogo, clientes~~ (feito, e também agenda,
   validação e projetos).
3. ~~Geração do **PDF** do orçamento~~ (feito; falta o arquivo do logo e os dados da empresa).
4. ~~**PWA dos técnicos**: câmera, checklist de fotos e fila de envio offline~~ (feito; falta o
   teste no celular com HTTPS).
5. ~~Trocar `armazenamento.ts` para o **OneDrive/SharePoint** via Microsoft Graph~~ (feito e testado
   contra um simulador do Graph; falta o administrador criar o aplicativo e rodar
   `npm run sharepoint:conferir` com as credenciais reais).
6. ~~Atualização em **tempo real** da fila de validação~~ (feito: versão da operação a cada 20 s).
7. Comparativo **orçado × realizado** por projeto.

(O executável do escritório saiu dos próximos passos: o sistema fica só na web. Ver "Quem usa".)

Melhoria futura (pedida para quando a Guarusolar quiser mudar sozinha): **tela de configurações
para o ADMIN**, com a margem padrão (hoje `MARGEM_PADRAO` em `margemDoOrcamento.ts`) e a tabela de
taxas do cartão guardadas no banco, sem depender de publicação.

## Dívida técnica (resolver antes da produção)

- **`TRUST_PROXY` na Render** (começa em 1 no `render.yaml`). Atrás de proxy, sem `TRUST_PROXY` =
  número de proxies, todos os usuários chegam com o IP do proxy e o limite por IP do login valeria
  para a empresa inteira. Conferir no primeiro deploy (o log `login_falhou` mostra a `origem`).
- **`STORAGE_PUBLIC_URL` não é mais usada** (as fotos saem pela rota autenticada). Se ainda
  estiver no `.env` de alguém, pode ser apagada; não tem efeito.
- **Arquivos órfãos (só no disco).** Foto refeita já vai para "Substituídas/". Resta: quando a mesma foto chega duas vezes ao mesmo tempo
  (a fila reenviou antes da resposta), as duas requisições gravam o arquivo antes de a chave
  única do `idLocal` barrar a segunda: a resposta é certa (200 com a foto existente), mas o
  segundo arquivo fica sem registro no disco. No SharePoint não acontece: o mesmo nome
  substitui o arquivo. Raro e só em desenvolvimento; e há 18 arquivos assim em uploads/ dos testes.

## Comandos

Todos a partir da raiz do repositório:

```bash
npm install                                  # instala todos os workspaces
cp apps/api/.env.example apps/api/.env       # ajustar DATABASE_URL, DIRECT_URL e JWT_SECRET
npm run db:migrate:deploy  # aplica as migrations que existem (não pergunta nada, não apaga dados)
npm run db:migrate       # só para CRIAR migration (migrate dev: pode propor reiniciar o banco)
npm run db:seed          # base (catálogo, equipes, checklist) + usuários de teste
npm run db:seed:base     # só a base (produção)
npm run usuario -- listar  # usuários reais: criar | nova-senha | desativar | listar
npm run db:marcar-producao # uma vez, no banco de produção
npm run db:diagnostico   # de onde vem a DATABASE_URL (janela ou .env), formato e se conecta; sem mostrar segredo
npm run dev:api          # API em http://localhost:3333
npm run dev:escritorio   # front em http://localhost:5173 (repassa /api para a API)
npm run dev:tecnico      # app do técnico em http://localhost:5174 (idem; sem service worker)
npm run preview:tecnico  # build do técnico com service worker em http://localhost:5175
npm run db:studio        # inspecionar o banco
npm run db:limpar        # APAGA clientes, orçamentos, projetos etc. e zera os códigos;
                         # mantém usuários, equipes, checklist e catálogo. Pede LIMPAR;
                         # recusa em produção. Nunca rode por conta própria: quem roda é o usuário.
npm run db:zerar-para-entrega -- --admin email  # zera os dados de TESTE, inclusive em PRODUÇÃO, e
                         # deixa só esse ADMIN. Nunca rode por conta própria: quem roda é o usuário.
npm run build            # compila todos os workspaces
npm run sharepoint:conferir  # testa a configuração MS_* do SharePoint (envio e leitura reais)
```

Banco local rápido: `docker run --name guarusolar-db -e POSTGRES_PASSWORD=senha -p 5432:5432 -d postgres:16`

Usuários do seed (senha `guarusolar123`): `admin@`, `comercial@`, `gestor@`,
`tecnico.a@guarusolar.com.br`.

## Como trabalhar comigo neste projeto

- Antes de criar arquivo novo, verifique se já existe algo parecido em `apps/api/src/lib` ou
  `apps/api/src/rotas`.
- Ao mudar o schema, gere a migration (`npm run db:migrate`) e atualize o seed se necessário.
  Sem terminal interativo, o `migrate dev` não roda: gere com `prisma migrate diff
  --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma
  --script` numa pasta `AAAAMMDDHHMMSS_nome` (hora UTC) e aplique com `prisma migrate deploy`.
  Revise o SQL antes de aplicar. Depois de uma aplicação que falhou: `prisma migrate resolve
  --rolled-back <pasta>`.
  **Para APLICAR migrations que já existem use `npm run db:migrate:deploy`** (é o que o Publicar
  roda): não pergunta nada e nunca reinicia o banco. `npm run db:migrate` é o `migrate dev`, só
  para CRIAR migration: ele compara tudo e, se achar divergência ou arquivo de migration
  alterado, propõe REINICIAR o banco (apaga os dados; em 06/10/2026 o banco de desenvolvimento
  foi zerado assim). Nunca edite uma migration já aplicada; `.gitattributes` mantém os `.sql` em
  LF para a assinatura não mudar entre computadores.
  `dbgenerated(...)` tem de ser escrito EXATAMENTE como o Postgres guarda a expressão (veja em
  `information_schema.columns.column_default`), senão o diff repete um `ALTER ... SET DEFAULT`
  para sempre e o `migrate dev` pede nome de migration à toa (era o caso do `tokenPdf`).
  Pare a API antes: no Windows ela trava a DLL do Prisma e o `prisma generate` falha.
- **Parar servidores no Windows:** encerrar só o processo da porta deixa órfãos o `tsx watch` e o
  `npm run` que o iniciaram (acumularam 21 processos e 1 GB numa sessão). Pare pelo processo
  inteiro (Ctrl+C no terminal, ou pela linha de comando do processo), não pela porta.
- **Fotos gravadas no SharePoint (chave "sp:") só abrem com o SharePoint configurado**; numa API
  em modo disco elas respondem 503. O serviço cancelado PRJ-2026-0016 (TESTE SharePoint) tem
  fotos assim, gravadas contra o simulador nos testes.
- Toda rota nova precisa de `autenticar` e `autorizar(...)` com os papéis corretos.
- **Categoria e unidade são enums com ORDEM**: o catálogo lista pela ordem do enum no banco.
  Valor novo: `ALTER TYPE ... ADD VALUE 'X' BEFORE 'Y'` escrito à mão na migration (o diff do
  Prisma põe no fim), e a mesma ordem em `packages/compartilhado/src/enums.ts`.
- **`Produto.codigoFornecedor` é único entre os ATIVOS** por um índice parcial criado à mão
  (`Produto_codigoFornecedor_ativo_key`), que o schema do Prisma não descreve. Se um `migrate diff`
  gerar `DROP INDEX` dele, apague essa linha do SQL. A API confere antes (409 com o nome do item).
- **Migrations em produção funcionam com a versão anterior do código** (publicação sem queda
  roda as duas juntas por um instante; voltar atrás não desfaz o banco): só adições numa
  publicação; renomear/apagar coluna em duas (adiciona e passa a usar; depois remove).
- **Produção sem SharePoint bloqueia o app dos técnicos** (`appTecnicoLiberado` em
  armazenamento.ts): o disco da Render é apagado a cada publicação, reinício e sono (sem disco
  persistente no plano gratuito). Não contorne isso.
- **Sessão confere o banco** (`autenticar` em `lib/auth.ts`): o token leva `versao`
  (`Usuario.sessaoVersao`); desativar, trocar papel ou equipe e gerar senha nova somam 1 e o login
  antigo cai na hora. A conferência fica 1 minuto em memória por usuário (cada ida ao banco custa
  ~120 ms); quem muda usuário chama `esquecerSessao(id)`. Com mais de uma instância da API, a
  mudança feita em outra pode levar até 1 minuto.
- **Busca por palavras** (`lib/busca.ts`, `filtroDeBusca`): toda busca nova usa ela, nunca
  `contains` direto no nome. Produto, Cliente, Orcamento e Projeto têm `textoBusca`, coluna
  GERADA pelo banco (`texto_de_busca`: minúsculas, sem acento, sem pontuação); não escreva nela
  e, se um campo novo precisar ser pesquisável, mude a expressão numa migration (DROP e ADD da
  coluna). Abreviação = palavra do item com 4+ letras que começa a palavra digitada; sem
  dicionário de apelidos (decisão). Código do fornecedor só casa digitado inteiro. Sem índice:
  20 mil itens respondem em 1 a 17 ms; `pg_trgm` quebraria a restauração do backup (no Supabase a
  extensão fica fora do schema `public`).
- **Toda mudança na obra grava um `EventoProjeto`** (`registrarEvento` em `lib/eventosProjeto.ts`)
  na MESMA transação: aprovação, agendar/remarcar/cancelar serviço, primeira foto, envio,
  aprovar/devolver, editar e cancelar o projeto. Rota nova que mude projeto ou agendamento também
  registra. Eventos `reconstruido` vieram da migration (datas que existiam antes da tabela).
- **Criar orçamento é idempotente** (`idCriacao`, UUID gerado pelo gerador ao abrir "novo"): se a
  resposta do POST se perder e o vendedor salvar de novo, a API acha o mesmo `idCriacao` e atualiza
  aquele orçamento (200) em vez de criar outro. Formulário novo de criação = UUID novo.
- **Fila de validação quase em tempo real** (`app/AcompanhamentoOperacao.tsx`, só GESTOR/ADMIN):
  pergunta `GET /api/validacao/versao` a cada 20 s (também com a aba em segundo plano) e, quando a
  versão muda, recarrega validação, agenda e projetos; título da aba "(2) …" e aviso de chegada
  sem som, uma vez por envio, fora da tela de Validação. Para após 30 min sem uso do sistema.
  A versão fica em MEMÓRIA na API (`lib/versaoDaOperacao.ts`): rota nova que mude agendamento,
  validação ou crie projeto chama `operacaoMudou()` depois de gravar. Decisão: nada de Supabase
  Realtime (o navegador falaria direto com o banco, furando a regra de que só a API fala com ele)
  nem WebSocket (cai a cada publicação e sono da Render; o polling seria a reserva de qualquer jeito).
  Com mais de uma instância da API, a versão precisa ir para o banco.
- **Custo do produto é opcional** (`Produto.precoCusto` pode ser null): em branco = custo
  desconhecido, e a margem do item volta null (o catálogo mostra "—", nunca 100%); zero = custo
  zero de verdade (100%). `calcularMargem` trata os dois casos. O catálogo real da Guarusolar só
  tem preço de venda; o lucro é a margem em reais de cada orçamento (regra 1).
- **Qual banco um comando usa:** todos os scripts e a API fazem `import 'dotenv/config'` +
  `new PrismaClient()` (lê `DATABASE_URL`); a variável definida na JANELA vence o `apps/api/.env`
  (o dotenv não sobrescreve), também passando pelo npm workspaces. Só o `prisma migrate deploy`
  usa a `DIRECT_URL`. Na mensagem "Authentication failed ... credentials for `X`", o `X` é o nome
  que o SERVIDOR devolve, não prova de que outra string foi usada: é senha recusada. Em dúvida,
  `npm run db:diagnostico` na mesma janela. No PowerShell, definir a string com aspas SIMPLES
  (aspas duplas interpretam `$` e crase da senha).
- **Poucas idas ao banco por pedido.** Produção roda na Render (Virginia) e cada ida ao banco
  pode custar ~120 ms (banco em SP). Prefira uma consulta com `include`/`select` a várias em
  sequência; consultas independentes em `Promise.all` ou `$transaction([...])`.
- **Não crie "ping" para manter a Render acordada** (contraria o plano gratuito).
- Ao terminar uma etapa, rode `npm run build` para garantir que o TypeScript compila.
- Mudanças em regra de negócio: atualize também este arquivo e o `README.md`.
