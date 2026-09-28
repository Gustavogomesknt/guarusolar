import { Router } from 'express';
import { z } from 'zod';
import { Prisma, type StatusOrcamento } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ErroHttp, rota } from '../lib/erros';
import { autenticar, autorizar } from '../lib/auth';
import { calcularOrcamento, formatarBRL } from '@guarusolar/compartilhado';
import { gerarCodigoOrcamento, gerarCodigoProjeto } from '../lib/codigos';

export const rotasOrcamentos = Router();
rotasOrcamentos.use(autenticar, autorizar('COMERCIAL', 'GESTOR'));

const itemSchema = z.object({
  produtoId: z.string().uuid(),
  quantidade: z.number().positive(),
  precoUnitario: z.number().nonnegative().optional(), // ausente = preço do catálogo
});

const orcamentoSchema = z.object({
  clienteId: z.string().uuid(),
  validade: z.coerce.date(),
  descontoTipo: z.enum(['PERCENTUAL', 'VALOR']).default('PERCENTUAL'),
  descontoValor: z.number().nonnegative().default(0),
  condicaoPagamento: z.enum(['A_VISTA', 'ENTRADA_PARCELAS', 'FINANCIAMENTO']),
  descontoAVistaPct: z.number().min(0).max(100).optional(),
  entradaPct: z.number().min(0).max(100).optional(),
  parcelas: z.number().int().min(1).max(60).optional(),
  bancoFinanciamento: z.string().optional(),
  observacoes: z.string().optional(),
  itens: z.array(itemSchema).min(1, 'Inclua ao menos um item no orçamento'),
});

/** Monta os itens com os dados do catálogo e devolve os totais calculados. */
async function prepararItens(itens: z.infer<typeof itemSchema>[]) {
  const produtos = await prisma.produto.findMany({
    where: { id: { in: itens.map((i) => i.produtoId) } },
  });
  if (produtos.length !== new Set(itens.map((i) => i.produtoId)).size) {
    throw new ErroHttp(400, 'Um dos itens não existe no catálogo');
  }

  return itens.map((item, ordem) => {
    const produto = produtos.find((p) => p.id === item.produtoId)!;
    const precoTabela = Number(produto.precoVenda);
    const precoUnitario = item.precoUnitario ?? precoTabela;
    return {
      produtoId: produto.id,
      descricao: produto.nome,
      unidade: produto.unidade,
      quantidade: new Prisma.Decimal(item.quantidade),
      precoUnitario: new Prisma.Decimal(precoUnitario),
      precoTabela: new Prisma.Decimal(precoTabela),
      subtotal: new Prisma.Decimal(
        Math.round(item.quantidade * precoUnitario * 100) / 100,
      ),
      ordem,
      _calculo: { quantidade: item.quantidade, precoUnitario },
    };
  });
}

