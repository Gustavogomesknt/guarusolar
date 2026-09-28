import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ErroHttp, rota } from '../lib/erros';
import { autenticar, autorizar } from '../lib/auth';
import { calcularMargem } from '@guarusolar/compartilhado';

export const rotasProdutos = Router();
rotasProdutos.use(autenticar, autorizar('COMERCIAL', 'GESTOR'));

const produtoSchema = z.object({
  nome: z.string().min(3),
  categoria: z.enum(['PAINEL_SOLAR', 'INVERSOR', 'ESTRUTURA', 'CABO', 'MAO_DE_OBRA', 'OUTROS']),
  unidade: z.enum(['UN', 'KIT', 'M', 'SERVICO', 'KWP']).default('UN'),
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
        ...(q ? { nome: { contains: q, mode: 'insensitive' } } : {}),
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

rotasProdutos.post(
  '/',
  rota(async (req, res) => {
    const dados = produtoSchema.parse(req.body);
    res.status(201).json(comMargem(await prisma.produto.create({ data: dados })));
  }),
);

rotasProdutos.put(
  '/:id',
  rota(async (req, res) => {
    const dados = produtoSchema.partial().parse(req.body);
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
    res.json(await prisma.produto.update({ where: { id: produto.id }, data: { ativo } }));
  }),
);
