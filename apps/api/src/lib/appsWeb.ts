import { existsSync } from 'node:fs';
import path from 'node:path';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';

/*
 * Em produção a API também entrega os dois apps (mesmo endereço: sem CORS no navegador):
 *   /        escritório (comercial e gestor)
 *   /campo/  app dos técnicos (PWA; compilado com base "/campo/")
 * Quando houver domínio próprio, cada app pode ganhar o seu endereço.
 *
 * Cache: arquivos em assets/ têm o hash no nome -> 1 ano, imutáveis. index.html, sw.js,
 * manifest e o resto -> sempre revalidados (no-cache). Errar isso prende o técnico numa
 * versão velha: o aviso "Nova versão disponível" depende de o sw.js ser buscado de novo.
 */

const PASTA_DOS_APPS = path.resolve(__dirname, '..', '..', '..');
export const PREFIXO_TECNICO = '/campo';

function estaticos(pasta: string) {
  return express.static(pasta, {
    index: false,
    setHeaders: (res, arquivo) => {
      const comHash = arquivo.split(path.sep).includes('assets');
      res.setHeader('Cache-Control', comHash ? 'public, max-age=31536000, immutable' : 'no-cache');
    },
  });
}

/**
 * Navegação de página (não arquivo nem API): devolve o index.html do app.
 * Só para pedidos de HTML e caminhos sem extensão: um script que não existe mais (página
 * antiga aberta depois de uma publicação) recebe 404, não um HTML que quebraria a tela.
 */
function paginaDoApp(indice: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const navegacao = req.method === 'GET' && (req.headers.accept ?? '').includes('text/html');
    if (!navegacao || path.extname(req.path) !== '' || req.path.startsWith('/api/')) return next();
    res.set('Cache-Control', 'no-cache').sendFile(indice);
  };
}

export function servirAppsWeb(app: Express) {
  const escritorio = path.join(PASTA_DOS_APPS, 'escritorio', 'dist');
  const tecnico = path.join(PASTA_DOS_APPS, 'tecnico', 'dist');
  for (const [nome, pasta] of [['escritório', escritorio], ['técnico', tecnico]]) {
    if (!existsSync(path.join(pasta, 'index.html'))) throw new Error(`Build do app do ${nome} não encontrado em ${pasta}: rode npm run build.`);
  }

  // /campo -> /campo/ (o app do técnico é compilado para morar em /campo/). Só o caminho exato:
  // no Express, uma rota "/campo" também casaria com "/campo/" e o redirecionamento viraria loop.
  app.use((req, res, next) => {
    if (req.path !== PREFIXO_TECNICO) return next();
    const consulta = req.originalUrl.slice(req.path.length);
    res.redirect(301, `${PREFIXO_TECNICO}/${consulta}`);
  });
  app.use(PREFIXO_TECNICO, estaticos(tecnico), paginaDoApp(path.join(tecnico, 'index.html')));
  app.use(estaticos(escritorio), paginaDoApp(path.join(escritorio, 'index.html')));
}

/** Cabeçalhos básicos de segurança para tudo que a API entrega. */
export function cabecalhosDeSeguranca(producao: boolean) {
  return (_req: Request, res: Response, next: NextFunction) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      // o app do técnico usa câmera (pelo seletor de arquivo) e localização; nada além
      'Permissions-Policy': 'camera=(self), geolocation=(self), microphone=(), payment=()',
    });
    // só com HTTPS garantido (produção na Render, que só atende em https)
    if (producao) res.set('Strict-Transport-Security', 'max-age=31536000');
    next();
  };
}
