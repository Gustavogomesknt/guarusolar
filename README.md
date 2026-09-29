# Guarusolar — Sistema de gestão

Monorepo (npm workspaces) com o backend em Node.js + TypeScript + PostgreSQL (Prisma),
em `apps/api`, que atende os dois aplicativos:

- **Escritório (executável Windows)** — comercial, catálogo, orçamentos, agenda e validação.
- **Técnicos (site no celular, sem instalar nada)** — apenas a própria agenda e o envio das fotos.

Os dois falam com **a mesma API e o mesmo banco**, e é isso que faz o serviço concluído na rua
aparecer no escritório em seguida.

## Como rodar

Requer Node.js 22.12 ou mais recente. Todos os comandos rodam a partir da raiz:

```bash
npm install                                # instala todos os workspaces
cp apps/api/.env.example apps/api/.env     # ajuste DATABASE_URL, DIRECT_URL e JWT_SECRET
npm run db:migrate                         # cria as tabelas
npm run db:seed                            # catálogo, equipes, checklist e usuários de teste
npm run dev:api                            # http://localhost:3333
npm run db:limpar                          # apaga os dados de teste (pede para digitar LIMPAR)
npm run dev:escritorio                     # front do escritório em http://localhost:5173
```

Com a API e o front rodando, abra http://localhost:5173 e entre com um usuário do seed.
No desenvolvimento, o Vite repassa `/api` para a API, então não é preciso configurar CORS.

Usuários criados pelo seed (senha `guarusolar123`): `admin@`, `comercial@`, `gestor@` e
`tecnico.a@guarusolar.com.br`.

Para testar sem instalar o PostgreSQL:

```bash
docker run --name guarusolar-db -e POSTGRES_PASSWORD=senha -p 5432:5432 -d postgres:16
```

## Estrutura

```
apps/api/
  prisma/schema.prisma      tabelas do banco
  prisma/seed.ts            dados iniciais
  src/server.ts             sobe a API e monta as rotas
  src/lib/auth.ts           login por JWT e controle de papéis
  src/lib/codigos.ts        GS-2026-0148 / PRJ-2026-0146
  src/lib/armazenamento.ts  fotos e PDFs (hoje disco, depois OneDrive)
  src/rotas/                clientes, produtos, orçamentos, agenda, validação, técnico
apps/escritorio/            front do escritório (Vite + React + Tailwind v4 + shadcn/ui)
  src/lib/api.ts            cliente HTTP com token e tratamento central de erro
  src/lib/sessao.tsx        login, saída e sessão expirada
  src/app/                  rotas protegidas por papel, menu e layout
  src/paginas/              telas (por enquanto: login e início)
packages/compartilhado/
  src/enums.ts              enums do banco, usados pelos fronts sem depender do Prisma
  src/calculo.ts            regra de totais, desconto e parcelamento
```

## Rotas principais

| Método | Rota | Quem acessa | Para quê |
| --- | --- | --- | --- |
| POST | `/api/auth/login` | todos | login, devolve o token |
| GET | `/api/clientes?q=&incluirInativos=&limite=` | comercial | busca (nome, CPF/CNPJ, WhatsApp) e lista |
| GET | `/api/clientes/:id` | comercial | ficha com os orçamentos do cliente |
| POST/PUT | `/api/clientes` | comercial | cadastro e edição (mesmo formulário) |
| PATCH | `/api/clientes/:id/ativo` | comercial | desativar/reativar (nada é apagado) |
| GET | `/api/produtos?q=` | comercial | autocomplete do catálogo |
| POST/PUT | `/api/produtos` | comercial | CRUD do catálogo |
| PATCH | `/api/produtos/:id/ativo` | comercial | ativar/desativar item |
| GET | `/api/orcamentos` | comercial | lista com filtros |
| GET | `/api/orcamentos/resumo` | comercial | indicadores do mês |
| POST/PUT | `/api/orcamentos` | comercial | criar/editar (totais no servidor) |
| PATCH | `/api/orcamentos/:id/status` | comercial | mudança em 1 clique |
| POST | `/api/orcamentos/:id/whatsapp` | comercial | mensagem pronta + link `wa.me`; rascunho passa a ENVIADO |
| GET | `/api/agenda?inicio&fim` | gestor | semana por equipe |
| GET | `/api/agenda/pendentes` | gestor | lista "A agendar" |
| POST | `/api/agenda` | gestor | agendar serviço (409 se a equipe já tem serviço no período) |
| PATCH | `/api/agenda/:id` | gestor | remarcar (equipe e datas) ou cancelar (`status: CANCELADO`) |
| GET | `/api/validacao/fila` | gestor | serviços aguardando validação |
| POST | `/api/validacao/:id/aprovar` | gestor | conclui o serviço |
| POST | `/api/validacao/:id/devolver` | gestor | pede fotos de novo |
| GET | `/api/tecnico/agenda` | técnico | só os serviços dele |
| POST | `/api/tecnico/servicos/:id/fotos` | técnico | envia foto do checklist |
| POST | `/api/tecnico/servicos/:id/concluir` | técnico | envia para validação |

## Decisões importantes

- **Valores calculados no servidor.** O front manda itens e descontos; quem soma é a API.
  Assim ninguém consegue gravar um total diferente do que as regras permitem. A regra fica em
  `packages/compartilhado`, e o front usa a mesma função só para mostrar a prévia em tela.
