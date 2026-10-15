# SOCORRO — o que fazer quando o sistema der problema

Guia para quem **não é desenvolvedor**. Siga na ordem. Na dúvida, não apague nada e ligue para
os contatos do fim desta página.

**Endereços que você vai usar**

| O quê | Onde |
|---|---|
| Sistema | `https://guarusolar.onrender.com` _(confirme: [ENDEREÇO DO SISTEMA])_ |
| Situação do sistema | o endereço acima com `/saude` no fim |
| Painel da hospedagem (Render) | https://dashboard.render.com → serviço **guarusolar** |
| Painel do banco (Supabase) | https://supabase.com/dashboard → projeto **guarusolar-producao** |
| Backups e publicação (GitHub) | https://github.com/Gustavogomesknt/guarusolar → aba **Actions** |
| Render fora do ar no mundo? | https://status.render.com |
| Supabase fora do ar no mundo? | https://status.supabase.com |

As senhas desses painéis ficam em: **[ONDE ESTÃO AS SENHAS: gerenciador de senhas / cofre]**.

---

## 1. O sistema não abre

1. **Espere 1 minuto.** O plano gratuito "dorme" depois de 15 minutos sem uso, e a primeira
   abertura demora de 30 a 60 segundos. A tela mostra "Conectando ao servidor…". **Não fique
   recarregando**: isso não acelera.
2. Passou de 2 minutos? Abra o endereço com **`/saude`** no fim:
   - `"ok":true,"banco":"ok"` → o sistema está no ar. O problema é na máquina de quem está
     usando: teste a internet, outro navegador, outra pessoa.
   - `"banco":"inacessível"` → o sistema está no ar, mas **o banco não responde**. Vá ao item 3.
   - a página nem carrega → vá ao passo 3.
3. Veja https://status.render.com. Se a Render estiver com problema, **não há o que fazer**:
   espere eles resolverem.
4. Abra o painel da Render, serviço **guarusolar**. No topo aparece a situação:
   - **Live** (verde): está no ar. Volte ao passo 2 depois de 1 minuto.
   - **Failed** / **Deploy failed**: uma publicação deu errado. A versão anterior costuma seguir
     no ar; se não, vá ao item 4.
   - **Suspended**: a conta foi suspensa (pagamento, uso). Ligue para o desenvolvedor.

## 2. Erro ao salvar ou ao entrar

Primeiro, a mensagem na tela:

| Mensagem | O que é | O que fazer |
|---|---|---|
| "Sessão expirada, faça login novamente" | normal: o login vence (12 h no escritório, 7 dias no celular) | entrar de novo |
| "Sua sessão terminou. Entre de novo." | o login acabou ou o usuário foi desativado | entrar de novo; se não entrar, item 6 (`listar` mostra quem está desativado) |
| "E-mail ou senha inválidos" | senha ou e-mail errado | conferir; se esqueceu a senha, item 6 |
| "Muitas tentativas de entrar. Tente de novo em …" | depois de vários erros, o login trava por alguns minutos (proteção) | esperar o tempo indicado |
| "Seu usuário não tem acesso a esta função" | a pessoa não tem permissão para aquela tela | normal; não é defeito |
| "Não foi possível falar com o banco de dados agora" | o sistema está no ar, mas o banco não respondeu | esperar 1 minuto e tentar de novo; se continuar, item 3 |
| "Este registro não foi encontrado" | outra pessoa alterou ou mudou aquele registro ao mesmo tempo | recarregar a tela (F5) |
| "O servidor encontrou um problema. Tente de novo em instantes…" | erro inesperado no servidor | tentar de novo; se repetir, ver os logs (abaixo) |

**Ver os logs:** painel da Render → serviço **guarusolar** → **Logs**. Use a busca do próprio
painel. O que procurar:

| Aparece no log | Significa | O que fazer |
|---|---|---|
| `[saude] banco inacessível` ou `Can't reach database server` | o banco não responde | item 3 (Supabase pausado) ou status.supabase.com |
| "O espaço das fotos do sistema está cheio" (no celular do técnico) | o espaço das fotos chegou a 95% do teto | ligue para o desenvolvedor (README, "Espaço das fotos") |
| `Tenant or user not found` | banco pausado ou senha do banco trocada | item 3; se não for pausa, ligue para o desenvolvedor |
| `Authentication failed ... credentials for ... are not valid` | o banco recusou a senha da string de conexão (num comando rodado no computador) | rodar `npm run db:diagnostico` na mesma janela; conferir a senha; depois de várias recusas o Supabase bloqueia o IP por um tempo |
| `[banco] ATENÇÃO: ... NÃO tem a marca de produção` | o sistema está ligado no banco errado | **pare** e ligue para o desenvolvedor |
| `login_falhou`, `login_bloqueado` | alguém errou a senha (normal em pequena quantidade) | só preocupe se forem dezenas seguidas |
| `AS FOTOS NÃO ESTÃO SENDO ARMAZENADAS` (bloco com `####`) | a hospedagem perdeu a configuração de onde guardar as fotos | **é problema**: item 7 |

## 3. O Supabase pausou

O plano gratuito **pausa o banco depois de 1 semana sem uso** (ex.: férias coletivas).

1. Abra o painel do Supabase, projeto **guarusolar-producao**. Se aparecer "Paused", clique
   em **Restore project** (ou "Resume").
2. Leva **alguns minutos** (normalmente de 2 a 10). Espere a tela dizer que está ativo.
3. Abra o sistema e o `/saude` de novo. Deve voltar `"banco":"ok"`.

Se o painel disser que não dá mais para reativar (pausado há meses), é o item 5: restaurar o
backup num projeto novo.

## 4. Publicamos algo que quebrou

1. Painel da Render → serviço **guarusolar** → **Events**.
2. Ache a publicação anterior que estava boa (data e hora antes do problema) e clique em
   **Rollback**. Em cerca de 1 minuto a versão antiga volta. Confira o `/saude`.

**Quando o Rollback NÃO resolve:** ele volta o programa, mas **não volta o banco**. Se a
publicação mudou a estrutura do banco de um jeito que a versão antiga não entende, a antiga
também vai dar erro. Pelas nossas regras, as mudanças de banco só **acrescentam**, então isso
não deveria acontecer. Se acontecer (o Rollback termina e os erros continuam), **ligue para o
desenvolvedor**: a saída é corrigir para frente ou restaurar o backup (item 5).

## 5. Preciso restaurar um backup

Use só se o banco se perdeu ou ficou corrompido. **Tudo que foi feito depois do backup se
perde** (o backup é feito toda madrugada, às 3h: no pior caso, perde-se o dia).

Você vai precisar da **senha dos backups** (`BACKUP_SENHA`), guardada em:
**[ONDE ESTÁ A SENHA DOS BACKUPS: dois lugares]**. Sem ela, nenhum backup abre.

1. **Criar um banco novo:** supabase.com → **New project**, nome `guarusolar-producao-2`,
   região **South America (São Paulo)**, senha nova (anote no gerenciador). Quando terminar:
   **Connect** → **Session pooler** → copie o endereço e troque `[YOUR-PASSWORD]` pela senha.
2. **Entregar o endereço ao GitHub:** repositório → **Settings → Secrets and variables →
   Actions → New repository secret**. Nome: `RESTAURAR_DESTINO_URL`. Valor: o endereço do passo 1.
3. **Restaurar:** aba **Actions → Restaurar backup → Run workflow**. Em **destino**, escolha
   **banco-novo**. Deixe "execucao" vazio (usa o backup mais recente). Clique em **Run workflow**.
   Fica verde em 1 a 2 minutos; no fim da página aparece o resumo com as tabelas.
4. **Ligar o sistema no banco novo:** painel da Render → serviço **guarusolar** →
   **Environment**: troque `DATABASE_URL` e `DIRECT_URL` pelo endereço do passo 1 e salve
   (**Save, rebuild and deploy**). No GitHub, troque também o segredo `PRODUCAO_DATABASE_URL`.
5. Confira o `/saude`: deve mostrar `"banco":"ok"` e `"producao":true`.
6. Apague o segredo `RESTAURAR_DESTINO_URL` no GitHub.

O GitHub guarda os backups por 14 dias (o do dia 1º de cada mês, por 90). Se o GitHub também
não estiver disponível, existe a cópia mensal guardada em **[ONDE FICA A CÓPIA MENSAL]**: essa
restauração precisa do desenvolvedor.

## 6. Esqueci a senha de alguém / preciso criar um usuário

