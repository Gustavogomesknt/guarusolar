# Guarusolar — Sistema de gestão

Monorepo (npm workspaces) com o backend em Node.js + TypeScript + PostgreSQL (Prisma),
em `apps/api`, que atende os dois aplicativos:

- **Escritório (site, no navegador do PC)** — comercial, catálogo, orçamentos, agenda, validação e
  projetos.
- **Técnicos (site no celular, sem instalar nada)** — apenas a própria agenda e o envio das fotos.

Os dois falam com **a mesma API e o mesmo banco**, e é isso que faz o serviço concluído na rua
aparecer no escritório em seguida.

> **Algo deu errado e o desenvolvedor não está disponível?** Veja o [SOCORRO.md](SOCORRO.md):
> passo a passo, sem jargão, para o sistema fora do ar, erros, banco pausado, voltar versão,
> restaurar backup e senhas de usuários.

## Como rodar

Requer Node.js 22.12 ou mais recente. Todos os comandos rodam a partir da raiz:

```bash
npm install                                # instala todos os workspaces
cp apps/api/.env.example apps/api/.env     # ajuste DATABASE_URL, DIRECT_URL e JWT_SECRET
npm run db:migrate:deploy                  # cria as tabelas (aplica as migrations; não apaga dados)
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
  src/calculo.ts            regra de totais, desconto e parcelamento (com a taxa do cartão)
  src/taxasCartao.ts        tabela de taxas do Mercado Pago: edite aqui quando renegociar
  src/margemDoOrcamento.ts  margem padrão em reais de todo orçamento novo (MARGEM_PADRAO): edite aqui;
                            entra antes do desconto e nunca aparece para o cliente (regra 1 do CLAUDE.md)
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
| GET | `/api/orcamentos` | comercial | lista com filtros (`status`, `q`, `de`/`ate`; com `abertosSempre=true`, em aberto ignoram o período e decididos usam a data da decisão) |
| GET | `/api/orcamentos/resumo` | comercial | indicadores do mês |
| POST/PUT | `/api/orcamentos` | comercial | criar/editar (totais no servidor) |
| PATCH | `/api/orcamentos/:id/status` | comercial | mudança em 1 clique |
| POST | `/api/orcamentos/:id/whatsapp` | comercial | mensagem pronta + link `wa.me`; rascunho passa a ENVIADO |
| GET | `/api/agenda?inicio&fim` | gestor | semana por equipe |
| GET | `/api/agenda/pendentes` | gestor | lista "A agendar" |
| POST | `/api/agenda` | gestor | agendar serviço; `tecnicos` = quem vai (ausente: os técnicos da equipe). Conflito não bloqueia: volta em `avisos` |
| PATCH | `/api/agenda/:id` | gestor | remarcar (equipe e datas), trocar a escala (`tecnicos`, só com o serviço em aberto) ou cancelar (`status: CANCELADO`) |
| GET | `/api/agenda/tecnicos` | gestor | técnicos ativos com a equipe padrão de cada um (quem pode ser escalado) |
| GET | `/api/agenda/conflitos` | gestor | onde a equipe e as pessoas escolhidas já estão no período (avisos da janela de agendar) |
| GET | `/api/validacao/fila` | gestor | aguardando validação (mais antigos primeiro) e, depois, os devolvidos |
| GET | `/api/validacao/versao` | gestor | versão da operação, sem banco: muda quando a fila, a agenda ou a situação de um serviço muda (o escritório pergunta a cada 20 s) |
| GET | `/api/validacao/:id` | gestor | serviço com fotos na ordem do checklist, materiais, técnico e equipe |
| POST | `/api/validacao/:id/aprovar` | gestor | conclui serviço e projeto; foto marcada para refazer exige `confirmarFotosMarcadas` |
| POST | `/api/validacao/:id/devolver` | gestor | pede fotos de novo (`motivo`, `fotosParaRefazer`); o projeto volta a em execução |
| GET | `/api/fotos/:id?tamanho=miniatura` | gestor, técnico | a foto (ou miniatura de 480 px); técnico só dos serviços em que está escalado |
| GET | `/api/tecnico/agenda?de&ate` | técnico | só os serviços dele; por padrão de hoje (fuso de São Paulo) a 7 dias |
| GET | `/api/tecnico/servicos/:id` | técnico | serviço com o checklist e as fotos já enviadas |
| POST | `/api/tecnico/servicos/:id/fotos` | técnico | envia foto do checklist; `idLocal` evita duplicata no reenvio |
| POST | `/api/tecnico/servicos/:id/concluir` | técnico | envia para validação |

## Decisões importantes

- **Valores calculados no servidor.** O front manda itens e descontos; quem soma é a API.
  Assim ninguém consegue gravar um total diferente do que as regras permitem. A regra fica em
  `packages/compartilhado`, e o front usa a mesma função só para mostrar a prévia em tela.
- **Taxa do cartão repassada ao cliente.** Na condição "Entrada + cartão", a entrada é Pix ou
  transferência (sem taxa) e o saldo vai para o cartão (débito ou 1x a 18x) com a taxa do Mercado
  Pago repassada: valor cobrado = saldo ÷ (1 − taxa), para a Guarusolar receber o valor cheio da
  proposta. Ex.: proposta de R$ 10.000,00, entrada de 30%, 12x (12,19%): R$ 7.000,00 viram
  R$ 7.971,76 no cartão (1ª de R$ 664,35 + 11x de R$ 664,31); o cliente paga R$ 10.971,76 e a
  empresa recebe R$ 10.000,00. O vendedor pode absorver a taxa numa negociação (a tela mostra
  quanto a empresa deixa de receber). A tabela fica em `packages/compartilhado/src/taxasCartao.ts`;
  cada orçamento grava a taxa que usou, então renegociar não muda proposta já enviada.
  Indicadores e listas usam o valor da proposta (o que a empresa recebe); PDF e WhatsApp, o total
  com a taxa.
- **Usuários pela tela (só Administrador):** menu Administração › Usuários. Criar (com senha
  temporária mostrada uma vez, trocada no primeiro acesso), nova senha, trocar papel e equipe,
  desativar e reativar (nada é apagado). Desativar ou mudar o acesso derruba o login da pessoa na
  hora. O Administrador não pode se desativar nem se rebaixar, e sempre sobra um Administrador
  ativo. O comando `npm run usuario` continua como alternativa (ver SOCORRO.md).
- **Busca por palavras em todo o sistema** (catálogo, itens do gerador, clientes, orçamentos e
  projetos): cada palavra digitada precisa aparecer, em qualquer ordem e em qualquer campo, sem
  diferença de acento ou maiúscula ("disjuntor 20" acha "DISJ JNG 1X20A"; "acacias" acha
  "Acácias"). Abreviações do catálogo funcionam quando são o começo da palavra (DISJ, ELETROD,
  TERM); não há dicionário de apelidos (DUTO ou CX por extenso não são reconhecidos). O código do
  fornecedor acha o item quando digitado inteiro ("110").
- **Projetos: a obra do começo ao fim.** A tela Projetos lista as obras por situação (padrão:
  em andamento) e a ficha mostra etapas, cliente e local, orçamento de origem, serviços, fotos e o
  histórico. O comercial consulta ("quando vão instalar?"), sem fotos nem ações; o gestor edita
  potência e observações internas e pode cancelar a obra antes de a execução começar (os
  serviços agendados são cancelados junto; nada é apagado). Agendar e validar seguem na Agenda e
  na Validação. O histórico é gravado a cada mudança desde esta versão; o anterior foi
  reconstruído pelas datas que existiam e aparece marcado como "Reconstruído".
- **Catálogo para solar e carregador veicular.** Categorias: painel solar, inversor, estrutura,
  carregador veicular, proteção e aterramento, quadros e caixas, cabos e fios, conectores e
  terminais, eletrodutos e fixação, mão de obra, projeto e documentação, outros. Unidades: un, pç,
  kit, m, barra, rolo, serviço, kWp. Cada item pode ter o **código do fornecedor** (o que a
  Guarusolar já usa: 113, 320...), único entre os itens ativos e aceito na busca do catálogo e do
  gerador de orçamentos.

## Importar o catálogo de uma planilha

Planilha `.xlsx` com as colunas COD, PRODUTO e VALOR; UNIDADE é opcional. **O VALOR é o preço de
venda** (confirmado pela Guarusolar): entra como está, sem margem, e o custo fica em branco. Em
duas etapas, no banco do `.env` (desenvolvimento), para revisar antes de levar à produção:

```powershell
npm run produtos:importar -- revisar materiais.xlsx
```

Gera `materiais-revisao.xlsx` (nada é gravado) com, por linha: categoria e unidade sugeridas por
palavra-chave (listas de escolha), o preço de venda, IMPORTAR (S, N ou ?) e a situação. Linhas
inválidas saem N; **nomes ou códigos repetidos na planilha saem "?"** para você decidir (para
manter os dois, mude o nome de um); o que já está no catálogo sai N. A linha "MARGEM ALEATORIA"
sai "?": marque N (a margem agora é um campo do orçamento). Uma revisão gerada pelo formato
antigo (com as colunas CUSTO e MARGEM %) é recusada: gere de novo. Revise no Excel e grave:

```powershell
npm run produtos:importar -- gravar materiais-revisao.xlsx
```

Confere tudo de novo, mostra o banco, o resumo por categoria e uma amostra, e só grava (tudo ou
nada) depois que você digitar `IMPORTAR`.
- **Itens do orçamento são uma cópia.** Nome, unidade e preço ficam gravados no item.
  Mudar o catálogo depois não altera orçamentos antigos.
- **Os dados do cliente no orçamento também são uma cópia.** Nome, CPF/CNPJ, WhatsApp, e-mail e
  endereço ficam gravados no orçamento ao salvar: o PDF e a mensagem do WhatsApp usam essa cópia,
  e corrigir o cadastro não muda proposta já enviada. Se o cadastro mudou depois, o gerador avisa
  e oferece "Usar dados atuais do cadastro" (vale ao salvar). A ficha do cliente e as listas
  seguem o cadastro atual, e o WhatsApp vai para o número atual do cadastro.
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
  acompanha pelo status dos orçamentos. Conflito AVISA e não bloqueia: a mesma equipe ou
  a mesma pessoa pode ter mais de um serviço no dia (uma visita técnica dura uma hora); a janela
  de agendar diz onde cada um já está. Cancelar devolve o projeto para "A agendar".
- **Equipe é a composição padrão; quem vai é a escala.** Cada serviço guarda os técnicos escalados
  (começa com os da equipe; o gestor troca em "Quem vai"). O técnico vê no app só os serviços em
  que está escalado. A equipe padrão de cada um fica em Usuários.
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
  escritório. Isso vale para os indicadores do mês, o filtro de período da lista e do pipeline
  (em aberto aparecem em qualquer período; aprovados e recusados, pelo mês da decisão), o ano nos
  códigos (GS-2026-0148), a validade padrão e as datas exibidas, no PDF e no WhatsApp. Pode
  hospedar a API em servidor configurado em UTC sem ajustes.
- **Banco:** PostgreSQL gerenciado (plano gratuito do Supabase, Neon ou similar). Use
  `DATABASE_URL` e `DIRECT_URL` com o Session pooler (porta 5432) em servidor sempre ligado
  (o porquê em `apps/api/.env.example` e em "Região e velocidade", abaixo).
- **PDF do orçamento:** gerado pela própria API com pdfmake (só JavaScript, sem navegador
  embutido; em teste, o processo ficou abaixo de 160 MB gerando 20 PDFs seguidos). Defina
  `API_URL_PUBLICA` com o endereço público da API: é o link que o cliente recebe pelo WhatsApp
  (`/api/orcamentos/:id/pdf?token=...`), aberto sem login e protegido pelo token do orçamento.
- **Proposta em PDF (layout do canvas "Nova proposta comercial"):** página 1 com a proposta e
  última página institucional, fixa. Textos fixos, dados da empresa (razão social, CNPJ,
  endereço, contatos, logo) e todo o conteúdo institucional ficam em
  `apps/api/src/conteudo/proposta.ts`; texto entre colchetes, como `[PRAZO]`, é pendência e sai
  assim no PDF. Depois de editar, `npm run pdf:exemplo` gera três PDFs de exemplo, sem banco
  (padrão, com preços e com muitos itens), para conferir. No gerador de orçamentos, "Serviço"
  vira o título da proposta e "Detalhar preços por item no PDF" (desmarcado por padrão) mostra
  preço unitário e subtotal de cada item.
- **Publicar:** ver "Publicar em produção (Render)" abaixo.

## Publicar em produção (Render)

Um serviço só, no plano **gratuito** da Render (`render.yaml`), com o banco no Supabase:

```
https://<servico>.onrender.com/          escritório (comercial e gestor)
https://<servico>.onrender.com/campo/    app dos técnicos (PWA)
https://<servico>.onrender.com/api/...   API
```

Mesmo endereço para os apps e a API: sem CORS no navegador. HTTPS vem pronto. A imagem
(`Dockerfile`) é compilada pela própria Render: não precisa de Docker na máquina. Quando houver
domínio próprio, ele entra em Settings › Custom Domains (também no plano gratuito).

### O que o plano gratuito implica

- **Dorme depois de 15 min sem acesso.** O primeiro pedido depois disso leva de 30 a 60 s. As
  telas mostram "Conectando ao sistema…" quando uma consulta passa de 4 s
  (`packages/web/src/AvisoServidorAcordando.tsx`). O app dos técnicos abre na hora (service
  worker) e só os dados esperam; o escritório, na primeira abertura, só aparece quando o
  servidor acorda. **Não use robôs de "ping" para mantê-lo acordado:** contraria o propósito do
  plano gratuito (a Render pode suspender o serviço). Se a espera incomodar, o caminho é o
  plano pago (Starter), que não dorme.
- **0,1 de CPU e 512 MB.** Login (bcrypt) e PDF ficam mais lentos que na sua máquina.
- **O limite de tentativas de login zera** quando o serviço dorme ou reinicia (fica em memória).
- **Disco apagado a cada publicação, reinício e sono**, e o plano gratuito não tem disco
  persistente (só os pagos). Por isso, **o app dos técnicos segue bloqueado** até o SharePoint:
  login do técnico e `/api/tecnico` respondem "O app dos técnicos ainda não foi liberado".
  Libera sozinho com `STORAGE_PROVIDER=sharepoint` e os segredos `MS_*`.
- **Minutos de compilação limitados por mês** (cada publicação leva uns 5–10 min): publique
  quando houver o que publicar, não a cada commit.

### Região e velocidade

A Render não tem servidores no Brasil; `virginia` (leste dos EUA) é a mais próxima, a ~120 ms
de ida e volta de São Paulo. O que pesa é quantas vezes cada pedido vai ao banco:

| Pedido | Idas ao banco (Session pooler) | Banco em SP (~120 ms cada) | Banco na Virginia |
| --- | --- | --- | --- |
| login, `/eu`, fila de validação | 1 | ~0,1 s | ~0 |
| lista de orçamentos, pendentes | 3 | ~0,4 s | ~0 |
| indicadores (resumo) | 4 | ~0,5 s | ~0 |
| agenda da semana | 6 | ~0,7 s | ~0 |
| orçamento aberto | 8 | ~1 s | ~0 |

Medido contando as consultas de cada rota. Em todos os casos soma-se a ida e volta do
navegador até a Render (~120 ms a partir de Guarulhos). **Use o Session pooler** (porta 5432,
`?connection_limit=5`, sem `pgbouncer=true`): com o Transaction pooler o Prisma faz 4 idas por
consulta, e o resumo chegaria a 16 (~2 s só de espera). Banco na mesma região da Render
(Supabase "East US (North Virginia)") deixa as telas tão rápidas quanto em desenvolvimento; os
dados passam a ficar nos EUA (transferência internacional pela LGPD: cite no aviso de
privacidade).

**Decisão:** banco de produção em **São Paulo** (LGPD: dados pessoais de clientes brasileiros
ficam no Brasil), aceitando o tempo da coluna "Banco em SP".

### Primeira vez (uma vez só)

**1. Supabase de produção.** Em supabase.com › New project: `guarusolar-producao`, senha do
banco forte (guarde num gerenciador de senhas), região conforme "Região e velocidade". Em
Connect, copie a **Session pooler** (porta 5432). No PowerShell, na raiz do projeto (as
variáveis da sessão valem mais que o `.env`, que não muda):

```powershell
$env:DATABASE_URL = "<session pooler, porta 5432>?connection_limit=5"
$env:DIRECT_URL   = $env:DATABASE_URL
npm run db:migrate:deploy          # cria as tabelas
npm run db:marcar-producao         # digite PRODUCAO: db:limpar e usuários de teste passam a recusar
npm run db:seed:base               # equipes e checklist (em produção, pula o catálogo de exemplo)
npm run usuario -- criar --nome "Seu Nome" --email voce@guarusolar.com.br --papel ADMIN
# repita para cada pessoa (COMERCIAL, GESTOR; TECNICO com --equipe "Equipe A")
Remove-Item Env:DATABASE_URL, Env:DIRECT_URL   # volta para o banco de desenvolvimento
```

A senha que o comando mostra é temporária: no primeiro acesso a pessoa cria a própria.
Os dados reais que estão hoje no banco de desenvolvimento são copiados num passo à parte.

**2. Render.** Crie a conta em render.com entrando com o GitHub (sem cartão) e dê acesso ao
repositório `guarusolar`. New › **Blueprint** › escolha o repositório: a Render lê o
`render.yaml` e pede `DATABASE_URL` e `DIRECT_URL` (as duas com o valor do passo 1) e o
`JWT_SECRET`, novo e só de produção:
`node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`.
A região (Virginia) vem do `render.yaml` e não muda depois de criado o serviço. Se o nome `guarusolar` já existir na Render, o endereço ganha um
sufixo: corrija `API_URL_PUBLICA` e `CORS_ORIGINS` em Environment. Confira
`https://<servico>.onrender.com/saude` (`"banco":"ok"` e a versão) e entre com o usuário criado.

