import 'dotenv/config';
import './lib/zod-pt'; // mensagens de validação em português; antes de qualquer rota
import express from 'express';
import cors from 'cors';
import { tratadorDeErros } from './lib/erros';
import { rotasAuth } from './rotas/auth';
import { rotasClientes } from './rotas/clientes';
import { rotasProdutos } from './rotas/produtos';
import { rotasOrcamentos } from './rotas/orcamentos';
import { rotasOrcamentoPdf } from './rotas/orcamentoPdf';
import { rotasAgenda, rotasTecnico, rotasValidacao } from './rotas/operacao';
import { rotasFotos } from './rotas/fotos';
import { rotasProjetos } from './rotas/projetos';
import { rotasUsuarios } from './rotas/usuarios';
import { conferirArmazenamentoAoIniciar } from './lib/armazenamento';
import { cabecalhosDeSeguranca, servirAppsWeb } from './lib/appsWeb';
import { prisma } from './lib/prisma';
import { bancoDeProducao } from './lib/ambienteDoBanco';

const PRODUCAO = process.env.NODE_ENV === 'production';

// armazenamento mal configurado para a API ao subir, com a mensagem (não no primeiro upload em campo)
conferirArmazenamentoAoIniciar();

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
app.get('/saude', async (_req, res) => {
  // RENDER_GIT_COMMIT: a Render informa o commit publicado (o workflow Publicar confere por ela)
  const versao = process.env.VERSAO ?? process.env.RENDER_GIT_COMMIT ?? 'desenvolvimento';
  try {
    const producao = await Promise.race([
      bancoDeProducao(prisma),
      new Promise<never>((_ok, falhar) => setTimeout(() => falhar(new Error('tempo esgotado')), 3000)),
    ]);
    res.set('Cache-Control', 'no-store').json({ ok: true, banco: 'ok', producao, versao, hora: new Date().toISOString() });
  } catch (erro) {
    console.error(`[saude] banco inacessível: ${(erro as Error).message}`);
    res.status(503).set('Cache-Control', 'no-store').json({ ok: false, banco: 'inacessível', versao });
  }
});

app.use('/api/auth', rotasAuth);
app.use('/api/clientes', rotasClientes);
app.use('/api/produtos', rotasProdutos);
// antes das rotas com login: o PDF é aberto pelo cliente final, com token no link
app.use('/api/orcamentos', rotasOrcamentoPdf);
app.use('/api/orcamentos', rotasOrcamentos);
app.use('/api/agenda', rotasAgenda);
app.use('/api/validacao', rotasValidacao);
app.use('/api/tecnico', rotasTecnico);
app.use('/api/fotos', rotasFotos);
app.use('/api/projetos', rotasProjetos);
app.use('/api/usuarios', rotasUsuarios);

app.use('/api', (_req, res) => res.status(404).json({ erro: 'Rota não encontrada' }));

// Em produção, a mesma API entrega o escritório (/) e o app dos técnicos (/campo/).
if (PRODUCAO || process.env.SERVIR_APPS === 'sim') servirAppsWeb(app);

app.use((_req, res) => res.status(404).json({ erro: 'Não encontrado' }));
app.use(tratadorDeErros);

const porta = Number(process.env.PORT ?? 3333);
app.listen(porta, () => console.log(`API da Guarusolar rodando em http://localhost:${porta}`));

// Produção ligada num banco sem a marca de produção = string de conexão errada (ex.: a de
// desenvolvimento). Não derruba a API, mas grita no log; o /saude mostra producao: false.
if (process.env.NODE_ENV === 'production') {
  bancoDeProducao(prisma)
    .then((marcado) => {
      if (!marcado) console.error('[banco] ATENÇÃO: NODE_ENV=production, mas o banco NÃO tem a marca de produção. Confira DATABASE_URL.');
    })
    .catch(() => {});
}
