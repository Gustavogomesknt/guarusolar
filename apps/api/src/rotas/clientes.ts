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

// Busca usada no autocomplete do gerador de orçamentos
rotasClientes.get(
  '/',
  rota(async (req, res) => {
    const q = (req.query.q as string) ?? '';
    const where: Prisma.ClienteWhereInput = {
      ativo: true,
      ...(q
        ? {
            OR: [
              { nome: { contains: q, mode: 'insensitive' } },
              { documento: { contains: somenteDigitos(q) } },
              { whatsapp: { contains: somenteDigitos(q) } },
            ],
          }
        : {}),
    };
    res.json(await prisma.cliente.findMany({ where, orderBy: { nome: 'asc' }, take: 20 }));
  }),
);

rotasClientes.get(
  '/:id',
  rota(async (req, res) => {
    const cliente = await prisma.cliente.findUnique({
      where: { id: req.params.id },
      include: { orcamentos: { orderBy: { criadoEm: 'desc' }, take: 10 } },
    });
    if (!cliente) throw new ErroHttp(404, 'Cliente não encontrado');
    res.json(cliente);
  }),
);

rotasClientes.post(
  '/',
  rota(async (req, res) => {
    const dados = clienteSchema.parse(req.body);
    const existente = await prisma.cliente.findUnique({ where: { documento: dados.documento } });
    if (existente) throw new ErroHttp(409, `Já existe cliente com este documento: ${existente.nome}`);
    res.status(201).json(await prisma.cliente.create({ data: dados }));
  }),
);

rotasClientes.put(
  '/:id',
  rota(async (req, res) => {
    const dados = clienteSchema.partial().parse(req.body);
    res.json(await prisma.cliente.update({ where: { id: req.params.id }, data: dados }));
  }),
);

// Cliente nunca é apagado: vira inativo para preservar o histórico de orçamentos
rotasClientes.delete(
  '/:id',
  rota(async (req, res) => {
    await prisma.cliente.update({ where: { id: req.params.id }, data: { ativo: false } });
    res.status(204).end();
  }),
);
