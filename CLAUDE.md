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
| `COMERCIAL` | executável no PC do escritório | clientes, catálogo, orçamentos, PDF, WhatsApp |
| `GESTOR` | executável no PC do escritório | agenda das equipes, validação das fotos, projetos |
| `TECNICO` | navegador do próprio celular (PWA, sem instalar) | **somente** a agenda dele e o envio de fotos |
| `ADMIN` | ambos | tudo |

Decisão fechada com o cliente: **escritório usa executável** (Electron ou Tauri empacotando o
front React) e **técnicos usam o site no celular**, porque usam aparelhos próprios e não devem
instalar nada. Os dois falam com a **mesma API e o mesmo banco**.

## Stack

- **Banco:** PostgreSQL + Prisma
- **API:** Node.js + TypeScript + Express + Zod (`apps/api`)
- **Front:** React + Vite + Tailwind CSS + shadcn/ui
- **Auth:** JWT com papéis
- **Arquivos (fotos e PDFs):** hoje em disco local; em produção no **OneDrive/SharePoint do cliente**
  via Microsoft Graph, aproveitando o plano Microsoft 365 que ele já paga
- **Hospedagem pretendida:** custo zero enquanto der (plano gratuito de Postgres gerenciado),
  com backup automático do banco para o OneDrive do cliente

## Estrutura

Monorepo com npm workspaces. Instale e rode os comandos sempre a partir da raiz.

