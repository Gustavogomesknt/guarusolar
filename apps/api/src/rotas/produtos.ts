import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ErroHttp, rota } from '../lib/erros';
import { autenticar, autorizar } from '../lib/auth';
import { calcularMargem, CATEGORIAS_PRODUTO, UNIDADES } from '@guarusolar/compartilhado';

export const rotasProdutos = Router();
rotasProdutos.use(autenticar, autorizar('COMERCIAL', 'GESTOR'));

const produtoSchema = z.object({
  nome: z.string().min(3),
  categoria: z.enum(CATEGORIAS_PRODUTO),
  unidade: z.enum(UNIDADES).default('UN'),
  // código que a Guarusolar já usa (113, 320...); texto vazio vira null
  codigoFornecedor: z
    .string()
    .trim()
    .max(30, 'Use até 30 caracteres')
    .nullish()
    .transform((v) => v || null),
  precoCusto: z.number().nonnegative(),
  precoVenda: z.number().positive(),
  // texto vazio vira null (sem descrição no PDF)
  descricaoTecnica: z
    .string()
    .trim()
    .max(1500)
    .nullish()
    .transform((v) => v || null),
  ativo: z.boolean().default(true),
});

// mesma conta do painel de edição (@guarusolar/compartilhado)
const comMargem = <T extends { precoCusto: Prisma.Decimal; precoVenda: Prisma.Decimal }>(p: T) => ({
  ...p,
  ...calcularMargem(Number(p.precoCusto), Number(p.precoVenda)),
});

rotasProdutos.get(
  '/',
  rota(async (req, res) => {
    const { q, categoria, incluirInativos } = req.query as Record<string, string>;
    const produtos = await prisma.produto.findMany({
      where: {
        // sem incluirInativos, só itens ativos: é assim que desativados somem dos novos orçamentos
        ...(incluirInativos === 'true' ? {} : { ativo: true }),
        ...(categoria ? { categoria: categoria as never } : {}),
        // a busca acha pelo nome ou pelo código do fornecedor ("113")
        ...(q
          ? {
              OR: [
                { nome: { contains: q, mode: 'insensitive' as const } },
                { codigoFornecedor: { startsWith: q.trim(), mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      orderBy: [{ categoria: 'asc' }, { nome: 'asc' }],
      include: { _count: { select: { itensOrcamento: true } } },
    });
    res.json(
      produtos.map(({ _count, ...p }) => ({
        ...comMargem(p),
        // linhas de orçamento que usam o item (um produto aparece uma vez por orçamento)
        usadoEmOrcamentos: _count.itensOrcamento,
      })),
    );
  }),
);

/**
 * Código do fornecedor é único entre os itens ATIVOS (índice parcial no banco). Confere antes,
 * para a mensagem dizer qual item já usa o código.
 */
async function conferirCodigoLivre(codigo: string | null | undefined, ignorarId?: string) {
  if (!codigo) return;
  const outro = await prisma.produto.findFirst({
    where: { codigoFornecedor: codigo, ativo: true, ...(ignorarId ? { NOT: { id: ignorarId } } : {}) },
    select: { nome: true },
  });
  if (outro) throw new ErroHttp(409, `O código ${codigo} já é de outro item ativo: ${outro.nome}.`);
}

rotasProdutos.post(
  '/',
  rota(async (req, res) => {
    const dados = produtoSchema.parse(req.body);
    if (dados.ativo) await conferirCodigoLivre(dados.codigoFornecedor);
    res.status(201).json(comMargem(await prisma.produto.create({ data: dados })));
  }),
);

rotasProdutos.put(
  '/:id',
  rota(async (req, res) => {
    const dados = produtoSchema.partial().parse(req.body);
    const atual = await prisma.produto.findUnique({ where: { id: req.params.id } });
    if (!atual) throw new ErroHttp(404, 'Item não encontrado');
    if (dados.ativo ?? atual.ativo) {
      await conferirCodigoLivre(dados.codigoFornecedor === undefined ? atual.codigoFornecedor : dados.codigoFornecedor, atual.id);
    }
    res.json(comMargem(await prisma.produto.update({ where: { id: req.params.id }, data: dados })));
  }),
);

// Desativar mantém o item nos orçamentos antigos
rotasProdutos.patch(
  '/:id/ativo',
  rota(async (req, res) => {
    const { ativo } = z.object({ ativo: z.boolean() }).parse(req.body);
    const produto = await prisma.produto.findUnique({ where: { id: req.params.id } });
    if (!produto) throw new ErroHttp(404, 'Item não encontrado');
    // reativar um item cujo código já foi reaproveitado por outro ativo
    if (ativo) await conferirCodigoLivre(produto.codigoFornecedor, produto.id);
    res.json(await prisma.produto.update({ where: { id: produto.id }, data: { ativo } }));
  }),
);