**Pela tela (caminho normal).** Precisa de alguém com o papel **Administrador**.

1. Entre no sistema → menu **Administração › Usuários**.
2. Conforme o caso:
   - **Esqueceu a senha:** na linha da pessoa, **Nova senha**.
   - **Pessoa nova:** **Novo usuário** → nome, e-mail (é o login), papel e, para técnico, a
     equipe → **Criar e gerar senha**.
   - **Mudou de função:** **Editar** → troque o papel ou a equipe → **Salvar**. A pessoa precisa
     entrar de novo.
   - **Saiu da empresa:** **Desativar** (pede confirmação). Ela sai do sistema na hora; nada é
     apagado e dá para **Reativar** depois.
3. A senha aparece **uma vez só**: clique em **Copiar** e mande à pessoa por mensagem
   particular. Se perder, gere outra com **Nova senha**. No primeiro acesso, o sistema pede
   para a pessoa criar a própria senha.

O sistema não deixa o Administrador desativar a si mesmo nem tirar o próprio acesso, e sempre
sobra pelo menos um Administrador ativo.

**Alternativa por comando** (se nenhum Administrador conseguir entrar). Precisa de um computador
com a pasta do projeto (**[QUAL COMPUTADOR: ex. o do Gustavo]**):

1. Abra o **PowerShell** dentro da pasta do projeto (`guarusolar-api`).
2. Ligue a janela no banco de produção (o endereço é o do Supabase, item 5 passo 1; a senha
   do banco está no gerenciador). Troque `<ENDEREÇO>` e mantenha as aspas simples:
   ```powershell
   $env:DATABASE_URL = '<ENDEREÇO>'; $env:DIRECT_URL = $env:DATABASE_URL
   ```
3. Rode o que precisar:
   ```powershell
   npm run usuario -- listar
   npm run usuario -- nova-senha --email pessoa@guarusolar.com.br
   npm run usuario -- criar --nome "Nome Sobrenome" --email pessoa@guarusolar.com.br --papel ADMIN
   npm run usuario -- desativar --email pessoa@guarusolar.com.br
   ```
   Papéis: `ADMIN`, `COMERCIAL`, `GESTOR`, `TECNICO` (precisa de `--equipe "Equipe A"`). A
   primeira linha da resposta deve dizer **Banco: PRODUÇÃO**.
4. **Feche a janela** do PowerShell ao terminar.

## 7. Técnico não consegue enviar foto, ou o app de campo reclama de armazenamento

Sinais: o técnico vê "As fotos ainda não estão sendo recebidas" ou "Aguardando o servidor: N fotos
na fila" que não anda; no escritório aparece a faixa vermelha "As fotos não estão sendo
armazenadas". **As fotos não se perdem**: ficam guardadas no celular do técnico e sobem sozinhas
quando isto for resolvido. Peça para ele não limpar os dados do navegador nem desinstalar o app.

1. Abra o endereço do sistema com **`/saude`** no fim e procure `"fotos"`:
   - `"recebendo":true` → o armazenamento está certo. O problema é o sinal do celular ou o espaço
     das fotos (mensagem "espaço cheio": tabela do item 2).
   - `"recebendo":false` → a hospedagem está sem a configuração das fotos. Siga.