- **Itens do orçamento são uma cópia.** Nome, unidade e preço ficam gravados no item.
  Mudar o catálogo depois não altera orçamentos antigos.
- **Nada é apagado.** Clientes e produtos são desativados, preservando o histórico.
- **Aprovar orçamento cria o projeto** automaticamente, que entra na fila "A agendar".
- **Checklist de fotos configurável** (tabela `ChecklistFoto`), por tipo de serviço.
  O técnico só consegue concluir com todas as obrigatórias enviadas.
- **Técnico enxerga apenas a própria agenda**, garantido no servidor, não só na tela.
- **Agenda é do gestor.** As rotas `/api/agenda` aceitam só GESTOR (e ADMIN); o comercial
  acompanha pelo status dos orçamentos. Uma equipe não pega dois serviços no mesmo período,
  nem ao agendar nem ao remarcar. Cancelar devolve o projeto para "A agendar".
- **Duração do serviço** é informada ao agendar (padrão: 1 dia). Serviços de vários dias
  pulam o domingo; a grade mostra segunda a sábado.

## App do técnico (PWA)

O técnico usa o próprio celular pelo navegador, muitas vezes com internet móvel fraca.
Por isso o PWA deve **redimensionar cada foto antes do envio**:

- **Lado maior com 2000 px**, mantendo a proporção. Fotos menores seguem como estão.
- **JPEG com qualidade 85.** Uma foto assim costuma ficar entre 400 KB e 1 MB.
- **Manter a data/hora e a localização da captura.** Ao redesenhar a imagem num canvas,
  os metadados EXIF se perdem. Leia-os antes de reduzir e envie-os nos campos
  `capturadaEm`, `latitude` e `longitude` da rota `POST /api/tecnico/servicos/:id/fotos`.

A API aceita apenas `image/jpeg`, `image/png` e `image/webp`, até 15 MB, no campo `arquivo`.
Uma foto maior é recusada com status 413, e um formato diferente com status 400, os dois com
mensagem pronta para mostrar ao técnico.

## Limpar os dados de teste

`npm run db:limpar` apaga, **sem possibilidade de recuperar**, clientes, orçamentos (com itens
e histórico), projetos, agendamentos, fotos e materiais, e zera a numeração dos códigos: o
próximo orçamento volta a ser `GS-<ano>-0001` e o próximo projeto `PRJ-<ano>-0001`.
Usuários, equipes, checklist de fotos e o catálogo de produtos ficam como estão.

Antes de apagar, o script mostra em qual banco vai rodar e quanto existe em cada tabela, e só
continua se alguém digitar `LIMPAR`. Com `NODE_ENV=production`, ele se recusa a rodar. Tudo é
apagado numa transação só: se algo falhar, nada é apagado. Arquivos de fotos já enviados à
pasta de armazenamento não são removidos.

## Hospedagem

- **Node.js 22.12 ou mais recente**, obrigatório (declarado em `engines` em todos os
  `package.json`). A API é CommonJS e carrega o `@guarusolar/compartilhado`, que é ESM, pelo
  `require()` de módulos ESM, que só é estável a partir do Node 22.12. Em versão anterior a API
  nem sobe. Ao escolher o serviço de hospedagem, confira a versão do Node e fixe 22 ou mais nova.
- **Fuso horário:** períodos e datas seguem sempre `America/Sao_Paulo`, calculados em
  `packages/compartilhado/src/datas.ts`, e não o fuso do servidor nem o do computador do
  escritório. Isso vale para os indicadores do mês, o filtro de período da lista, o ano nos
  códigos (GS-2026-0148), a validade padrão e as datas exibidas, no PDF e no WhatsApp. Pode
  hospedar a API em servidor configurado em UTC sem ajustes.
- **Banco:** PostgreSQL gerenciado (plano gratuito do Supabase, Neon ou similar). Use
  `DATABASE_URL` com a conexão pooled e `DIRECT_URL` com a conexão direta, que as migrations
  usam (detalhes em `apps/api/.env.example`).
- **PDF do orçamento:** gerado pela própria API com pdfmake (só JavaScript, sem navegador
  embutido; em teste, o processo ficou abaixo de 160 MB gerando 20 PDFs seguidos). Defina
  `API_URL_PUBLICA` com o endereço público da API: é o link que o cliente recebe pelo WhatsApp
  (`/api/orcamentos/:id/pdf?token=...`), aberto sem login e protegido pelo token do orçamento.
- **Publicar a API:** `npm ci`, `npm run build`, `npx prisma migrate deploy` (em `apps/api`) e
  `npm start -w @guarusolar/api`, com `JWT_SECRET` e as variáveis do banco configuradas.

## Próximos passos

1. Front do escritório (React + Tailwind + shadcn/ui) seguindo o design aprovado.
2. Empacotar o front em executável Windows (Electron ou Tauri).
3. PWA dos técnicos com câmera e fila de envio offline.
4. Geração do PDF do orçamento com o logo da Guarusolar.
5. Trocar `armazenamento.ts` para o OneDrive/SharePoint do cliente (Microsoft Graph).
6. Atualização em tempo real da fila de validação (Supabase Realtime ou WebSocket).