**3. Publicação pelo GitHub.** Na Render, Settings › Deploy Hook: copie a URL (é um segredo:
quem a tem publica). No GitHub, Settings › Secrets and variables › Actions:

- segredos `RENDER_DEPLOY_HOOK_URL` (o hook), `PRODUCAO_DATABASE_URL` (a mesma do passo 1) e
  `BACKUP_SENHA` (senha da criptografia do backup; guarde fora do GitHub: sem ela o backup não abre);
- variável (aba Variables) `PRODUCAO_URL` = `https://<servico>.onrender.com`.

**4. `TRUST_PROXY`.** Erre a senha uma vez e veja em Logs a linha `login_falhou`: o campo
`origem` tem de ser o IP da sua internet (confira num site "qual é o meu IP"). Se aparecer um
IP interno ou sempre o mesmo para pessoas diferentes, suba `TRUST_PROXY` para 2 e repita.

### Publicar uma versão nova

Aba **Actions › Publicar › Run workflow** (branch `main`). O push no `main` **não** publica
sozinho (`autoDeploy: false`). O workflow:

1. aplica as migrations no banco de produção — se falharem, nada é publicado;
2. chama o deploy hook: a Render compila o commit mais recente do `main`, sobe a versão nova
   ao lado da atual e só troca o tráfego quando o `/saude` responde (a API precisa alcançar o
   banco); se não responder, a anterior continua atendendo: ninguém cai;