```
package.json                   workspaces e atalhos (build, dev:api, db:*)
apps/api/                      API (Express + Prisma)
  prisma/schema.prisma         tabelas (clientes, produtos, orçamentos, itens, projetos,
                               equipes, agendamentos, checklist de fotos, fotos, materiais)
  prisma/seed.ts               catálogo inicial, equipes, checklist e usuários de teste
  prisma/limpar.ts             apaga os dados de operação (npm run db:limpar)
  src/server.ts                sobe a API e monta as rotas
  src/lib/auth.ts              JWT, hash de senha, middleware autenticar/autorizar
  src/lib/conferencia-enums.ts falha o build se os enums do Prisma e do pacote divergirem
  src/lib/codigos.ts           GS-2026-0148 (orçamento) e PRJ-2026-0146 (projeto); contador
                               atômico por ano na tabela SequenciaCodigo (nunca contar linhas)
  src/lib/armazenamento.ts     camada de arquivos — trocar por OneDrive sem mexer no resto
  src/lib/erros.ts             ErroHttp, wrapper de rota async, tratador central
  src/lib/upload.ts            limite de tamanho das fotos (usado no multer e na mensagem)
  src/lib/zod-pt.ts            mensagens padrão do Zod em português (importado no server.ts)
  src/lib/pdf-orcamento.ts     PDF A4 do orçamento (pdfmake), só com dados gravados; fontes em
                               WOFF (WOFF2 e IBM Plex Mono quebram o subset do pdfkit)
  src/rotas/orcamentoPdf.ts    GET /api/orcamentos/:id/pdf?token= — público, protegido pelo tokenPdf
  src/rotas/                   auth, clientes, produtos, orcamentos, operacao (agenda,
                               validação e técnico)
apps/escritorio/               front do escritório (Vite + React + Tailwind v4 + shadcn/ui)
  src/estilos/tema.css         importa o Tailwind e o tema de packages/web
  src/main.tsx                 configurarApi({ chaveToken }) antes de renderizar
  src/lib/consultas.ts         React Query com aviso global de erro (toast)
  src/app/rotas.tsx            roteador de dados (createBrowserRouter, necessário para o
                               useBlocker); cada tela fica dentro de <RotaProtegida papeis={...}>
  src/paginas/orcamentos/      lista (/orcamentos: indicadores, filtros, status em 1 clique)
                               e gerador (/orcamentos/:id, com "novo" para criar): prévia com
                               calcularOrcamento, salvar via POST/PUT, WhatsApp; APROVADO
                               abre só para leitura
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
                               remarcar e cancelar. Datas como texto AAAA-MM-DD (datas.ts);
                               serviço de N dias pula o domingo (fimDoServico). A duração não
                               existe na API: o front pergunta os dias e manda dataFim
  src/components/CampoBusca    autocomplete acessível (combobox ARIA), usado nas buscas
  src/app/menu.ts              itens do menu, os papéis de cada um e o grupo (Comercial ou
                               Operação)
  src/app/permissoes.ts        papéis do escritório e podeAcessar() (ADMIN acessa tudo)
  src/components/ui/           gerados pelo shadcn (npx shadcn@latest add ... --cwd apps/escritorio).
                               ATENÇÃO: o CLI instala um pacote npm "cn" e importa `from "cn"`;
                               depois de cada add, desinstale o "cn" e troque o import por
                               `from "@/lib/utils"`
  src/paginas/                 Login, Inicio, SemAcesso
packages/compartilhado/        código usado pela API e pelos fronts (ESM, compilado com tsc)
  src/enums.ts                 enums do banco como listas `as const` + tipos
  src/calculo.ts               totais, desconto e condições de pagamento
packages/web/                  código de NAVEGADOR usado pelos dois fronts (só fonte, sem build:
                               o Vite de cada app compila e o `tsc -b` de cada app confere)
  src/api.ts                   cliente HTTP: token no cabeçalho (chave própria de cada app),
                               JSON ou FormData, ErroApi, 401 encerra a sessão
  src/sessao.tsx               usuário logado, entrar(), sair(), aviso de sessão expirada e
                               papeisAceitos (o app do técnico só aceita TECNICO)
  src/tema.css                 cores e fontes da marca como variáveis do shadcn
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
2. **Item do orçamento é cópia.** `descricao`, `unidade`, `precoUnitario` e `precoTabela` ficam
   gravados no item (e também a `descricaoTecnica`, que sai no PDF). Mudança futura no catálogo
   não altera orçamento antigo. Na edição (PUT),
   itens que já estavam no orçamento mantêm a cópia gravada; só itens novos copiam o catálogo.
3. **Nada é apagado.** Cliente e produto são desativados (`ativo = false`).
4. **Aprovar orçamento cria o projeto** automaticamente, com status `AGUARDANDO_AGENDAMENTO`.
5. **Status seguem transições válidas** (mapa `TRANSICOES_STATUS` em
   `packages/compartilhado/src/status.ts`, usado pela API e pelo menu de status da lista).
   Orçamento `APROVADO` não pode ser editado.
6. **Técnico só acessa os serviços da própria equipe**, validado no servidor, nunca apenas
   escondendo botões na interface.
7. **Concluir serviço exige o checklist completo** de fotos obrigatórias e a confirmação do
   teste do sistema. O checklist fica na tabela `ChecklistFoto`, editável por tipo de serviço.
8. **Uma equipe não pode ter dois serviços no mesmo período** (validação em `POST /api/agenda`
   e ao remarcar em `PATCH /api/agenda/:id`; serviços cancelados não contam). Cancelar um
   serviço devolve o projeto para `AGUARDANDO_AGENDAMENTO`.

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

Verde e vermelho ficam reservados para "Aprovado" e "Recusado". Tipografia do protótipo:
Bricolage Grotesque nos títulos, IBM Plex Sans no texto, IBM Plex Mono em códigos e valores.

**Pendências com o cliente:** códigos hexadecimais oficiais da marca e o arquivo do logo
(hoje há um ícone de sol provisório).

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
Pipeline, clientes e catálogo prontos. Operação: agenda das equipes (semana); as visões
Dia e Mês aparecem desativadas.

Próximos passos, nesta ordem:

1. Front do escritório: **gerador de orçamentos** primeiro (tela que mais economiza tempo do
   vendedor: autocomplete de itens, ajuste de quantidade e preço, desconto, condições de
   pagamento e total em tempo real).
2. Demais telas do escritório: lista, pipeline, catálogo, clientes.
3. ~~Geração do **PDF** do orçamento~~ (feito; falta o arquivo do logo e os dados da empresa).
4. **PWA dos técnicos**: câmera, checklist de fotos e fila de envio offline.
5. Empacotar o front do escritório como **executável Windows**.
6. Trocar `armazenamento.ts` para o **OneDrive/SharePoint** via Microsoft Graph.
7. Atualização em **tempo real** da fila de validação.
8. Comparativo **orçado × realizado** por projeto.

## Dívida técnica (resolver antes da produção)

- **Fotos servidas sem autenticação.** `/arquivos` (`express.static` em `apps/api/src/server.ts`)
  entrega qualquer foto a quem tiver o link, sem login: são fotos da casa do cliente, com
  localização. Antes de produção, servir as fotos por rota autenticada (ou link temporário
  assinado) — naturalmente junto com a troca do `armazenamento.ts` para o OneDrive/SharePoint.

## Comandos

Todos a partir da raiz do repositório:

```bash
npm install                                  # instala todos os workspaces
cp apps/api/.env.example apps/api/.env       # ajustar DATABASE_URL, DIRECT_URL e JWT_SECRET
npm run db:migrate       # cria as tabelas
npm run db:seed          # catálogo, equipes, checklist e usuários de teste
npm run dev:api          # API em http://localhost:3333
npm run dev:escritorio   # front em http://localhost:5173 (repassa /api para a API)
npm run db:studio        # inspecionar o banco
npm run db:limpar        # APAGA clientes, orçamentos, projetos etc. e zera os códigos;
                         # mantém usuários, equipes, checklist e catálogo. Pede LIMPAR;
                         # recusa em produção. Nunca rode por conta própria: quem roda é o usuário.
npm run build            # compila todos os workspaces
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
  Revise o SQL antes de aplicar. O diff sempre repete um `ALTER ... "tokenPdf" SET DEFAULT`
  com a mesma expressão (falso positivo do Prisma com `dbgenerated`): é inofensivo.
  Pare a API antes: no Windows ela trava a DLL do Prisma e o `prisma generate` falha.
- Toda rota nova precisa de `autenticar` e `autorizar(...)` com os papéis corretos.
- Ao terminar uma etapa, rode `npm run build` para garantir que o TypeScript compila.
- Mudanças em regra de negócio: atualize também este arquivo e o `README.md`.
