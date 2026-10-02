import type { NextFunction, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { Papel } from '@prisma/client';
import { ErroHttp } from './erros';
import { prisma } from './prisma';

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
  /** Usuario.sessaoVersao quando o login foi feito (token antigo, sem ela, vale como 0) */
  versao?: number;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      usuario?: UsuarioToken;
    }
  }
}

const CUSTO_DO_HASH = 10;
export const gerarHash = (senha: string) => bcrypt.hash(senha, CUSTO_DO_HASH);

// Hash de uma senha que ninguém tem, com o mesmo custo dos hashes reais.
const HASH_FICTICIO = bcrypt.hashSync(`nenhuma-conta-${Date.now()}`, CUSTO_DO_HASH);

/**
 * Confere a senha SEMPRE com bcrypt, mesmo sem conta (hash null): assim o tempo de resposta
 * é o mesmo para e-mail que existe e que não existe, e não revela quem tem conta.
 */
export async function conferirSenha(senha: string, hash: string | null) {
  const confere = await bcrypt.compare(senha, hash ?? HASH_FICTICIO);
  return hash !== null && confere;
}

export const gerarToken = (usuario: UsuarioToken) =>
  jwt.sign(usuario, SEGREDO, {
    expiresIn: usuario.papel === 'TECNICO' ? VALIDADE_TECNICO : VALIDADE,
  });

// ---------------------------------------------------------------------------------------------
// Sessão ainda vale? O token sozinho não sabe que o usuário foi desativado ou mudou de papel.
// Cada usuário é conferido no banco no máximo 1 vez por minuto (cada ida ao banco custa ~120 ms);
// a tela de usuários limpa a memória na hora (esquecerSessao), então lá a mudança vale na hora.
// ---------------------------------------------------------------------------------------------
const VALIDADE_DA_CONFERENCIA = 60_000;
const conferidos = new Map<string, { ativo: boolean; versao: number; ate: number }>();

/** Depois de mudar ativo, papel, equipe ou senha de alguém: a próxima requisição confere no banco. */
export const esquecerSessao = (usuarioId: string) => conferidos.delete(usuarioId);

async function sessaoValida(token: UsuarioToken) {
  let atual = conferidos.get(token.id);
  if (!atual || atual.ate < Date.now()) {
    const usuario = await prisma.usuario.findUnique({ where: { id: token.id }, select: { ativo: true, sessaoVersao: true } });
    atual = { ativo: usuario?.ativo ?? false, versao: usuario?.sessaoVersao ?? -1, ate: Date.now() + VALIDADE_DA_CONFERENCIA };
    conferidos.set(token.id, atual);
  }
  return atual.ativo && atual.versao === (token.versao ?? 0);
}

/** Exige um token válido no cabeçalho Authorization: Bearer <token>, de usuário ativo. */
export function autenticar(req: Request, _res: Response, next: NextFunction) {
  const cabecalho = req.headers.authorization;
  if (!cabecalho?.startsWith('Bearer ')) {
    throw new ErroHttp(401, 'Faça login para continuar');
  }
  let token: UsuarioToken;
  try {
    token = jwt.verify(cabecalho.slice(7), SEGREDO) as UsuarioToken;
  } catch {
    throw new ErroHttp(401, 'Sessão expirada, faça login novamente');
  }
  // Express 4 não captura erro de middleware assíncrono: o next(erro) vai explícito
  sessaoValida(token)
    .then((valida) => {
      if (!valida) return next(new ErroHttp(401, 'Sua sessão terminou. Entre de novo.'));
      req.usuario = token;
      next();
    })
    .catch(next);
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