3. confere que o `/saude` mostra o commit publicado.

Técnicos com o app aberto veem "Nova versão disponível — Atualizar" e seguem trabalhando até
tocar. Toda alteração enviada ao GitHub passa pela verificação (`npm run build`).

**Migrations precisam funcionar também com a versão anterior do código** (entram antes da
versão nova; e voltar atrás não desfaz o banco): só adições numa publicação; renomear ou apagar
coluna em duas (primeiro adiciona e passa a usar, depois remove). Antes de publicar uma
migration, rode o backup (Actions › Backup do banco › Run workflow).

### Voltar atrás

- **Rápido:** no painel da Render, Events › na publicação boa, **Rollback**. Volta a imagem já
  compilada em ~1 min. O banco não volta (por isso as migrations só adicionam).
- **Definitivo:** `git revert <commit ruim>`, push e Publicar. Sem isso, a próxima publicação
  traria o problema de volta.
- **Logs:** painel da Render › Logs (o que a API está registrando agora).

### Backup e restauração do banco

O plano gratuito do Supabase não dá backup restaurável. O workflow **Backup do banco** faz um
`pg_dump` do schema `public` (tabelas, dados, migrations e sequência de códigos) toda madrugada
(03h), criptografado com `BACKUP_SENHA`, guardado 14 dias como artefato do GitHub; o do dia 1º
de cada mês (`guarusolar-mensal-...`) fica 90 dias. Segredos: `PRODUCAO_DATABASE_URL` e
`BACKUP_SENHA` (16+ caracteres; **perdê-la é perder todos os backups**: guarde em dois lugares).

