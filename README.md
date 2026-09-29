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
npm run db:seed                            # base (catálogo, equipes, checklist) + usuários de teste
npm run usuario -- listar                  # usuários reais: criar, nova-senha, desativar, listar
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
| GET | `/api/validacao/fila` | gestor | aguardando validação (mais antigos primeiro) e, depois, os devolvidos |
| GET | `/api/validacao/:id` | gestor | serviço com fotos na ordem do checklist, materiais, técnico e equipe |
| POST | `/api/validacao/:id/aprovar` | gestor | conclui serviço e projeto; foto marcada para refazer exige `confirmarFotosMarcadas` |
| POST | `/api/validacao/:id/devolver` | gestor | pede fotos de novo (`motivo`, `fotosParaRefazer`); o projeto volta a em execução |
| GET | `/api/fotos/:id?tamanho=miniatura` | gestor, técnico | a foto (ou miniatura de 480 px); técnico só da própria equipe |
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
- **Limite de tentativas no login.** A cada 5 senhas erradas seguidas num e-mail, ele fica
  bloqueado por 1 min, depois 5, 15 e 60 min; o login certo zera. Um IP com 30 falhas em 15
  min (muitas contas testadas) fica bloqueado por 5, 15 e 60 min — folga grande porque vários
  técnicos saem da mesma rede. A mensagem é a mesma para e-mail que existe e que não existe
  (inclusive no tempo de resposta: a senha é sempre conferida). Cada falha e bloqueio vai para
  o log numa linha JSON (`login_falhou`, `login_bloqueio_iniciado`, `login_bloqueado`), nunca
  a senha. Em produção atrás de proxy, configure `TRUST_PROXY` (quantos proxies há na frente).
- **Fotos sem link público.** São fotos da casa e do telhado do cliente, com localização: só
  saem por `GET /api/fotos/:id`, com login e conferência de papel e equipe a cada foto. As
  telas buscam a foto com o token no cabeçalho (componente `ImagemProtegida`), porque o
  navegador não manda o token em `<img src>`. Não há token na URL nem link assinado: um link
  copiado não abre fora da sessão. O banco guarda só a chave do arquivo, então a troca para o
  OneDrive muda apenas `armazenamento.ts`. A única exceção sem login é o PDF do orçamento,
  aberto pelo cliente com o token do link.
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

**Validação pelo gestor** (`/validacao` no escritório). Aprovar e devolver só valem para
serviço aguardando validação ou já devolvido (409 nos demais). Devolver de novo troca as fotos
marcadas (as que saem da lista voltam a pendentes). Aprovar um devolvido com foto ainda marcada
pede confirmação explícita: o gestor aceita a foto como está (ex.: o técnico não pôde voltar).

**Serviço em aberto.** Fotos e o envio para validação só são aceitos com o serviço agendado,
em execução ou devolvido (409 se já foi enviado, concluído ou cancelado), e a foto de um item
precisa ser de um item do checklist daquele tipo de serviço (400). A agenda do técnico mostra,
além de hoje a 7 dias, os serviços em aberto de dias anteriores, até serem enviados.

### Fotos no SharePoint (produção)

Em produção as fotos vão para uma biblioteca do SharePoint da Guarusolar (`STORAGE_PROVIDER=sharepoint`);
em desenvolvimento ficam no disco (`STORAGE_PROVIDER=disco`, o padrão). A leitura segue a chave de
cada foto, então as duas convivem.

**O que pedir ao administrador do Microsoft 365** (Administrador Global, ou de Aplicativos + do SharePoint):

1. Um site do SharePoint **privado**, ex. "Guarusolar Sistema", com a biblioteca **"Fotos de serviços"**
   (não o OneDrive de uma pessoa: os arquivos seriam do funcionário). Membros: só quem deve ver as
   fotos direto no SharePoint.
2. Microsoft Entra ID › Registros de aplicativo › **Novo registro**: "Guarusolar Sistema",
   **somente este diretório**, sem URL de redirecionamento (a API fala direto com a Microsoft).
