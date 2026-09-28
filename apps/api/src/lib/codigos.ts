import { prisma } from './prisma';

/** Gera códigos sequenciais por ano: GS-2026-0148 / PRJ-2026-0146. */
async function proximoNumero(tabela: 'orcamento' | 'projeto', ano: number) {
  const inicio = new Date(ano, 0, 1);
  const fim = new Date(ano + 1, 0, 1);
  const total =
    tabela === 'orcamento'
      ? await prisma.orcamento.count({ where: { criadoEm: { gte: inicio, lt: fim } } })
      : await prisma.projeto.count({ where: { criadoEm: { gte: inicio, lt: fim } } });
  return total + 1;
}

export async function gerarCodigoOrcamento() {
  const ano = new Date().getFullYear();
  const n = await proximoNumero('orcamento', ano);
  return `GS-${ano}-${String(n).padStart(4, '0')}`;
}

export async function gerarCodigoProjeto() {
  const ano = new Date().getFullYear();
  const n = await proximoNumero('projeto', ano);
  return `PRJ-${ano}-${String(n).padStart(4, '0')}`;
}