**Rotina mensal (manual):** no começo de cada mês, baixe o backup `guarusolar-mensal-...` (Actions ›
Backup do banco › a execução do dia 1º › Artifacts) e guarde fora do GitHub (OneDrive da empresa
ou outro local). O arquivo já vem criptografado. Assim um problema na conta do GitHub não leva
os backups junto.

**Restaurar** (workflow **Restaurar backup**, `.github/workflows/restaurar-banco.yml`): baixa o
backup, abre com a `BACKUP_SENHA`, restaura e confere tabela por tabela (o resumo aparece na
página da execução). Só escreve em banco **vazio**: nunca por cima de dados.

- **Teste** (`destino: teste`, o padrão): restaura num Postgres descartável, que existe só durante
  a execução. Roda sozinho todo dia 2 (testa o backup mensal); falha = e-mail do GitHub. Também
  confere que o backup veio do banco de produção (marca `producao`) e que tem todas as migrations.
- **Emergência** (`destino: banco-novo`):
  1. Supabase › New project (São Paulo), senha nova; copie a Session pooler (5432).
  2. GitHub › Settings › Secrets › Actions: `RESTAURAR_DESTINO_URL` = essa string.
  3. Actions › Restaurar backup › Run workflow › `banco-novo` (e o número da execução do backup,
     se não for o mais recente). Confira o resumo.
  4. Render › Environment: `DATABASE_URL` e `DIRECT_URL` = a string nova; troque também o segredo
     `PRODUCAO_DATABASE_URL` no GitHub. O `/saude` deve mostrar `"producao":true`.
  5. Apague o segredo `RESTAURAR_DESTINO_URL`.

