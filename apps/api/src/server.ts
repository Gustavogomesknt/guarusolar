import 'dotenv/config';
import './lib/zod-pt'; // mensagens de validação em português; antes de qualquer rota
import { situacaoDoModeloDaProposta } from './lib/pdf-orcamento';
import express from 'express';
import cors from 'cors';
import { tratadorDeErros } from './lib/erros';
import { rotasAuth } from './rotas/auth';
import { rotasClientes } from './rotas/clientes';
import { rotasProdutos } from './rotas/produtos';
import { rotasOrcamentos } from './rotas/orcamentos';
import { rotasOrcamentoPdf } from './rotas/orcamentoPdf';
import { rotasAgenda, rotasTecnico, rotasValidacao } from './rotas/operacao';
import { rotasArmazenamento, rotasFotos, rotasVideos } from './rotas/fotos';
import { rotasProjetos } from './rotas/projetos';
import { rotasUsuarios } from './rotas/usuarios';
import { rotasTiposDeServico } from './rotas/tiposDeServico';
import { rotasVisitas } from './rotas/visitas';
import { appTecnicoLiberado, conferirArmazenamentoAoIniciar, destinoAtual } from './lib/armazenamento';
import { cabecalhosDeSeguranca, servirAppsWeb } from './lib/appsWeb';
import { prisma } from './lib/prisma';
import { sincronizarRoteiroDeFotos } from './lib/roteiroDeFotos';
import { bancoDeProducao } from './lib/ambienteDoBanco';
import { conferirVersaoDoApp } from './lib/versaoDoApp';

const PRODUCAO = process.env.NODE_ENV === 'production';

// Armazenamento mal configurado NÃO impede a API de subir: ela sobe em modo degradado (não recebe
// fotos) e grita no log. Único motivo para não subir: faltar o JWT_SECRET (lib/auth.ts).
conferirArmazenamentoAoIniciar(() => bancoDeProducao(prisma));

const app = express();

// IP de quem chama (limite de tentativas de login). Atrás de proxy (hospedagem, Cloudflare),
// TRUST_PROXY diz quantos saltos confiar no X-Forwarded-For; sem isso, todos chegam com o IP
// do proxy. Nunca "true": qualquer um poderia inventar o próprio IP no cabeçalho.
const saltosDeProxy = Number(process.env.TRUST_PROXY ?? 0);
if (Number.isInteger(saltosDeProxy) && saltosDeProxy > 0) app.set('trust proxy', saltosDeProxy);

app.use(cabecalhosDeSeguranca(PRODUCAO));
app.use(
  cors({
    origin: (process.env.CORS_ORIGINS ?? 'http://localhost:5173').split(','),
  }),
);
app.use(express.json({ limit: '2mb' }));

// Nada de pasta pública de arquivos: as fotos só saem por /api/fotos/:id, com login (rotas/fotos.ts).

/**
 * Saúde, usada pela Render para liberar uma versão nova: só responde 200 se alcança o banco.
 * Uma versão que não fala com o banco não recebe tráfego (a anterior continua atendendo).
 * `producao`: o banco tem a marca de produção (db:marcar-producao). Confere, sem expor o
 * endereço, que a hospedagem aponta para o banco certo; o workflow Publicar exige true.
 */
