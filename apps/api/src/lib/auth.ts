import type { NextFunction, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { Papel } from '@prisma/client';
import { ErroHttp } from './erros';

const SEGREDO: string = (() => {
  const segredo = process.env.JWT_SECRET;
  if (!segredo) {
    throw new Error('JWT_SECRET não definido. Configure a variável no .env antes de iniciar a API.');
  }
  return segredo;
})();
const VALIDADE = (process.env.JWT_EXPIRES_IN ?? '12h') as jwt.SignOptions['expiresIn'];
// O técnico trabalha em campo com sinal ruim e fotos na fila: pedir login todo dia faria a
// fila parar no meio do serviço. Por isso o token dele dura mais (os demais seguem com 12h).
const VALIDADE_TECNICO = (process.env.JWT_EXPIRES_IN_TECNICO ?? '7d') as jwt.SignOptions['expiresIn'];

export type UsuarioToken = {
  id: string;
  nome: string;
  papel: Papel;
  equipeId: string | null;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      usuario?: UsuarioToken;
    }
  }
}

export const gerarHash = (senha: string) => bcrypt.hash(senha, 10);
export const conferirSenha = (senha: string, hash: string) => bcrypt.compare(senha, hash);

export const gerarToken = (usuario: UsuarioToken) =>
  jwt.sign(usuario, SEGREDO, {
    expiresIn: usuario.papel === 'TECNICO' ? VALIDADE_TECNICO : VALIDADE,
  });

/** Exige um token válido no cabeçalho Authorization: Bearer <token>. */
export function autenticar(req: Request, _res: Response, next: NextFunction) {
  const cabecalho = req.headers.authorization;
  if (!cabecalho?.startsWith('Bearer ')) {
    throw new ErroHttp(401, 'Faça login para continuar');
  }
  try {
    req.usuario = jwt.verify(cabecalho.slice(7), SEGREDO) as UsuarioToken;
    next();
  } catch {
    throw new ErroHttp(401, 'Sessão expirada, faça login novamente');
  }
}

/**
 * Restringe a rota a determinados papéis.
 * O técnico, por exemplo, só alcança as rotas de /api/tecnico.
 */
export function autorizar(...papeis: Papel[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.usuario) throw new ErroHttp(401, 'Faça login para continuar');
    if (req.usuario.papel === 'ADMIN' || papeis.includes(req.usuario.papel)) return next();
    throw new ErroHttp(403, 'Seu usuário não tem acesso a esta função');
  };
}