O que volta: todas as tabelas do sistema com os dados, o histórico de migrations, a marca de
produção e a `SequenciaCodigo` (o próximo orçamento continua a numeração). Não voltam: as fotos
(estão fora do banco) e o que foi gravado depois do backup.

**Sem o GitHub** (com a cópia mensal guardada fora dele): precisa do `gpg` (vem com o Git para
Windows) e das ferramentas do PostgreSQL 17 (`pg_restore`). O schema `public` já existe em todo
banco novo, então ele sai da lista antes de restaurar (sem isso o `pg_restore` para no primeiro
comando):

```bash
gpg --decrypt -o backup.dump guarusolar-mensal-....dump.gpg       # pede a BACKUP_SENHA
pg_restore --list backup.dump | grep -v -E "SCHEMA - public|COMMENT - SCHEMA public" > lista.txt
pg_restore --no-owner --no-privileges --exit-on-error --single-transaction -L lista.txt --dbname "<session pooler do banco novo, sem ?parâmetros>" backup.dump
```

Depois, apague o `backup.dump` (é o banco inteiro sem criptografia).

**Conferir qual banco a produção usa** (sem expor o endereço): `https://<servico>.onrender.com/saude`
mostra `"producao": true` só quando o banco tem a marca de produção. O workflow Publicar recusa
publicar se o segredo `PRODUCAO_DATABASE_URL` ou a Render apontarem para outro banco.

