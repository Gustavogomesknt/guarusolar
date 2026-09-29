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
npm run dev:tecnico                        # app do técnico em http://localhost:5174
npm run preview:tecnico                    # build do técnico com service worker (5175)
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
apps/tecnico/               app do técnico: PWA aberto no navegador do celular
  src/app/                  rotas protegidas por papel, menu e layout
  src/paginas/              telas (por enquanto: login e início)
packages/compartilhado/
  src/enums.ts              enums do banco, usados pelos fronts sem depender do Prisma
  src/calculo.ts            regra de totais, desconto e parcelamento
packages/web/               o que os dois fronts usam no navegador
  src/api.ts                cliente HTTP com token e tratamento central de erro
  src/sessao.tsx            login, saída e sessão expirada
  src/tema.css              cores e fontes da marca
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
| GET | `/api/tecnico/agenda?de&ate` | técnico | só os serviços dele; por padrão de hoje (fuso de São Paulo) a 7 dias |
| GET | `/api/tecnico/servicos/:id` | técnico | serviço com o checklist e as fotos já enviadas |
| POST | `/api/tecnico/servicos/:id/fotos` | técnico | envia foto do checklist; `idLocal` evita duplicata no reenvio |
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

O técnico usa o próprio celular pelo navegador (`apps/tecnico`), muitas vezes com internet
móvel fraca. Por isso o app **reduz cada foto no aparelho antes do envio**
(`apps/tecnico/src/fotos/reduzir.ts`):

- **Lado maior com 2000 px**, mantendo a proporção e já girada conforme o EXIF. Fotos menores
  mantêm o tamanho.
- **JPEG com qualidade 85.** Uma foto assim costuma ficar entre 400 KB e 1 MB.
- **Uma foto por vez.** Decodificar uma foto de 12 MP ocupa uns 50 MB de memória; várias ao
  mesmo tempo derrubam a aba em celular simples.
- **Data/hora e localização da captura** vão nos campos `capturadaEm`, `latitude` e
  `longitude` da rota `POST /api/tecnico/servicos/:id/fotos`, porque o canvas descarta o EXIF.
  O app lê o EXIF antes de reduzir (`fotos/metadados.ts`, com a versão enxuta da `exifr`).
  **Atenção:** os navegadores costumam *remover a localização* das fotos entregues a uma página
  (Chrome no Android e Safari no iOS, por privacidade). Por isso o app também pede a posição ao
  navegador. A permissão é pedida num toque próprio ("Permitir localização"), nunca no mesmo
  toque que abre a câmera: no iPhone o pedido é um alerta do sistema e pode impedir a câmera
  de abrir. Sem permissão, a foto segue sem o local; a espera pela posição é de no máximo 4 s.

**Câmera e galeria.** Tocar num item do checklist abre a câmera do celular
(`<input type="file" capture="environment">`); "Da galeria" é a opção secundária, para uma
foto tirada antes. Os campos de arquivo ficam escondidos só visualmente: com `display:none`,
algumas versões do Safari ignoram o clique programático.

A API aceita apenas `image/jpeg`, `image/png` e `image/webp`, até 15 MB, no campo `arquivo`.
Uma foto maior é recusada com status 413, e um formato diferente com status 400, os dois com
mensagem pronta para mostrar ao técnico.

**Reenvio sem duplicar.** O app manda em cada foto um `idLocal` (UUID gerado no celular).
Se a foto já chegou e só a resposta se perdeu, o reenvio devolve a foto existente (200) em
vez de criar outra.

**Serviço em aberto.** Fotos e o envio para validação só são aceitos com o serviço agendado,
em execução ou devolvido (409 se já foi enviado, concluído ou cancelado), e a foto de um item
precisa ser de um item do checklist daquele tipo de serviço (400). A agenda do técnico mostra,
além de hoje a 7 dias, os serviços em aberto de dias anteriores, até serem enviados.

### Sem sinal em campo

O técnico não perde trabalho sem internet:

- **Fotos na fila do aparelho** (`apps/tecnico/src/fotos/fila.ts`, IndexedDB). A foto original
  é gravada no instante em que é escolhida; se o app fechar no meio do preparo, ao reabrir ele
  retoma. Cada foto aparece na hora com o estado: preparando, na fila, enviando ou erro.
- **Envio automático.** Falha de rede tenta de novo sozinha (5 s, 15 s, 1 min e depois a cada
  5 min). A fila também tenta na hora quando a conexão volta, quando o app volta para a tela e
  quando qualquer consulta à API dá certo — com sinal fraco o navegador nem percebe que ficou
  sem internet, então não dá para depender só do evento `online`.
- **Recusa da API não se repete** (ex.: serviço cancelado pelo escritório): a foto fica com o
  motivo na tela e o técnico decide.
- **O app abre sem sinal**: o service worker guarda o app; a agenda e os serviços já abertos
  ficam guardados (React Query persistido, até 7 dias); a sessão lembra o usuário.
- **Enviar para validação exige conexão** nesta versão: sem sinal, o botão avisa na hora que
  fotos e observações estão guardadas.
- **Sair com fotos na fila** pede confirmação; elas ficam guardadas e sobem quando a mesma
  pessoa entrar de novo naquele celular.

Limites conhecidos:

- **No iPhone não há envio em segundo plano** (o Safari não tem Background Sync): as fotos só
  sobem com o app aberto. No Android dá para acrescentar depois.
- **O primeiro acesso precisa de internet**: é nele que o app fica guardado no aparelho.
- **O Safari apaga dados de sites não usados por 7 dias**; app adicionado à tela inicial fica de
  fora disso. O app pede armazenamento persistente (`navigator.storage.persist()`), e a
  instalação na tela inicial é o que realmente protege a fila no iPhone.

**Sessão do técnico dura 7 dias** (`JWT_EXPIRES_IN_TECNICO`), para a fila de fotos não parar
no meio do serviço; os demais papéis seguem com 12 horas (`JWT_EXPIRES_IN`).

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
