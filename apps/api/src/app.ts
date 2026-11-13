import './lib/zod-pt'; // mensagens de validação em português; antes de qualquer rota
import { modeloDaProposta } from './lib/pdf-orcamento';
import { artesQueFaltam, linhaDeCondicoesQuePassa } from './lib/pdf-proposta-nova';
import express, { type Router } from 'express';
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
import { appTecnicoLiberado, destinoAtual } from './lib/armazenamento';
import { cabecalhosDeSeguranca, servirAppsWeb } from './lib/appsWeb';
import { prisma } from './lib/prisma';
import { bancoDeProducao } from './lib/ambienteDoBanco';
import { conferirVersaoDoApp } from './lib/versaoDoApp';


const PRODUCAO = process.env.NODE_ENV === 'production';

/**
 * Os roteadores da API e onde cada um é montado, NA ORDEM (o do PDF, público, vem antes do de
 * orçamentos, que exige login). Lista única: o criarApp monta por ela e a conferência das rotas
 * (lib/conferencia-rotas.ts, roda no build) lê por ela todas as rotas da API.
 */
export const MONTAGENS: { caminho: string; roteador: Router }[] = [
  { caminho: '/api/auth', roteador: rotasAuth },
  { caminho: '/api/clientes', roteador: rotasClientes },
  { caminho: '/api/produtos', roteador: rotasProdutos },
  { caminho: '/api/tipos-de-servico', roteador: rotasTiposDeServico },
  { caminho: '/api/orcamentos', roteador: rotasOrcamentoPdf },
  { caminho: '/api/orcamentos', roteador: rotasOrcamentos },
  { caminho: '/api/agenda', roteador: rotasAgenda },
  { caminho: '/api/validacao', roteador: rotasValidacao },
  { caminho: '/api/tecnico', roteador: rotasTecnico },
  { caminho: '/api/fotos', roteador: rotasFotos },
  { caminho: '/api/armazenamento', roteador: rotasArmazenamento },
  { caminho: '/api/videos', roteador: rotasVideos },
  { caminho: '/api/projetos', roteador: rotasProjetos },
  { caminho: '/api/visitas', roteador: rotasVisitas },
  { caminho: '/api/usuarios', roteador: rotasUsuarios },
];

/**
 * O app inteiro (rotas, segurança, erros), sem abrir porta e sem os avisos de quando a API sobe:
 * o server.ts sobe a API com ele; a conferência das rotas o monta só para listar as rotas.
 */
export function criarApp() {
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
      // modelo da proposta em uso (PROPOSTA_MODELO); `artesFaltando`: só os arquivos do modelo novo
      // que faltam na pasta; `linhaDeCondicoesLonga`: a linha de condições da página 2 passa de uma
      // linha (avisos; o PDF sai igual)
      const artesFaltando = artesQueFaltam();
      const linhaDeCondicoesLonga = linhaDeCondicoesQuePassa();
      const proposta = {
        modelo: modeloDaProposta(),
        ...(artesFaltando.length > 0 ? { artesFaltando } : {}),
        ...(linhaDeCondicoesLonga ? { linhaDeCondicoesLonga } : {}),
      };
      res.set('Cache-Control', 'no-store').json({ ok: true, banco: 'ok', producao, fotos, proposta, versao, hora: new Date().toISOString() });
    } catch (erro) {
      console.error(`[saude] banco inacessível: ${(erro as Error).message}`);
      res.status(503).set('Cache-Control', 'no-store').json({ ok: false, banco: 'inacessível', versao });
    }
  });

  // app de campo antigo demais (service worker com a versão guardada): 426 antes de qualquer rota
  app.use('/api', conferirVersaoDoApp);
  for (const m of MONTAGENS) app.use(m.caminho, m.roteador);
  // antes das rotas com login: o PDF é aberto pelo cliente final, com token no link

  app.use('/api', (_req, res) => res.status(404).json({ erro: 'Rota não encontrada' }));

  // Em produção, a mesma API entrega o escritório (/) e o app dos técnicos (/campo/).
  if (PRODUCAO || process.env.SERVIR_APPS === 'sim') servirAppsWeb(app);

  app.use((_req, res) => res.status(404).json({ erro: 'Não encontrado' }));
  app.use(tratadorDeErros);
  return app;
}