## Próximos passos

1. ~~Front do escritório~~ (feito: orçamentos, pipeline, clientes, catálogo, agenda,
   validação e projetos).
2. ~~PWA dos técnicos com câmera e fila de envio offline~~ (feito; falta o teste no celular,
   que precisa do ambiente exposto com HTTPS).
3. ~~Geração do PDF do orçamento~~ (feito, no layout novo; faltam o logo, o prazo e a garantia
   em `apps/api/src/conteudo/proposta.ts`).
4. ~~SharePoint do cliente (Microsoft Graph)~~ (feito; falta o administrador criar o aplicativo e
   conferir com `npm run sharepoint:conferir`).
5. ~~Atualização em tempo real da fila de validação~~ (feito: polling leve da versão da operação a
   cada 20 s; Supabase Realtime e WebSocket descartados, ver CLAUDE.md).

**Decisão: sem executável do escritório.** O sistema fica só na versão web (o empacotamento em
Electron ou Tauri saiu dos planos): atualização automática a cada publicação, nenhuma instalação
nos PCs e a mesma versão para todos.

**Sem executável (não aplicável):** um app empacotado abriria os arquivos por `file://`, o que
exigiria trocar o roteador por HashRouter e liberar CORS para a API em outra origem. Na versão
web, o escritório é servido pela própria API (mesma origem): `createBrowserRouter` continua
e não há CORS no navegador.
