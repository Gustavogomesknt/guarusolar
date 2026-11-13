import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { filtroDeBusca } from '../lib/busca';
import { prisma } from '../lib/prisma';
import { ErroHttp, rota } from '../lib/erros';
import { autenticar, autorizar, type UsuarioToken } from '../lib/auth';
import { ehRepresentante, filtroDoRepresentante } from '../lib/acesso';

export const rotasClientes = Router();
// Só o login aqui: CADA ROTA diz quem passa. O REPRESENTANTE vê e mexe só nos clientes DELE
// (Cliente.representanteId); o time interno, em todos. Conferido no build
// (lib/isolamentoDoRepresentante.ts).
rotasClientes.use(autenticar);

const CLIENTE_NAO_ENCONTRADO = 'Cliente não encontrado';

const somenteDigitos = (v: string) => v.replace(/\D/g, '');

const clienteSchema = z.object({
  tipoPessoa: z.enum(['FISICA', 'JURIDICA']).default('FISICA'),
  nome: z.string().min(3, 'Informe o nome completo'),
  // opcional (decisão da Guarusolar): vazio ou ausente grava nulo; preenchido, o formato é conferido
  documento: z
    .string()
    .nullish()
    .transform((v) => somenteDigitos(v ?? '') || null)
    .refine((d) => d === null || d.length === 11 || d.length === 14, {
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

/**
 * Documento já usado por outro cliente: 409 com o nome, em vez de erro do banco. É a única
 * conferência de cliente repetido, e só vale quando o documento foi informado.
 */
async function conferirDocumentoLivre(documento: string, usuario: Pick<UsuarioToken, 'id' | 'papel'>, idAtual?: string) {
  const existente = await prisma.cliente.findUnique({ where: { documento } });
  if (existente && existente.id !== idAtual) {
    // o nome só para quem pode ver aquele cliente: ao representante, o de outro (da casa ou de outro
    // representante) não se revela. O documento é único na tabela: quem resolve é o escritório
    const podeVer = !ehRepresentante(usuario) || existente.representanteId === usuario.id;
    throw new ErroHttp(
      409,
      podeVer ? `Já existe cliente com este documento: ${existente.nome}` : 'Já existe um cliente com este documento. Fale com o escritório.',
    );
  }
}

// Busca usada no autocomplete do gerador (q, até 20) e na tela de clientes (limite maior,
// incluirInativos). Sem incluirInativos, só clientes ativos: é assim que o desativado some
// das buscas de novos orçamentos.
rotasClientes.get(
  '/',
  autorizar('COMERCIAL', 'GESTOR', 'REPRESENTANTE'),
  rota(async (req, res) => {
    const { q = '', incluirInativos, limite } = req.query as Record<string, string | undefined>;
    const where: Prisma.ClienteWhereInput = {
      ...filtroDoRepresentante.cliente(req.usuario!),
      ...(incluirInativos === 'true' ? {} : { ativo: true }),
      // por palavras, em nome, documento e WhatsApp ("maria 9999", "012.345"): lib/busca.ts
      ...filtroDeBusca(q, (p) => [{ textoBusca: { contains: p } }]),
    };
    const take = Math.min(Math.max(Number(limite) || 20, 1), 200);
    const clientes = await prisma.cliente.findMany({
      where,
      orderBy: { nome: 'asc' },
      take,
      // representante: conta só os orçamentos DELE (o interno pode ter feito outros para o cliente)
      include: { _count: { select: { orcamentos: { where: filtroDoRepresentante.orcamento(req.usuario!) } } } },
    });
    res.json(clientes.map(({ _count, ...c }) => ({ ...c, quantidadeOrcamentos: _count.orcamentos })));
  }),
);

rotasClientes.get(
  '/:id',
  autorizar('COMERCIAL', 'GESTOR', 'REPRESENTANTE'),
  rota(async (req, res) => {
    const representante = ehRepresentante(req.usuario!);
    const cliente = await prisma.cliente.findFirst({
      where: { id: req.params.id, ...filtroDoRepresentante.cliente(req.usuario!) },
      include: {
        // os orçamentos, só com o que a ficha mostra. Representante: só os DELE e sem o projeto
        // (projetos não são do escopo dele)
        orcamentos: {
          where: filtroDoRepresentante.orcamento(req.usuario!),
          orderBy: { criadoEm: 'desc' },
          select: {
            id: true,
            codigo: true,
            status: true,
            criadoEm: true,
            validade: true,
            valorTotal: true,
            valorTotalCliente: true,
            projeto: representante ? false : { select: { id: true, codigo: true, status: true } },
          },
        },
      },
    });
    if (!cliente) throw new ErroHttp(404, CLIENTE_NAO_ENCONTRADO);
    res.json(cliente);
  }),
);

rotasClientes.post(
  '/',
  autorizar('COMERCIAL', 'GESTOR', 'REPRESENTANTE'),
  rota(async (req, res) => {
    const dados = clienteSchema.parse(req.body);
    if (dados.documento) await conferirDocumentoLivre(dados.documento, req.usuario!);
    // cadastrado por um representante: é DELE (só ele e o time interno veem); pelo interno, da casa
    const representanteId = ehRepresentante(req.usuario!) ? req.usuario!.id : null;
    res.status(201).json(await prisma.cliente.create({ data: { ...dados, representanteId } }));
  }),
);

rotasClientes.put(
  '/:id',
  autorizar('COMERCIAL', 'GESTOR', 'REPRESENTANTE'),
  rota(async (req, res) => {
    const dados = clienteSchema.partial().parse(req.body);
    const atual = await prisma.cliente.findFirst({ where: { id: req.params.id, ...filtroDoRepresentante.cliente(req.usuario!) } });
    if (!atual) throw new ErroHttp(404, CLIENTE_NAO_ENCONTRADO);
    if (dados.documento) await conferirDocumentoLivre(dados.documento, req.usuario!, atual.id);
    res.json(await prisma.cliente.update({ where: { id: atual.id }, data: dados }));
  }),
);

// Cliente nunca é apagado (regra 3): desativado, sai das buscas de novos orçamentos,
// e os orçamentos dele continuam como estão.
rotasClientes.patch(
  '/:id/ativo',
  autorizar('COMERCIAL', 'GESTOR', 'REPRESENTANTE'),
  rota(async (req, res) => {
    const { ativo } = z.object({ ativo: z.boolean() }).parse(req.body);
    const cliente = await prisma.cliente.findFirst({ where: { id: req.params.id, ...filtroDoRepresentante.cliente(req.usuario!) } });
    if (!cliente) throw new ErroHttp(404, CLIENTE_NAO_ENCONTRADO);
    res.json(await prisma.cliente.update({ where: { id: cliente.id }, data: { ativo } }));
  }),
);
