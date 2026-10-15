import type { NextFunction, Request, Response } from 'express';
import {
  AVISO_APP_DESATUALIZADO,
  CABECALHO_VERSAO_DO_APP,
  CODIGO_APP_DESATUALIZADO,
  STATUS_APP_DESATUALIZADO,
  VERSAO_MINIMA_DO_APP_DE_CAMPO,
} from '@guarusolar/compartilhado';
import { prisma } from './prisma';

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

const UMA_HORA = 60 * 60 * 1000;
/** Última gravação feita por ESTE processo, por usuário (reiniciar a API grava uma vez de novo). */
const ultimaGravacao = new Map<string, { versao: number; em: number }>();

/**
 * Guarda no usuário a versão do app de campo que ele está usando (Usuario.versaoAppCampo e
 * versaoAppCampoEm), para a tela de Usuários mostrar quem já atualizou antes de subir a mínima.
 * Chamado pelo autenticar, depois de conferir a sessão (que fica em memória: nenhuma consulta a
 * mais). Grava só quando a versão muda ou quando passou uma hora; escrita direta, que não mexe no
 * editadoEm, sem o pedido esperar por ela e sem derrubá-lo se falhar.
 */
export function registrarVersaoVista(req: Request, usuarioId: string) {
  const cabecalho = req.get(CABECALHO_VERSAO_DO_APP);
  if (cabecalho === undefined) return; // escritório, ou app anterior ao cabeçalho
  const versao = Number.parseInt(cabecalho, 10);
  if (!Number.isInteger(versao) || versao < 0 || versao > 1_000_000) return;
  const agora = Date.now();
  const ultima = ultimaGravacao.get(usuarioId);
  if (ultima && ultima.versao === versao && agora - ultima.em < UMA_HORA) return;
  ultimaGravacao.set(usuarioId, { versao, em: agora });
  prisma.$executeRaw`update "Usuario" set "versaoAppCampo" = ${versao}, "versaoAppCampoEm" = now() where id = ${usuarioId}`.catch((erro) => {
    ultimaGravacao.delete(usuarioId); // tenta de novo no próximo pedido
    console.error(`[versão do app] não gravada para ${usuarioId}: ${(erro as Error).message.split('\n').pop()}`);
  });
}
