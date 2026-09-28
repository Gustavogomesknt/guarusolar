import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ErroHttp, rota } from '../lib/erros';
import { autenticar, autorizar } from '../lib/auth';

export const rotasClientes = Router();
rotasClientes.use(autenticar, autorizar('COMERCIAL', 'GESTOR'));

const somenteDigitos = (v: string) => v.replace(/\D/g, '');

const clienteSchema = z.object({
  tipoPessoa: z.enum(['FISICA', 'JURIDICA']).default('FISICA'),
  nome: z.string().min(3, 'Informe o nome completo'),
  documento: z.string().transform(somenteDigitos).refine((d) => d.length === 11 || d.length === 14, {
    message: 'CPF deve ter 11 dígitos e CNPJ 14',
  }),
  whatsapp: z.string().transform(somenteDigitos).refine((d) => d.length >= 10, {
    message: 'Informe o WhatsApp com DDD',
  }),
  email: z.string().email().optional().or(z.literal('')),
  cep: z.string().transform(somenteDigitos).optional(),
  logradouro: z.string().optional(),
  numero: z.string().optional(),
  complemento: z.string().optional(),
  bairro: z.string().optional(),
  cidade: z.string().optional(),
  uf: z.string().length(2).optional(),
  observacoes: z.string().optional(),
});

/** Documento já usado por outro cliente: 409 com o nome, em vez de erro do banco. */
async function conferirDocumentoLivre(documento: string, idAtual?: string) {
  const existente = await prisma.cliente.findUnique({ where: { documento } });
  if (existente && existente.id !== idAtual) {
    throw new ErroHttp(409, `Já existe cliente com este documento: ${existente.nome}`);
  }
}

// Busca usada no autocomplete do gerador (q, até 20) e na tela de clientes (limite maior,
// incluirInativos). Sem incluirInativos, só clientes ativos: é assim que o desativado some
// das buscas de novos orçamentos.
rotasClientes.get(
  '/',
  rota(async (req, res) => {
    const { q = '', incluirInativos, limite } = req.query as Record<string, string | undefined>;
    const termo = q.trim();
    const digitos = somenteDigitos(termo);
    const where: Prisma.ClienteWhereInput = {
      ...(incluirInativos === 'true' ? {} : { ativo: true }),
      ...(termo
        ? {
            OR: [
              { nome: { contains: termo, mode: 'insensitive' } },
              // sem dígitos no termo, "contém vazio" casaria com todos os clientes
              ...(digitos ? [{ documento: { contains: digitos } }, { whatsapp: { contains: digitos } }] : []),
            ],
          }
        : {}),
    };
    const take = Math.min(Math.max(Number(limite) || 20, 1), 200);
    const clientes = await prisma.cliente.findMany({
      where,
      orderBy: { nome: 'asc' },
      take,
      include: { _count: { select: { orcamentos: true } } },
    });
    res.json(clientes.map(({ _count, ...c }) => ({ ...c, quantidadeOrcamentos: _count.orcamentos })));
  }),
);

rotasClientes.get(
  '/:id',
  rota(async (req, res) => {
    const cliente = await prisma.cliente.findUnique({
      where: { id: req.params.id },
      include: {
        // todos os orçamentos, só com o que a ficha mostra
        orcamentos: {
          orderBy: { criadoEm: 'desc' },
          select: { id: true, codigo: true, status: true, criadoEm: true, validade: true, valorTotal: true },
        },
      },
    });
    if (!cliente) throw new ErroHttp(404, 'Cliente não encontrado');
    res.json(cliente);
  }),
);

rotasClientes.post(
  '/',
  rota(async (req, res) => {
    const dados = clienteSchema.parse(req.body);
    await conferirDocumentoLivre(dados.documento);
    res.status(201).json(await prisma.cliente.create({ data: dados }));
  }),
);

rotasClientes.put(
  '/:id',
  rota(async (req, res) => {
    const dados = clienteSchema.partial().parse(req.body);
    const atual = await prisma.cliente.findUnique({ where: { id: req.params.id } });
    if (!atual) throw new ErroHttp(404, 'Cliente não encontrado');
    if (dados.documento) await conferirDocumentoLivre(dados.documento, atual.id);
    res.json(await prisma.cliente.update({ where: { id: atual.id }, data: dados }));
  }),
);

// Cliente nunca é apagado (regra 3): desativado, sai das buscas de novos orçamentos,
// e os orçamentos dele continuam como estão.
rotasClientes.patch(
  '/:id/ativo',
  rota(async (req, res) => {
    const { ativo } = z.object({ ativo: z.boolean() }).parse(req.body);
    const cliente = await prisma.cliente.findUnique({ where: { id: req.params.id } });
    if (!cliente) throw new ErroHttp(404, 'Cliente não encontrado');
    res.json(await prisma.cliente.update({ where: { id: cliente.id }, data: { ativo } }));
  }),
);