// --------------------------------------------------------------------------
// Listagem com filtros (status, cliente, período, busca por código ou nome)
// --------------------------------------------------------------------------
rotasOrcamentos.get(
  '/',
  rota(async (req, res) => {
    const { status, clienteId, de, ate, q } = req.query as Record<string, string>;

    const where: Prisma.OrcamentoWhereInput = {
      ...(status ? { status: status as StatusOrcamento } : {}),
      ...(clienteId ? { clienteId } : {}),
      ...(de || ate
        ? { criadoEm: { ...(de ? { gte: new Date(de) } : {}), ...(ate ? { lte: new Date(ate) } : {}) } }
        : {}),
      ...(q
        ? {
            OR: [
              { codigo: { contains: q, mode: 'insensitive' } },
              { cliente: { nome: { contains: q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const orcamentos = await prisma.orcamento.findMany({
      where,
      orderBy: { criadoEm: 'desc' },
      include: {
        cliente: { select: { id: true, nome: true, cidade: true, uf: true, whatsapp: true } },
        vendedor: { select: { id: true, nome: true } },
        _count: { select: { itens: true } },
      },
    });

    res.json(orcamentos);
  }),
);

// --------------------------------------------------------------------------
// Indicadores do topo da tela comercial
// --------------------------------------------------------------------------
rotasOrcamentos.get(
  '/resumo',
  rota(async (req, res) => {
    const hoje = new Date();
    const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    const fim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 1);
    const periodo = { criadoEm: { gte: inicio, lt: fim } };

    const [totalMes, porStatus] = await Promise.all([
      prisma.orcamento.aggregate({ where: periodo, _sum: { valorTotal: true }, _count: true }),
      prisma.orcamento.groupBy({
        by: ['status'],
        where: periodo,
        _sum: { valorTotal: true },
        _count: true,
      }),
    ]);

    const busca = (s: StatusOrcamento) => porStatus.find((p) => p.status === s);
    const aprovados = busca('APROVADO')?._count ?? 0;
    const enviados = porStatus
      .filter((p) => p.status !== 'RASCUNHO')
      .reduce((soma, p) => soma + p._count, 0);
    const emAberto = (busca('ENVIADO')?._count ?? 0) + (busca('EM_NEGOCIACAO')?._count ?? 0);

    res.json({
      totalOrcadoMes: Number(totalMes._sum.valorTotal ?? 0),
      quantidadeMes: totalMes._count,
      taxaAprovacao: enviados ? Math.round((aprovados / enviados) * 100) : 0,
      quantidadeEmAberto: emAberto,
      valorEmAberto:
        Number(busca('ENVIADO')?._sum.valorTotal ?? 0) +
        Number(busca('EM_NEGOCIACAO')?._sum.valorTotal ?? 0),
      valorAprovadoMes: Number(busca('APROVADO')?._sum.valorTotal ?? 0),
    });
  }),
);

rotasOrcamentos.get(
  '/:id',
  rota(async (req, res) => {
    const orcamento = await prisma.orcamento.findUnique({
      where: { id: req.params.id },
      include: {
        cliente: true,
        vendedor: { select: { id: true, nome: true, telefone: true } },
        itens: { orderBy: { ordem: 'asc' } },
        historico: { orderBy: { criadoEm: 'desc' }, include: { usuario: { select: { nome: true } } } },
        projeto: true,
      },
    });
    if (!orcamento) throw new ErroHttp(404, 'Orçamento não encontrado');
    res.json(orcamento);
  }),
);

// --------------------------------------------------------------------------
// Criar / atualizar
// --------------------------------------------------------------------------
rotasOrcamentos.post(
  '/',
  rota(async (req, res) => {
    const dados = orcamentoSchema.parse(req.body);
    const itens = await prepararItens(dados.itens);
    const totais = calcularOrcamento({
      itens: itens.map((i) => i._calculo),
      descontoTipo: dados.descontoTipo,
      descontoValor: dados.descontoValor,
      condicaoPagamento: dados.condicaoPagamento,
      descontoAVistaPct: dados.descontoAVistaPct,
      entradaPct: dados.entradaPct,
      parcelas: dados.parcelas,
    });

    const orcamento = await prisma.orcamento.create({
      data: {
        codigo: await gerarCodigoOrcamento(),
        clienteId: dados.clienteId,
        vendedorId: req.usuario!.id,
        validade: dados.validade,
        descontoTipo: dados.descontoTipo,
        descontoValor: dados.descontoValor,
        condicaoPagamento: dados.condicaoPagamento,
        descontoAVistaPct: dados.descontoAVistaPct,
        entradaPct: dados.entradaPct,
        parcelas: dados.parcelas,
        bancoFinanciamento: dados.bancoFinanciamento,
        observacoes: dados.observacoes,
        subtotal: totais.subtotal,
        descontoAplicado: totais.descontoAplicado,
        valorTotal: totais.valorTotal,
        itens: { create: itens.map(({ _calculo, ...item }) => item) },
      },
      include: { itens: true, cliente: true },
    });

    res.status(201).json({ ...orcamento, resumoPagamento: totais.resumoPagamento });
  }),
);

rotasOrcamentos.put(
  '/:id',
  rota(async (req, res) => {
    const dados = orcamentoSchema.parse(req.body);
    const atual = await prisma.orcamento.findUnique({ where: { id: req.params.id } });
    if (!atual) throw new ErroHttp(404, 'Orçamento não encontrado');
    if (atual.status === 'APROVADO') {
      throw new ErroHttp(409, 'Orçamento aprovado não pode ser alterado');
    }

    const itens = await prepararItens(dados.itens);
    const totais = calcularOrcamento({
      itens: itens.map((i) => i._calculo),
      descontoTipo: dados.descontoTipo,
      descontoValor: dados.descontoValor,
      condicaoPagamento: dados.condicaoPagamento,
      descontoAVistaPct: dados.descontoAVistaPct,
      entradaPct: dados.entradaPct,
      parcelas: dados.parcelas,
    });

    // troca os itens em bloco: se algo falhar, nada é gravado
    const orcamento = await prisma.$transaction(async (tx) => {
      await tx.itemOrcamento.deleteMany({ where: { orcamentoId: req.params.id } });
      return tx.orcamento.update({
        where: { id: req.params.id },
        data: {
          clienteId: dados.clienteId,
          validade: dados.validade,
          descontoTipo: dados.descontoTipo,
          descontoValor: dados.descontoValor,
          condicaoPagamento: dados.condicaoPagamento,
          descontoAVistaPct: dados.descontoAVistaPct,
          entradaPct: dados.entradaPct,
          parcelas: dados.parcelas,
          bancoFinanciamento: dados.bancoFinanciamento,
          observacoes: dados.observacoes,
          subtotal: totais.subtotal,
          descontoAplicado: totais.descontoAplicado,
          valorTotal: totais.valorTotal,
          itens: { create: itens.map(({ _calculo, ...item }) => item) },
        },
        include: { itens: true, cliente: true },
      });
    });

    res.json({ ...orcamento, resumoPagamento: totais.resumoPagamento });
  }),
);

// --------------------------------------------------------------------------
// Mudança de status em 1 clique (botão da tabela e do Kanban)
// --------------------------------------------------------------------------
const transicoes: Record<StatusOrcamento, StatusOrcamento[]> = {
  RASCUNHO: ['ENVIADO'],
  ENVIADO: ['EM_NEGOCIACAO', 'APROVADO', 'RECUSADO'],
  EM_NEGOCIACAO: ['ENVIADO', 'APROVADO', 'RECUSADO'],
  APROVADO: [],
  RECUSADO: ['EM_NEGOCIACAO'],
};

rotasOrcamentos.patch(
  '/:id/status',
  rota(async (req, res) => {
    const { status, observacao } = z
      .object({
        status: z.enum(['RASCUNHO', 'ENVIADO', 'EM_NEGOCIACAO', 'APROVADO', 'RECUSADO']),
        observacao: z.string().optional(),
      })
      .parse(req.body);

    const orcamento = await prisma.orcamento.findUnique({ where: { id: req.params.id } });
    if (!orcamento) throw new ErroHttp(404, 'Orçamento não encontrado');
    if (!transicoes[orcamento.status].includes(status)) {
      throw new ErroHttp(409, `Não é possível mudar de ${orcamento.status} para ${status}`);
    }

    const agora = new Date();
    const atualizado = await prisma.$transaction(async (tx) => {
      const novo = await tx.orcamento.update({
        where: { id: orcamento.id },
        data: {
          status,
          enviadoEm: status === 'ENVIADO' ? agora : orcamento.enviadoEm,
          aprovadoEm: status === 'APROVADO' ? agora : orcamento.aprovadoEm,
          recusadoEm: status === 'RECUSADO' ? agora : orcamento.recusadoEm,
          motivoRecusa: status === 'RECUSADO' ? observacao : orcamento.motivoRecusa,
        },
      });

      await tx.historicoStatus.create({
        data: {
          orcamentoId: orcamento.id,
          de: orcamento.status,
          para: status,
          usuarioId: req.usuario!.id,
          observacao,
        },
      });

      // Orçamento aprovado vira projeto e entra na fila de agendamento
      if (status === 'APROVADO') {
        await tx.projeto.create({
          data: {
            codigo: await gerarCodigoProjeto(),
            orcamentoId: orcamento.id,
            clienteId: orcamento.clienteId,
          },
        });
      }

      return novo;
    });

    res.json(atualizado);
  }),
);

// --------------------------------------------------------------------------
// Mensagem pronta de WhatsApp (o front abre o link retornado)
// --------------------------------------------------------------------------
rotasOrcamentos.get(
  '/:id/whatsapp',
  rota(async (req, res) => {
    const orcamento = await prisma.orcamento.findUnique({
      where: { id: req.params.id },
      include: { cliente: true, itens: true },
    });
    if (!orcamento) throw new ErroHttp(404, 'Orçamento não encontrado');

    const primeiroNome = orcamento.cliente.nome.split(' ')[0];
    const totais = calcularOrcamento({
      itens: orcamento.itens.map((i) => ({
        quantidade: Number(i.quantidade),
        precoUnitario: Number(i.precoUnitario),
      })),
      descontoTipo: orcamento.descontoTipo,
      descontoValor: Number(orcamento.descontoValor),
      condicaoPagamento: orcamento.condicaoPagamento,
      descontoAVistaPct: Number(orcamento.descontoAVistaPct ?? 0),
      entradaPct: Number(orcamento.entradaPct ?? 0),
      parcelas: orcamento.parcelas,
    });

    const linkPdf = `${process.env.APP_URL ?? 'http://localhost:5173'}/orcamentos/${orcamento.id}/pdf`;
    const mensagem = [
      `Olá, ${primeiroNome}! Tudo bem?`,
      '',
      `Segue o orçamento ${orcamento.codigo} da Guarusolar para o seu sistema de energia solar:`,
      '',
      `• Valor total: ${formatarBRL(Number(orcamento.valorTotal))}`,
      `• Pagamento: ${totais.resumoPagamento}`,
      `• Validade: ${orcamento.validade.toLocaleDateString('pt-BR')}`,
      '',
      `Orçamento completo em PDF: ${linkPdf}`,
      '',
      'Qualquer dúvida, estou à disposição!',
      `${req.usuario!.nome} · Guarusolar`,
    ].join('\n');

    const telefone = `55${orcamento.cliente.whatsapp.replace(/\D/g, '')}`;
    res.json({
      mensagem,
      link: `https://wa.me/${telefone}?text=${encodeURIComponent(mensagem)}`,
    });
  }),
);
