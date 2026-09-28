import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

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
  if (erro instanceof ErroHttp) {
    return res.status(erro.status).json({ erro: erro.message });
  }
  console.error(erro);
  return res.status(500).json({ erro: 'Erro interno do servidor' });
}