2. Painel da Render → serviço **guarusolar** → **Environment**. Confira:
   - se `STORAGE_PROVIDER` é `s3` (ou `r2`, que é o mesmo): `S3_ENDPOINT`, `S3_REGION`,
     `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` e `S3_BUCKET` têm de estar preenchidas;
   - se `STORAGE_PROVIDER` é `supabase`: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` e `SUPABASE_BUCKET`
     têm de estar preenchidas;
   - qualquer outro valor em `STORAGE_PROVIDER` está errado.
   O log da Render diz qual variável falta (bloco `AS FOTOS NÃO ESTÃO SENDO ARMAZENADAS`).
   Corrija o que estiver diferente e salve.
3. **Republique**: GitHub → **Actions** → **Publicar** → **Run workflow** (ou, no painel da Render,
   **Manual Deploy**). Espere terminar.
4. Abra o `/saude` de novo: tem de mostrar `"recebendo":true`. A faixa vermelha some sozinha em
   até 10 minutos (ou recarregando a página) e as fotos dos celulares começam a subir.
5. Se `STORAGE_PROVIDER` voltar sozinho para outro valor, ou a publicação falhar, ligue para o
   desenvolvedor.

## 8. Trocar onde as fotos ficam guardadas (do Supabase para o Backblaze B2)

Para quê: o Supabase gratuito guarda cerca de 1 GB; o Backblaze B2 guarda 10 GB sem custo e não
pede cartão no cadastro. **Faça com o desenvolvedor na linha.** Nenhuma foto se perde em nenhum
passo: a troca só muda onde as fotos NOVAS entram, e as antigas continuam abrindo de onde estão.

Os valores anotados abaixo vão para o cofre de senhas e para a Render. **Nunca por mensagem, e-mail
ou chat.**

**A. No painel do Backblaze (uma vez)**

1. Crie a conta em backblaze.com (produto **B2 Cloud Storage**). No cadastro há a escolha da
   **região** onde os arquivos ficam: ela não muda depois. Não é pedido cartão.
2. **Buckets → Create a Bucket**: um nome só seu (letras minúsculas, números e hífen; o nome é
   único no mundo inteiro, então `guarusolar-fotos` pode já existir: use outro, qualquer um serve).
   **Files in Bucket are: Private.** Object Lock: desligado. **Anote o nome** (`S3_BUCKET`).
3. No cartão do bucket aparece **Endpoint**, algo como `s3.us-west-004.backblazeb2.com`.
   **Anote**: é o `S3_ENDPOINT` (com `https://` na frente). O trecho do meio (`us-west-004`) é a
   `S3_REGION`. Os dois têm de combinar: a região entra na assinatura de cada pedido.
4. No mesmo cartão, **Lifecycle Settings → Keep only the last version of the file**. Sem isso o
   B2 guarda para sempre as versões antigas de cada arquivo regravado ou apagado, e o espaço
   ocupado fica acima do que o sistema mede.
5. **Application Keys → Add a New Application Key**: um nome (ex.: `guarusolar-api`); **Allow
   access to Bucket(s)**: só o bucket das fotos; **Type of Access: Read and Write**; o resto em
   branco. Ao criar, a tela mostra **keyID** (`S3_ACCESS_KEY_ID`) e **applicationKey**
   (`S3_SECRET_ACCESS_KEY`) UMA única vez: guarde os dois no cofre de senhas na hora. **Não use a
   "Master Application Key"**: ela não funciona nesta forma de acesso.

**B. Na Render e no computador**

6. Render → serviço **guarusolar** → **Environment**: preencha `S3_ENDPOINT`, `S3_REGION`,
   `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` e `S3_BUCKET`. **Não apague as `SUPABASE_*`** e não
   mexa em `STORAGE_PROVIDER` ainda.
7. Numa janela do PowerShell, na pasta do sistema, defina as mesmas cinco variáveis (entre aspas
   SIMPLES, como no item 6) e rode **`npm run s3:conferir`**. Tem de terminar em "Tudo certo".
   Se parar num passo, a mensagem diz qual valor conferir (o primeiro passo é a região).
8. O desenvolvedor troca `STORAGE_PROVIDER` para `s3` **no arquivo `render.yaml`** (mudar só no
   painel não basta: a Render devolve o valor do arquivo). Faça o **Backup** (Actions → Backup do
   banco) e depois **Actions → Publicar**.
9. Abra o `/saude`: tem de mostrar `"fotos":{"destino":"s3","recebendo":true}`. Daqui em diante as
   fotos novas vão para o B2; as antigas continuam abrindo do Supabase.

**C. Levar as fotos antigas (a migração)**

10. Numa janela do PowerShell ligada ao banco de produção (como no item 6), com as três
    `SUPABASE_*`, as cinco `S3_*` e `$env:STORAGE_PROVIDER='s3'`, rode **`npm run fotos:migrar`**:
    ele só MOSTRA quantas fotos há a levar, sem mexer em nada. Sem a `STORAGE_PROVIDER` na janela
    ele se recusa e diz o que falta: nunca rode sem ela (já levou as fotos de produção para o
    disco de um PC, por engano).
11. Rode **`npm run fotos:migrar -- --executar`**. Cada foto é copiada para o B2 com o mesmo nome,
    conferida, e só então o sistema passa a buscá-la lá. No fim aparece a linha
    `RESULTADO: movidas N, falhas N, já estavam no destino N`.
