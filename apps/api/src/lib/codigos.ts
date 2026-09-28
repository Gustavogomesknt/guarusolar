import type { Prisma } from '@prisma/client';
import { anoNoFuso } from '@guarusolar/compartilhado';
import { prisma } from './prisma';

type Banco = Prisma.TransactionClient | typeof prisma;

/**
 * Próximo número do prefixo no ano, à prova de concorrência.
 * Um único comando cria o contador do ano (começando em 1) ou incrementa o existente e
 * devolve o valor novo; o Postgres trava a linha durante o incremento, então dois
 * pedidos simultâneos nunca recebem o mesmo número.
 * Dentro de uma transação (`banco = tx`), se ela for desfeita o número volta junto.
 */
async function proximoNumero(banco: Banco, prefixo: 'GS' | 'PRJ', ano: number) {
  const [linha] = await banco.$queryRaw<{ ultimo: number }[]>`
    INSERT INTO "SequenciaCodigo" ("prefixo", "ano", "ultimo")
    VALUES (${prefixo}, ${ano}, 1)
    ON CONFLICT ("prefixo", "ano")
    DO UPDATE SET "ultimo" = "SequenciaCodigo"."ultimo" + 1
    RETURNING "ultimo"`;
  return Number(linha.ultimo);
}

const formatar = (prefixo: string, ano: number, n: number) => `${prefixo}-${ano}-${String(n).padStart(4, '0')}`;

/** GS-2026-0148 */
export async function gerarCodigoOrcamento(banco: Banco = prisma) {
  const ano = anoNoFuso(); // ano em São Paulo, não no fuso do servidor
  return formatar('GS', ano, await proximoNumero(banco, 'GS', ano));
}

/** PRJ-2026-0146 */
export async function gerarCodigoProjeto(banco: Banco = prisma) {
  const ano = anoNoFuso(); // ano em São Paulo, não no fuso do servidor
  return formatar('PRJ', ano, await proximoNumero(banco, 'PRJ', ano));
}
