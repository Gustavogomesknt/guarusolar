import type { NextFunction, Request, Response } from 'express';
import {
  AVISO_APP_DESATUALIZADO,
  CABECALHO_VERSAO_DO_APP,
  CODIGO_APP_DESATUALIZADO,
  STATUS_APP_DESATUALIZADO,
  VERSAO_MINIMA_DO_APP_DE_CAMPO,
} from '@guarusolar/compartilhado';

/**
 * Recusa o app de campo mais antigo que a versão mínima (compartilhado/versaoDoAppDeCampo.ts),
 * ANTES de qualquer rota (inclusive antes de receber o arquivo da foto). 426 com o código
 * APP_DESATUALIZADO: o app mostra o aviso de atualizar e a foto fica na fila.
 *
 * Quem é o app de campo: quem manda o cabeçalho X-App-Campo, ou quem chama /api/tecnico sem ele
 * (app instalado antes desta conferência = versão 0). O escritório não manda o cabeçalho e
 * nunca é barrado aqui.
 */
export function conferirVersaoDoApp(req: Request, res: Response, next: NextFunction) {
  const cabecalho = req.get(CABECALHO_VERSAO_DO_APP);
  const doAppDeCampo = cabecalho !== undefined || req.path.startsWith('/tecnico');
  if (!doAppDeCampo) return next();
  const versao = Number.parseInt(cabecalho ?? '0', 10);
  if (Number.isFinite(versao) && versao >= VERSAO_MINIMA_DO_APP_DE_CAMPO) return next();
  res
    .status(STATUS_APP_DESATUALIZADO)
    .set('Cache-Control', 'no-store')
    .json({ erro: AVISO_APP_DESATUALIZADO, codigo: CODIGO_APP_DESATUALIZADO, versaoMinima: VERSAO_MINIMA_DO_APP_DE_CAMPO });
}
