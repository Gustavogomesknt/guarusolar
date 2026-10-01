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
  src/lib/acesso.ts            regra 6 (técnico só vê a própria equipe) num lugar só:
                               tecnicoPodeVer e filtroDoTecnico
  src/rotas/fotos.ts           GET /api/fotos/:id?tamanho=miniatura — ÚNICA saída das fotos:
                               login sempre; gestor vê todas, técnico só da equipe (outra: 404),
                               comercial não (403). Não existe pasta pública de arquivos
  src/lib/erros.ts             ErroHttp, wrapper de rota async, tratador central
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
                               remarcar e cancelar. Datas como texto AAAA-MM-DD (dias.ts no
                               compartilhado); serviço de N dias pula o domingo (fimDoServico).
                               A duração não existe na API: o front pergunta os dias e manda dataFim
  src/paginas/validacao/       validação (/validacao, só GESTOR): fila à esquerda (aguardando,
                               depois devolvidos; serviço aberto em ?servico=), detalhe com fotos
                               OK/Refazer, foto ampliada (← → navegam, O/R marcam, Esc fecha),
                               motivo, aprovar com confirmação; ao resolver, a fila muda na hora
                               (setQueryData) e o próximo abre. fila.ts fica separado para o
                               contador do menu (app/ContadorValidacao) não puxar a tela
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
  src/components/SeloStatus    status como texto com bolinha (o selo preenchido é do tipo)
packages/compartilhado/        código usado pela API e pelos fronts (ESM, compilado com tsc)
  src/enums.ts                 enums do banco como listas `as const` + tipos
  src/calculo.ts               totais, desconto e condições de pagamento
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
   escondendo botões na interface. Vale também para as fotos (`lib/acesso.ts`).
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
Dia e Mês aparecem desativadas) e validação dos serviços pelo gestor. Falta a tela de projetos.
App do técnico (`apps/tecnico`, PWA): login só para TECNICO, agenda, serviço com checklist de
fotos (câmera, redução no aparelho, data e local), observações, teste e envio para validação;
fila offline das fotos, abre sem sinal, versão nova com "Atualizar", instalação na tela
inicial. Testado no Chrome do computador; **falta o teste num celular de verdade**, que
precisa de HTTPS (câmera, localização e service worker não funcionam por IP da rede local) —
o usuário combina com o Gustavo como expor o ambiente.

Próximos passos, nesta ordem:

1. ~~Front do escritório: **gerador de orçamentos**~~ (feito).
2. ~~Demais telas do escritório: lista, pipeline, catálogo, clientes~~ (feito, e também agenda
   e validação; falta a tela de **projetos** do gestor).
3. ~~Geração do **PDF** do orçamento~~ (feito; falta o arquivo do logo e os dados da empresa).
4. ~~**PWA dos técnicos**: câmera, checklist de fotos e fila de envio offline~~ (feito; falta o
   teste no celular com HTTPS).
5. Empacotar o front do escritório como **executável Windows**.
6. ~~Trocar `armazenamento.ts` para o **OneDrive/SharePoint** via Microsoft Graph~~ (feito e testado
   contra um simulador do Graph; falta o administrador criar o aplicativo e rodar
   `npm run sharepoint:conferir` com as credenciais reais).
7. Atualização em **tempo real** da fila de validação.
8. Comparativo **orçado × realizado** por projeto.

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
npm run db:migrate       # cria as tabelas
npm run db:seed          # base (catálogo, equipes, checklist) + usuários de teste
npm run db:seed:base     # só a base (produção)
npm run usuario -- listar  # usuários reais: criar | nova-senha | desativar | listar
npm run db:marcar-producao # uma vez, no banco de produção
npm run dev:api          # API em http://localhost:3333
npm run dev:escritorio   # front em http://localhost:5173 (repassa /api para a API)
npm run dev:tecnico      # app do técnico em http://localhost:5174 (idem; sem service worker)
npm run preview:tecnico  # build do técnico com service worker em http://localhost:5175
npm run db:studio        # inspecionar o banco
npm run db:limpar        # APAGA clientes, orçamentos, projetos etc. e zera os códigos;
                         # mantém usuários, equipes, checklist e catálogo. Pede LIMPAR;
                         # recusa em produção. Nunca rode por conta própria: quem roda é o usuário.
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
  Revise o SQL antes de aplicar. O diff sempre repete um `ALTER ... "tokenPdf" SET DEFAULT`
  com a mesma expressão (falso positivo do Prisma com `dbgenerated`): é inofensivo.
  Pare a API antes: no Windows ela trava a DLL do Prisma e o `prisma generate` falha.
- **Parar servidores no Windows:** encerrar só o processo da porta deixa órfãos o `tsx watch` e o
  `npm run` que o iniciaram (acumularam 21 processos e 1 GB numa sessão). Pare pelo processo
  inteiro (Ctrl+C no terminal, ou pela linha de comando do processo), não pela porta.
- **Fotos gravadas no SharePoint (chave "sp:") só abrem com o SharePoint configurado**; numa API
  em modo disco elas respondem 503. O serviço cancelado PRJ-2026-0016 (TESTE SharePoint) tem
  fotos assim, gravadas contra o simulador nos testes.
- Toda rota nova precisa de `autenticar` e `autorizar(...)` com os papéis corretos.
- **Migrations em produção funcionam com a versão anterior do código** (publicação sem queda
  roda as duas juntas por um instante; voltar atrás não desfaz o banco): só adições numa
  publicação; renomear/apagar coluna em duas (adiciona e passa a usar; depois remove).
- **Produção sem SharePoint bloqueia o app dos técnicos** (`appTecnicoLiberado` em
  armazenamento.ts): o disco da Render é apagado a cada publicação, reinício e sono (sem disco
  persistente no plano gratuito). Não contorne isso.
- **Poucas idas ao banco por pedido.** Produção roda na Render (Virginia) e cada ida ao banco
  pode custar ~120 ms (banco em SP). Prefira uma consulta com `include`/`select` a várias em
  sequência; consultas independentes em `Promise.all` ou `$transaction([...])`.
- **Não crie "ping" para manter a Render acordada** (contraria o plano gratuito).
- Ao terminar uma etapa, rode `npm run build` para garantir que o TypeScript compila.
- Mudanças em regra de negócio: atualize também este arquivo e o `README.md`.