app.get('/saude', async (req, res) => {
  // /saude?ping=1: "está de pé?", SEM tocar no banco (não gasta conexão do pool). É o que os apps
  // chamam enquanto o servidor acorda e o que um monitor externo pode chamar de tempos em tempos.
  if (req.query.ping !== undefined) return void res.set('Cache-Control', 'no-store').json({ ok: true, ping: true });
  // RENDER_GIT_COMMIT: a Render informa o commit publicado (o workflow Publicar confere por ela)
  const versao = process.env.VERSAO ?? process.env.RENDER_GIT_COMMIT ?? 'desenvolvimento';
  try {
    const producao = await Promise.race([
      bancoDeProducao(prisma),
      new Promise<never>((_ok, falhar) => setTimeout(() => falhar(new Error('tempo esgotado')), 3000)),
    ]);
    // `fotos`: onde as fotos novas são gravadas e se a API as está recebendo (em produção, só com
    // armazenamento persistente). Responde "por que o app de campo não aceita fotos?" sem abrir o painel.
    const fotos = { destino: destinoAtual(), recebendo: appTecnicoLiberado() };
    // modelo da proposta em uso; `recusado` = pediram o novo e a trava segurou (padrões em branco)
    const { modelo, recusado } = situacaoDoModeloDaProposta();
    const proposta = { modelo, ...(recusado ? { recusado } : {}) };
    res.set('Cache-Control', 'no-store').json({ ok: true, banco: 'ok', producao, fotos, proposta, versao, hora: new Date().toISOString() });
  } catch (erro) {
    console.error(`[saude] banco inacessível: ${(erro as Error).message}`);
    res.status(503).set('Cache-Control', 'no-store').json({ ok: false, banco: 'inacessível', versao });
  }
});

// app de campo antigo demais (service worker com a versão guardada): 426 antes de qualquer rota
app.use('/api', conferirVersaoDoApp);
app.use('/api/auth', rotasAuth);
app.use('/api/clientes', rotasClientes);
app.use('/api/produtos', rotasProdutos);
app.use('/api/tipos-de-servico', rotasTiposDeServico);
// antes das rotas com login: o PDF é aberto pelo cliente final, com token no link
app.use('/api/orcamentos', rotasOrcamentoPdf);
app.use('/api/orcamentos', rotasOrcamentos);
app.use('/api/agenda', rotasAgenda);
app.use('/api/validacao', rotasValidacao);
app.use('/api/tecnico', rotasTecnico);
app.use('/api/fotos', rotasFotos);
app.use('/api/armazenamento', rotasArmazenamento);
app.use('/api/videos', rotasVideos);
app.use('/api/projetos', rotasProjetos);
app.use('/api/visitas', rotasVisitas);
app.use('/api/usuarios', rotasUsuarios);

app.use('/api', (_req, res) => res.status(404).json({ erro: 'Rota não encontrada' }));

// Em produção, a mesma API entrega o escritório (/) e o app dos técnicos (/campo/).
if (PRODUCAO || process.env.SERVIR_APPS === 'sim') servirAppsWeb(app);

app.use((_req, res) => res.status(404).json({ erro: 'Não encontrado' }));
app.use(tratadorDeErros);

const porta = Number(process.env.PORT ?? 3333);
app.listen(porta, () => console.log(`API da Guarusolar rodando em http://localhost:${porta}`));
// pediram o modelo novo da proposta com padrões em branco: fica no atual, e o motivo aparece aqui
{
  const { recusado } = situacaoDoModeloDaProposta();
  if (recusado) console.error(`[proposta] ${recusado}`);
}

// O roteiro de fotos de cada tipo de serviço é editado no código (compartilhado/roteiroDoServico.ts):
// ao subir, a tabela ChecklistFoto é acertada por ele. Sem travar a subida.
sincronizarRoteiroDeFotos(prisma)
  .then((mudancas) => mudancas && console.log(`[roteiro] checklist de fotos atualizado pelo código: ${mudancas} item(ns).`))
  .catch((erro) => console.error(`[roteiro] não foi possível atualizar o checklist de fotos: ${(erro as Error).message.split('\n').pop()}`));

// Produção ligada num banco sem a marca de produção = string de conexão errada (ex.: a de
// desenvolvimento). Não derruba a API, mas grita no log; o /saude mostra producao: false.
if (process.env.NODE_ENV === 'production') {
  bancoDeProducao(prisma)
    .then((marcado) => {
      if (!marcado) console.error('[banco] ATENÇÃO: NODE_ENV=production, mas o banco NÃO tem a marca de produção. Confira DATABASE_URL.');
    })
    .catch(() => {});
}
