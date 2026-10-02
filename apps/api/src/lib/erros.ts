import type { NextFunction, Request, Response } from 'express';
import { MulterError } from 'multer';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
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

/** Para quem usa o sistema: o que aconteceu e o que fazer (nunca o texto técnico do banco). */
const MENSAGEM_BANCO_FORA =
  'Não foi possível falar com o banco de dados agora. Tente de novo em 1 minuto; se continuar, avise o responsável pelo sistema.';
const MENSAGEM_ERRO_INTERNO =
  'O servidor encontrou um problema. Tente de novo em instantes; se continuar, avise o responsável pelo sistema.';

/** Nome do campo para a mensagem de valor repetido (chave única do banco). */
const CAMPOS_UNICOS: Record<string, string> = {
  documento: 'CPF/CNPJ',
  email: 'e-mail',
  codigo: 'código',
  codigoFornecedor: 'código do fornecedor',
  idLocal: 'foto',
};

/**
 * Erros do Prisma em linguagem de usuário. Banco fora do ar ou pausado: 503 (a tela pede para
 * tentar de novo). Registro que sumiu ou mudou: 404/409 pedindo para recarregar.
 */
function erroDoBanco(erro: unknown): { status: number; mensagem: string } | null {
  if (erro instanceof Prisma.PrismaClientInitializationError) return { status: 503, mensagem: MENSAGEM_BANCO_FORA };
  if (!(erro instanceof Prisma.PrismaClientKnownRequestError)) return null;
  switch (erro.code) {
    case 'P1001': // não alcança o servidor
    case 'P1002': // tempo esgotado
    case 'P1008':
    case 'P1017': // o servidor fechou a conexão
    case 'P2024': // todas as conexões ocupadas
      return { status: 503, mensagem: MENSAGEM_BANCO_FORA };
    case 'P2025':
      return { status: 404, mensagem: 'Este registro não foi encontrado: pode ter sido alterado por outra pessoa. Recarregue a tela.' };
    case 'P2002': {
      const alvo = ([] as string[]).concat((erro.meta?.target as string[] | string | undefined) ?? []).join(' ');
      const campo = Object.entries(CAMPOS_UNICOS).find(([chave]) => alvo.includes(chave))?.[1];
      return { status: 409, mensagem: campo ? `Já existe um registro com este ${campo}.` : 'Já existe um registro com estes dados.' };
    }
    case 'P2003':
      return { status: 409, mensagem: 'Um registro ligado a este não existe mais. Recarregue a tela e tente de novo.' };
    default:
      return null;
  }
}

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
  // corpo que não é JSON válido ou grande demais (express.json): erro de quem enviou, não 500
  const tipo = (erro as { type?: string }).type;
  if (tipo === 'entity.parse.failed') {
    return res.status(400).json({ erro: 'Os dados enviados não estão em um formato válido.' });
  }
  if (tipo === 'entity.too.large') {
    return res.status(413).json({ erro: 'Os dados enviados são grandes demais.' });
  }
  const doBanco = erroDoBanco(erro);
  // no log fica o erro técnico completo (Render › Logs); para a tela, a mensagem em português
  console.error(erro);
  if (doBanco) return res.status(doBanco.status).json({ erro: doBanco.mensagem });
  return res.status(500).json({ erro: MENSAGEM_ERRO_INTERNO });
}