3. Permissões de API › Microsoft Graph › **Permissões de aplicativo** › **`Sites.Selected`** e
   **Conceder consentimento do administrador**. `Sites.Selected` não dá acesso a nada sozinho: é
   o oposto de `Files/Sites.ReadWrite.All`, que abririam todos os arquivos da empresa.
4. **Liberar o site para o aplicativo com papel `write`** (PnP PowerShell:
   `Grant-PnPAzureADAppSitePermission`; ou Graph: `POST /sites/{id}/permissions`). Sem este passo,
   tudo dá "acesso negado".
5. Certificados e segredos › **Novo segredo do cliente** (até 24 meses).

**O que volta e onde vai** (`apps/api/.env` ou, em produção, as variáveis da hospedagem):
`MS_TENANT_ID` (ID do diretório), `MS_CLIENT_ID` (ID do aplicativo), `MS_CLIENT_SECRET` (o **valor**
do segredo, mostrado uma vez só), `MS_CLIENT_SECRET_EXPIRA` (validade, AAAA-MM-DD: a API avisa 30
dias antes), `MS_SITE_URL` (endereço do site), `MS_BIBLIOTECA` ("Fotos de serviços"). Depois:
`npm run sharepoint:conferir` (testa tudo com um arquivo real) e `STORAGE_PROVIDER=sharepoint`.

**Pastas:** `Cliente – Cidade / PRJ-2026-0015 / 2026-09-29 Instalação / 01 Painéis instalados 14-02-07.jpg`,
com `Extra hh-mm-ss.jpg` e `Substituídas/` (fotos refeitas; nada é apagado). O banco guarda o id do
arquivo, não o caminho: renomear ou mover pastas no SharePoint não quebra nada.

**Se a Microsoft não responder:** a API tenta de novo algumas vezes (respeitando o `Retry-After`);
se não der, responde 503 e a foto continua na fila do celular, que reenvia sozinha. Nada fica
guardado no disco do servidor (em hospedagem gratuita ele costuma ser apagado a cada reinício).
Na leitura, 503 e a tela mostra "Não foi possível abrir a foto". As fotos sempre passam pela API
(com login e regra de equipe); os links de download do próprio Graph, que abrem sem login, nunca
chegam às telas.

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

### Na tela inicial do celular

O app pode ficar na tela inicial como um aplicativo (abre em tela cheia, com nome e ícone),
sem loja e sem instalar nada de verdade: continua sendo o site.

- **Android:** a agenda mostra "Coloque o app na tela inicial" com o botão **Instalar**.
- **iPhone:** o Safari não oferece botão; o convite explica o caminho: **Compartilhar ›
  Adicionar à Tela de Início**. No iPhone isso importa: é o que protege as fotos guardadas
  (o Safari apaga dados de sites não usados por 7 dias).

Nome "Guarusolar", ícone do sol provisório sobre o azul-escuro da marca (troca quando chegar o
logo: `apps/tecnico/icones/`), abre direto na agenda.

### Testar no celular (Cloudflare Tunnel)

Câmera, localização e service worker só funcionam em HTTPS, e o IP da rede local não conta.
Um túnel rápido da Cloudflare (sem conta) dá um endereço HTTPS temporário:

```bash
npm run dev:api                                   # terminal 1: API na 3333
npm run preview:tecnico                           # terminal 2: build do técnico na 5175
cloudflared tunnel --url http://127.0.0.1:5175    # terminal 3: mostra https://<aleatório>.trycloudflare.com
```

No celular, abra `https://<aleatório>.trycloudflare.com/campo/` (o build do técnico mora em
`/campo/`, como em produção). Só a 5175 é exposta: ela repassa `/api` (inclusive as fotos) para a API, então para o celular é tudo
o mesmo endereço (sem CORS). O Vite já aceita qualquer `*.trycloudflare.com` e o preview escuta
em `127.0.0.1` (com `localhost` ficaria só no IPv6 e o túnel não conectaria). O endereço muda a
cada execução do `cloudflared`: um app instalado na tela inicial e as fotos na fila ficam presos
ao endereço antigo, então mantenha o túnel aberto durante todo o teste.

