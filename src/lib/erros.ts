import type { NextFunction, Request, Response } from 'express';
import { MulterError } from 'multer';
import { ZodError } from 'zod';
import { TAMANHO_MAXIMO_FOTO } from './upload';

const MB_MAXIMO_FOTO = (TAMANHO_MAXIMO_FOTO / (1024 * 1024)).toLocaleString('pt-BR', {
  maximumFractionDigits: 1,
});

/** Mensagens para os erros de upload lançados pelo multer (demais códigos: 400). */
const mensagensUpload: Record<string, string> = {
  LIMIT_FILE_SIZE: `A foto passou do tamanho máximo de ${MB_MAXIMO_FOTO} MB. Tire a foto novamente pelo app, que ela é reduzida automaticamente.`,
  LIMIT_FILE_COUNT: 'Envie uma foto por vez.',
  LIMIT_UNEXPECTED_FILE: 'Envie a foto no campo "arquivo".',
  LIMIT_PART_COUNT: 'O envio tem partes demais. Tente enviar a foto novamente.',
  LIMIT_FIELD_KEY: 'Um dos campos enviados tem o nome muito longo.',
  LIMIT_FIELD_VALUE: 'Um dos campos enviados tem o conteúdo muito longo.',
  LIMIT_FIELD_COUNT: 'O envio tem campos demais. Tente enviar a foto novamente.',
};

export class ErroHttp extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Evita try/catch repetido em cada rota assíncrona. */
export const rota =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };

export function tratadorDeErros(
  erro: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (erro instanceof ZodError) {
    return res.status(400).json({
      erro: 'Dados inválidos',
      detalhes: erro.issues.map((i) => ({ campo: i.path.join('.'), mensagem: i.message })),
    });
  }
  if (erro instanceof MulterError) {
    return res.status(erro.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({
      erro: mensagensUpload[erro.code] ?? 'Não foi possível receber a foto. Tente enviar novamente.',
    });
  }
  if (erro instanceof ErroHttp) {
    return res.status(erro.status).json({ erro: erro.message });
  }
  console.error(erro);
  return res.status(500).json({ erro: 'Erro interno do servidor' });
}