12. Se houver falhas (queda de internet, por exemplo), **rode o mesmo comando de novo**: ele pode
    ser repetido quantas vezes for preciso, não duplica nada e só tenta o que faltou. Está pronto
    quando disser `falhas 0` e "A migrar para s3: 0".
13. Confira no sistema: abra a Validação e a ficha de dois ou três projetos antigos e veja as fotos.
14. **Não apague nada do Supabase por enquanto.** As cópias antigas ficam lá, intocadas, como
    reserva. Semanas depois, com tudo conferido, o desenvolvedor decide esvaziar o bucket antigo.

Para **voltar atrás** antes da migração: `STORAGE_PROVIDER` de volta a `supabase` no `render.yaml`
e Publicar. As fotos que entraram no B2 nesse meio-tempo continuam abrindo de lá enquanto as
`S3_*` estiverem na Render.

O mesmo roteiro serve para outro serviço compatível com S3 (o Cloudflare R2, por exemplo): mudam
só o painel onde se cria o bucket e os valores de `S3_ENDPOINT` e `S3_REGION`.

## 9. Vídeo: o técnico não consegue enviar, ou o gestor não consegue assistir

O vídeo dos serviços não passa pela API: o celular o envia **direto ao Backblaze B2**, por um link
que vale poucos minutos. Para o navegador do celular poder fazer isso, o bucket precisa de uma
**regra de CORS** que libere o envio (PUT) a partir do endereço do sistema. Sem ela, o vídeo fica
guardado no celular, na fila, e não sobe (as fotos continuam normais).

1. **Confira primeiro** numa janela do PowerShell com as cinco `S3_*` (como no item 8) e mais o
   endereço do sistema, sem barra no fim:
   `$env:API_URL_PUBLICA='https://<endereço do sistema>'`, depois **`npm run s3:conferir`**.
   O passo "o navegador do app pode enviar direto (CORS de PUT…)" diz se a regra existe.
2. **Criar a regra.** Pelo que sei, as opções prontas do painel do Backblaze (Bucket Settings →
   CORS Rules) liberam só a LEITURA; o envio precisa de uma regra personalizada, feita pela
   ferramenta de linha de comando do Backblaze (`b2`), com uma chave que possa alterar o bucket
   (a "Master Application Key" ou uma com permissão `writeBuckets`, que você usa só na sua
   janela, nunca na Render). O comando é parecido com este (troque os dois valores entre `< >`):

   `b2 bucket update --cors-rules '[{"corsRuleName":"envioDeVideo","allowedOrigins":["https://<endereço do sistema>"],"allowedOperations":["s3_put","s3_get","s3_head"],"allowedHeaders":["content-type"],"exposeHeaders":["etag"],"maxAgeSeconds":3600}]' <nome do bucket> allPrivate`

   O `allPrivate` no fim mantém o bucket PRIVADO: confira que ele continua assim. Os nomes dos
   parâmetros podem ter mudado na versão da ferramenta; o `npm run s3:conferir` do passo 1 é a
   prova de que deu certo.
3. **O gestor não consegue assistir:** o link de leitura vale 5 minutos. Feche o vídeo e abra de
   novo, que sai um link novo. Se nem assim tocar, rode o `npm run s3:conferir` do passo 1.

## 10. Quem contatar

| Quem | Para quê | Contato |
|---|---|---|
| Desenvolvedor | qualquer coisa fora deste guia | **[NOME · TELEFONE · E-MAIL]** |
| Responsável na Guarusolar | decidir, avisar a equipe, dados da empresa | **[NOME · TELEFONE · E-MAIL]** |

---

## É normal, não é problema

- **A primeira abertura depois de um tempo parado demora até 1 minuto** ("Conectando ao
  servidor…"). É o plano gratuito da hospedagem.
- **O PDF da proposta mostra `[PRAZO]` e `[GARANTIA]`.** São textos que ainda não foram
  preenchidos pelo desenvolvedor; não é erro do orçamento.
- **O sistema às vezes desconecta e pede login.** O acesso vence sozinho (12 horas no
  escritório, 7 dias no celular).
- **Itens no histórico do projeto com o selo "Reconstruído".** São registros montados a partir
  de dados antigos, de antes de o histórico existir.