**Sessão do técnico dura 7 dias** (`JWT_EXPIRES_IN_TECNICO`), para a fila de fotos não parar
no meio do serviço; os demais papéis seguem com 12 horas (`JWT_EXPIRES_IN`).

## Limpar os dados de teste

`npm run db:limpar` apaga, **sem possibilidade de recuperar**, clientes, orçamentos (com itens
e histórico), projetos, agendamentos, fotos e materiais, e zera a numeração dos códigos: o
próximo orçamento volta a ser `GS-<ano>-0001` e o próximo projeto `PRJ-<ano>-0001`.
Usuários, equipes, checklist de fotos e o catálogo de produtos ficam como estão.

Antes de apagar, o script mostra em qual banco vai rodar e quanto existe em cada tabela, e só
continua se alguém digitar `LIMPAR`. Com `NODE_ENV=production` ou num banco marcado como
produção (`npm run db:marcar-producao`), ele se recusa a rodar, de qualquer computador. Tudo é
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
- **Publicar:** ver "Publicar em produção (Fly.io)" abaixo.

## Publicar em produção (Fly.io)

Um serviço só, no Fly.io em São Paulo (`gru`), junto do banco no Supabase em São Paulo:

```
https://<app>.fly.dev/          escritório (comercial e gestor)
https://<app>.fly.dev/campo/    app dos técnicos (PWA)
https://<app>.fly.dev/api/...   API
```

Mesmo endereço para os apps e a API: sem CORS no navegador. A imagem (`Dockerfile`) é compilada
pelo próprio Fly: não precisa de Docker na máquina. Custo estimado: US$ 3–5/mês (1 máquina de
512 MB, sempre ligada). Quando houver domínio próprio, cada app pode ganhar o seu endereço.

**App dos técnicos sem SharePoint:** em produção, sem lugar persistente para as fotos, o login do
técnico e as rotas `/api/tecnico` ficam bloqueados ("O app dos técnicos ainda não foi liberado")
— melhor não receber fotos do que perdê-las na próxima publicação. Liberam sozinhos com
`STORAGE_PROVIDER=sharepoint` (segredos `MS_*`). Alternativa, se precisar antes: volume do Fly
(`fly volumes create fotos --region gru --size 1`, `[mounts]` em `/data`, `STORAGE_DIR=/data/fotos`,
`FOTOS_EM_DISCO_PERSISTENTE=sim` e `strategy = "immediate"`: com volume, cada publicação derruba o
serviço por uns 10–20 s).

### Primeira vez (uma vez só)

**1. GitHub.** Em github.com › New repository: nome `guarusolar`, **Private**, sem README. Depois:

```powershell
git remote add origin https://github.com/<seu-usuario>/guarusolar.git
git push -u origin main
```

**2. Supabase de produção.** Em supabase.com › New project: `guarusolar-producao`, região
**South America (São Paulo)**, senha do banco forte (guarde num gerenciador de senhas). Em
Connect, copie a **Transaction pooler** (porta 6543) e a **Session pooler** (porta 5432). No
PowerShell, na raiz do projeto (as variáveis da sessão valem mais que o `.env`, que não muda):

```powershell
$env:DATABASE_URL = "<transaction pooler, porta 6543>?pgbouncer=true&connection_limit=5"
$env:DIRECT_URL   = "<session pooler, porta 5432>"
npm run db:migrate:deploy          # cria as tabelas
npm run db:marcar-producao         # digite PRODUCAO: db:limpar e usuários de teste passam a recusar
npm run db:seed:base               # equipes, catálogo inicial, checklist (sem usuários)
npm run usuario -- criar --nome "Seu Nome" --email voce@guarusolar.com.br --papel ADMIN
# repita para cada pessoa (COMERCIAL, GESTOR; TECNICO com --equipe "Equipe A")
Remove-Item Env:DATABASE_URL, Env:DIRECT_URL   # volta para o banco de desenvolvimento
```

A senha que o comando mostra é temporária: no primeiro acesso a pessoa cria a própria.
Os dados reais que estão hoje no banco de desenvolvimento são copiados num passo à parte.

**3. Fly.io.** Crie a conta em fly.io (pede cartão; a cobrança é pelo uso). No PowerShell:

```powershell
iwr https://fly.io/install.ps1 -useb | iex        # instala o flyctl (abra outro terminal depois)
fly auth login
fly apps create guarusolar-sistema                 # se o nome existir, escolha outro e troque em fly.toml
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"   # gera o JWT_SECRET
fly secrets set DATABASE_URL="<a mesma do passo 2>" DIRECT_URL="<a mesma do passo 2>" JWT_SECRET="<gerado acima>"
fly deploy
```

Confira `https://guarusolar-sistema.fly.dev/saude` (`"banco":"ok"` e a versão) e entre em
`https://guarusolar-sistema.fly.dev` com o usuário criado.

**4. Publicação pelo GitHub.** `fly tokens create deploy` gera um token; no repositório,
Settings › Secrets and variables › Actions › `FLY_API_TOKEN`. Para o backup noturno, também
`BACKUP_DATABASE_URL` (a Session pooler de produção) e `BACKUP_SENHA` (guarde fora do GitHub:
sem ela o backup não abre).

### Publicar uma versão nova

Aba **Actions › Publicar › Run workflow** (ou `fly deploy` no PowerShell). O Fly:

1. roda as migrations (`release_command`) — se falharem, nada é publicado;
2. sobe a versão nova **ao lado** da atual e espera o `/saude` responder (a API precisa
   alcançar o banco);
3. só então troca o tráfego e desliga a antiga (`strategy = "bluegreen"`): ninguém cai.

Técnicos com o app aberto veem "Nova versão disponível — Atualizar" e seguem trabalhando até
tocar. Toda alteração enviada ao GitHub passa pela verificação (`npm run build`).

**Migrations precisam funcionar também com a versão anterior do código** (durante a troca, as
duas rodam; e voltar atrás não desfaz o banco): só adições numa publicação; renomear ou apagar
coluna em duas (primeiro adiciona e passa a usar, depois remove). Antes de publicar uma
migration, rode o backup (Actions › Backup do banco › Run workflow).

### Voltar atrás

```powershell
fly releases --image                    # lista as versões publicadas e a imagem de cada uma
fly deploy --image <imagem da versão boa>   # volta em ~1 min, sem recompilar
fly logs                                # o que a API está registrando agora
```

### Backup e restauração do banco

O plano gratuito do Supabase não dá backup restaurável. O workflow **Backup do banco** faz um
`pg_dump` toda madrugada (03h), criptografado com `BACKUP_SENHA`, guardado 14 dias como artefato
do GitHub. Para restaurar: baixe o artefato, `gpg --decrypt arquivo.dump.gpg > arquivo.dump` e
`pg_restore --no-owner --dbname "<url do banco de destino>" arquivo.dump` (de preferência num
projeto novo, para conferir antes de trocar).

## Próximos passos

1. ~~Front do escritório~~ (feito: orçamentos, pipeline, clientes, catálogo, agenda e
   validação); falta a tela de projetos do gestor.
2. Empacotar o front em executável Windows (Electron ou Tauri).
3. ~~PWA dos técnicos com câmera e fila de envio offline~~ (feito; falta o teste no celular,
   que precisa do ambiente exposto com HTTPS).
4. ~~Geração do PDF do orçamento~~ (feito; falta o logo da Guarusolar).
5. ~~SharePoint do cliente (Microsoft Graph)~~ (feito; falta o administrador criar o aplicativo e
   conferir com `npm run sharepoint:conferir`).
6. Atualização em tempo real da fila de validação (Supabase Realtime ou WebSocket).
