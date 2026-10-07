import { Router } from 'express';
import { z } from 'zod';
import { type Cliente, Prisma, type StatusOrcamento, type Unidade } from '@prisma/client';
import { filtroDeBusca } from '../lib/busca';
import { prisma } from '../lib/prisma';
import { ErroHttp, rota } from '../lib/erros';
import { operacaoMudou } from '../lib/versaoDaOperacao';
import { autenticar, autorizar } from '../lib/auth';
import {
  calcularOrcamento,
  MAXIMO_PARCELAS,
  formatarBRL,
  formatarData,
  inicioDoMes,
  podeMudarStatus,
  ROTULO_STATUS_ORCAMENTO,
  type CondicaoPagamento,
  type ResultadoCalculo,
} from '@guarusolar/compartilhado';
import { gerarCodigoOrcamento, gerarCodigoProjeto } from '../lib/codigos';
import { registrarEvento } from '../lib/eventosProjeto';

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
  parcelas: z.number().int().min(1).max(MAXIMO_PARCELAS, `Até ${MAXIMO_PARCELAS}x no cartão`).optional(),
  pagamentoDebito: z.boolean().default(false),
  absorverTaxaCartao: z.boolean().default(false),
  bancoFinanciamento: z.string().optional(),
  observacoes: z.string().optional(),
  // proposta em PDF: serviço no título e se a tabela mostra os preços de cada item
  descricaoServico: z.string().trim().max(100, 'Use até 100 caracteres').optional(),
  detalharPrecosNoPdf: z.boolean().default(false),
  // o vendedor pediu para trocar a cópia gravada do cliente pelos dados atuais do cadastro
  atualizarDadosCliente: z.boolean().default(false),
  itens: z.array(itemSchema).min(1, 'Inclua ao menos um item no orçamento'),
  // margem de lucro em reais da proposta. Ausente (tela da versão anterior, durante uma
  // publicação): criar grava zero e editar mantém a que estava gravada
  margem: z.number().nonnegative('A margem não pode ser negativa').max(9_999_999).optional(),
  // gerado pela tela ao abrir um orçamento novo: o mesmo "criar" repetido (resposta perdida numa
  // queda de internet) atualiza o orçamento já criado em vez de criar outro
  idCriacao: z.string().uuid().optional(),
});

/**
 * Resultado do cálculo do pagamento que fica gravado no orçamento, para o PDF e o WhatsApp
 * lerem sem recalcular.
 */
function pagamentoGravado(condicao: CondicaoPagamento, totais: ResultadoCalculo) {
  const parcelado = condicao === 'ENTRADA_PARCELAS';
  const c = parcelado ? totais.cartao : null;
  return {
    valorEntrada: parcelado ? totais.entrada : null,
    valorParcela: parcelado ? totais.valorParcela : null,
    resumoPagamento: totais.resumoPagamento,
    // a taxa usada fica gravada: a tabela renegociada não muda proposta salva
    pagamentoDebito: c?.debito ?? false,
    absorverTaxaCartao: c?.absorvida ?? false,
    taxaCartaoPct: c ? c.taxaPct : null,
    valorPrimeiraParcela: c ? c.valorPrimeiraParcela : null,
    valorTotalCliente: c ? totais.valorTotalCliente : null,
    valorTaxaAbsorvida: c ? c.valorAbsorvido : null,
  };
}

/**
 * Cópia dos dados do cliente gravada no orçamento (como os itens, regra 2): é o que o PDF e o
 * WhatsApp usam. Feita ao criar, ao trocar de cliente e quando o vendedor pede para atualizar.
 */
export function copiaDoCliente(c: Cliente) {
  return {
    clienteNome: c.nome,
    clienteTipoPessoa: c.tipoPessoa,
    clienteDocumento: c.documento,
    clienteWhatsapp: c.whatsapp,
    clienteEmail: c.email,
    clienteCep: c.cep,
    clienteLogradouro: c.logradouro,
    clienteNumero: c.numero,
    clienteComplemento: c.complemento,
    clienteBairro: c.bairro,
    clienteCidade: c.cidade,
    clienteUf: c.uf,
    clienteCopiadoEm: new Date(),
  };
}

async function clienteDoOrcamento(id: string) {
  const cliente = await prisma.cliente.findUnique({ where: { id } });
  if (!cliente) throw new ErroHttp(400, 'Cliente não encontrado. Escolha o cliente de novo.');
  return cliente;
}

/** Link público do PDF, com o token do orçamento (o cliente abre sem login). */
export function linkDoPdf(orcamento: { id: string; tokenPdf: string }) {
  const base = (process.env.API_URL_PUBLICA ?? 'http://localhost:3333').replace(/\/+$/, '');
  return `${base}/api/orcamentos/${orcamento.id}/pdf?token=${orcamento.tokenPdf}`;
}

/** Dados do item que são cópia gravada no orçamento (regra 2 do CLAUDE.md). */
type CopiaDoItem = {
  produtoId: string;
  descricao: string;
  descricaoTecnica: string | null;
  unidade: Unidade;
  precoTabela: Prisma.Decimal;
};

/**
 * Monta os itens e os dados para o cálculo dos totais.
 * Regra 2: item do orçamento é cópia. Na edição, `existentes` traz os itens já gravados:
 * para um produto que já estava no orçamento, descrição, unidade e preço de tabela ficam
 * como foram gravados, mesmo que o catálogo tenha mudado. Só produtos novos na edição
 * copiam os dados do catálogo atual.
 */
async function prepararItens(itens: z.infer<typeof itemSchema>[], existentes: CopiaDoItem[] = []) {
  const copias = new Map<string, CopiaDoItem>();
  for (const e of existentes) if (!copias.has(e.produtoId)) copias.set(e.produtoId, e);

  const produtos = await prisma.produto.findMany({
    where: { id: { in: itens.map((i) => i.produtoId) } },
  });
  if (produtos.length !== new Set(itens.map((i) => i.produtoId)).size) {
    throw new ErroHttp(400, 'Um dos itens não existe no catálogo');
  }

  return itens.map((item, ordem) => {
    const produto = produtos.find((p) => p.id === item.produtoId)!;
    const copia = copias.get(item.produtoId);
    const descricao = copia?.descricao ?? produto.nome;
    const descricaoTecnica = copia ? copia.descricaoTecnica : produto.descricaoTecnica;
    const unidade = copia?.unidade ?? produto.unidade;
    const precoTabela = copia ? Number(copia.precoTabela) : Number(produto.precoVenda);
    const precoUnitario = item.precoUnitario ?? precoTabela;
    return {
      produtoId: produto.id,
      descricao,
      descricaoTecnica,
      unidade,
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
    const { status, clienteId, de, ate, q, abertosSempre } = req.query as Record<string, string>;
    const periodo = de || ate ? { ...(de ? { gte: new Date(de) } : {}), ...(ate ? { lte: new Date(ate) } : {}) } : null;

    // abertosSempre (lista e pipeline): negociação em aberto não tem mês, aparece em qualquer
    // período; aprovado e recusado entram pelo período da DECISÃO (como o "valor aprovado no
    // mês"), para a negociação antiga fechada hoje não sumir da tela ao ser fechada.
    // Decisão sem data gravada (registros antigos) usa a criação.
    const filtroDoPeriodo: Prisma.OrcamentoWhereInput = !periodo
      ? {}
      : abertosSempre !== 'true'
        ? { criadoEm: periodo }
        : {
            OR: [
              { status: { in: ['RASCUNHO', 'ENVIADO', 'EM_NEGOCIACAO'] } },
              { status: 'APROVADO', aprovadoEm: periodo },
              { status: 'APROVADO', aprovadoEm: null, criadoEm: periodo },
              { status: 'RECUSADO', recusadoEm: periodo },
              { status: 'RECUSADO', recusadoEm: null, criadoEm: periodo },
            ],
          };

    const where: Prisma.OrcamentoWhereInput = {
      ...(status ? { status: status as StatusOrcamento } : {}),
      ...(clienteId ? { clienteId } : {}),
      ...filtroDoPeriodo,
      // por palavras: código, cliente e cidade da proposta, ou o nome atual do cadastro
      ...filtroDeBusca(q, (p) => [{ textoBusca: { contains: p } }, { cliente: { textoBusca: { contains: p } } }]),
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
// Indicadores do topo da tela comercial. Cada um usa a data do que mede:
//
// - Total orçado e quantidade: orçamentos CRIADOS no mês (criadoEm) — o que foi emitido.
// - Valor aprovado: orçamentos APROVADOS no mês (aprovadoEm), qualquer que seja a data de
//   criação — a venda fechada no mês.
// - Taxa de aprovação: numerador e denominador da MESMA turma, os orçamentos criados no
//   mês. Denominador = os que já saíram do rascunho (foram enviados); numerador = os que,
//   entre eles, estão aprovados. Misturar critérios (aprovados no mês ÷ enviados no mês)
//   contaria no numerador orçamentos que não estão no denominador. Orçamentos recentes
//   ainda em negociação puxam a taxa para baixo até serem decididos.
// - Em aberto: situação atual do funil (ENVIADO + EM_NEGOCIACAO), sem filtro de data —
//   um orçamento de meses anteriores ainda em negociação continua em aberto hoje.
//
// O mês é o do fuso da empresa (America/Sao_Paulo), não o do servidor.
// --------------------------------------------------------------------------
rotasOrcamentos.get(
  '/resumo',
  rota(async (_req, res) => {
    const doMes = { gte: inicioDoMes(0), lt: inicioDoMes(1) };

    const [criadosNoMes, criadosPorStatus, aprovadosNoMes, emAberto] = await Promise.all([
      prisma.orcamento.aggregate({ where: { criadoEm: doMes }, _sum: { valorTotal: true }, _count: true }),
      prisma.orcamento.groupBy({ by: ['status'], where: { criadoEm: doMes }, _count: true }),
      prisma.orcamento.aggregate({
        where: { status: 'APROVADO', aprovadoEm: doMes },
        _sum: { valorTotal: true },
      }),
      prisma.orcamento.aggregate({
        where: { status: { in: ['ENVIADO', 'EM_NEGOCIACAO'] } },
        _sum: { valorTotal: true },
        _count: true,
      }),
    ]);

    // taxa de aprovação: turma dos criados no mês
    const quantos = (s: StatusOrcamento) => criadosPorStatus.find((p) => p.status === s)?._count ?? 0;
    const aprovadosDaTurma = quantos('APROVADO');
    const enviadosDaTurma = criadosPorStatus
      .filter((p) => p.status !== 'RASCUNHO')
      .reduce((soma, p) => soma + p._count, 0);

    res.json({
      totalOrcadoMes: Number(criadosNoMes._sum.valorTotal ?? 0),
      quantidadeMes: criadosNoMes._count,
      taxaAprovacao: enviadosDaTurma ? Math.round((aprovadosDaTurma / enviadosDaTurma) * 100) : 0,
      // numerador e denominador da taxa (orçamentos criados no mês)
      aprovadosMes: aprovadosDaTurma,
      enviadosMes: enviadosDaTurma,
      quantidadeEmAberto: emAberto._count,
      valorEmAberto: Number(emAberto._sum.valorTotal ?? 0),
      valorAprovadoMes: Number(aprovadosNoMes._sum.valorTotal ?? 0),
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
        // a categoria fica no produto; o resto do item é cópia gravada no orçamento
        itens: { orderBy: { ordem: 'asc' }, include: { produto: { select: { categoria: true } } } },
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
    // repetição do mesmo "criar" (a resposta se perdeu): grava sobre o orçamento já criado
    if (dados.idCriacao) {
      const jaCriado = await prisma.orcamento.findUnique({ where: { idCriacao: dados.idCriacao }, select: { id: true } });
      if (jaCriado) {
        const { orcamento, totais } = await atualizarOrcamento(jaCriado.id, dados);
        return res.json({ ...orcamento, resumoPagamento: totais.resumoPagamento });
      }
    }
    const cliente = await clienteDoOrcamento(dados.clienteId);
    const itens = await prepararItens(dados.itens);
    const totais = calcularOrcamento({
      itens: itens.map((i) => i._calculo),
      margem: dados.margem ?? 0,
      descontoTipo: dados.descontoTipo,
      descontoValor: dados.descontoValor,
      condicaoPagamento: dados.condicaoPagamento,
      descontoAVistaPct: dados.descontoAVistaPct,
      entradaPct: dados.entradaPct,
      parcelas: dados.parcelas,
      debito: dados.pagamentoDebito,
      absorverTaxaCartao: dados.absorverTaxaCartao,
    });

    // o código sai dentro da mesma transação: se a criação falhar, o número não é perdido
    const orcamento = await prisma.$transaction(async (tx) =>
      tx.orcamento.create({
        data: {
          codigo: await gerarCodigoOrcamento(tx),
          idCriacao: dados.idCriacao,
          clienteId: dados.clienteId,
          ...copiaDoCliente(cliente),
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
          descricaoServico: dados.descricaoServico || null,
          detalharPrecosNoPdf: dados.detalharPrecosNoPdf,
          subtotal: totais.subtotal,
          margem: totais.margem,
          descontoAplicado: totais.descontoAplicado,
          valorTotal: totais.valorTotal,
          ...pagamentoGravado(dados.condicaoPagamento, totais),
          itens: { create: itens.map(({ _calculo, ...item }) => item) },
        },
        include: { itens: true, cliente: true },
      }),
    );

    res.status(201).json({ ...orcamento, resumoPagamento: totais.resumoPagamento });
  }),
);

/** Grava a edição de um orçamento (PUT e o "criar" repetido com o mesmo idCriacao). */
async function atualizarOrcamento(id: string, dados: z.infer<typeof orcamentoSchema>) {
  const atual = await prisma.orcamento.findUnique({
    where: { id: id },
    include: { itens: { orderBy: { ordem: 'asc' } } },
  });
  if (!atual) throw new ErroHttp(404, 'Orçamento não encontrado');
  if (atual.status === 'APROVADO') {
    throw new ErroHttp(409, 'Orçamento aprovado não pode ser alterado');
  }

  // itens que já estavam no orçamento mantêm a cópia gravada (regra 2); o cliente também:
  // a cópia só muda ao trocar de cliente ou quando o vendedor pede "usar dados atuais do cadastro"
  const copiarCliente = dados.clienteId !== atual.clienteId || dados.atualizarDadosCliente || atual.clienteNome == null;
  const novaCopia = copiarCliente ? copiaDoCliente(await clienteDoOrcamento(dados.clienteId)) : {};
  const itens = await prepararItens(dados.itens, atual.itens);
  const totais = calcularOrcamento({
    itens: itens.map((i) => i._calculo),
    margem: dados.margem ?? Number(atual.margem),
    descontoTipo: dados.descontoTipo,
    descontoValor: dados.descontoValor,
    condicaoPagamento: dados.condicaoPagamento,
    descontoAVistaPct: dados.descontoAVistaPct,
    entradaPct: dados.entradaPct,
    parcelas: dados.parcelas,
    debito: dados.pagamentoDebito,
    absorverTaxaCartao: dados.absorverTaxaCartao,
  });

  // troca os itens em bloco: se algo falhar, nada é gravado
  const orcamento = await prisma.$transaction(async (tx) => {
    await tx.itemOrcamento.deleteMany({ where: { orcamentoId: id } });
    return tx.orcamento.update({
      where: { id: id },
      data: {
        clienteId: dados.clienteId,
        ...novaCopia,
        validade: dados.validade,
        descontoTipo: dados.descontoTipo,
        descontoValor: dados.descontoValor,
        condicaoPagamento: dados.condicaoPagamento,
        descontoAVistaPct: dados.descontoAVistaPct,
        entradaPct: dados.entradaPct,
        parcelas: dados.parcelas,
        bancoFinanciamento: dados.bancoFinanciamento,
        observacoes: dados.observacoes,
        descricaoServico: dados.descricaoServico || null,
        detalharPrecosNoPdf: dados.detalharPrecosNoPdf,
        subtotal: totais.subtotal,
        margem: totais.margem,
        descontoAplicado: totais.descontoAplicado,
        valorTotal: totais.valorTotal,
        ...pagamentoGravado(dados.condicaoPagamento, totais),
        itens: { create: itens.map(({ _calculo, ...item }) => item) },
      },
      include: { itens: true, cliente: true },
    });
  });
  return { orcamento, totais };
}

rotasOrcamentos.put(
  '/:id',
  rota(async (req, res) => {
    const { orcamento, totais } = await atualizarOrcamento(req.params.id, orcamentoSchema.parse(req.body));
    res.json({ ...orcamento, resumoPagamento: totais.resumoPagamento });
  }),
);

// --------------------------------------------------------------------------
// Mudança de status em 1 clique (botão da tabela e do Kanban)
// O mapa de transições fica em @guarusolar/compartilhado: o menu da lista usa o mesmo.
// --------------------------------------------------------------------------
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
    if (!podeMudarStatus(orcamento.status, status)) {
      throw new ErroHttp(
        409,
        `Um orçamento ${ROTULO_STATUS_ORCAMENTO[orcamento.status].toLowerCase()} não pode ir para ${ROTULO_STATUS_ORCAMENTO[status].toLowerCase()}`,
      );
    }

    const atualizado = await prisma.$transaction((tx) =>
      mudarStatus(tx, orcamento, status, req.usuario!.id, observacao),
    );
    // aprovado vira projeto na faixa "A agendar" da agenda
    if (status === 'APROVADO') operacaoMudou();
    res.json(atualizado);
  }),
);

/**
 * Aplica uma transição já validada: grava o status, a data do evento, o histórico e,
 * na aprovação, cria o projeto. Usada pelo PATCH /status e pelo envio via WhatsApp.
 */
async function mudarStatus(
  tx: Prisma.TransactionClient,
  orcamento: { id: string; status: StatusOrcamento; clienteId: string; enviadoEm: Date | null; aprovadoEm: Date | null; recusadoEm: Date | null; motivoRecusa: string | null },
  status: StatusOrcamento,
  usuarioId: string,
  observacao?: string,
) {
  const agora = new Date();
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
    data: { orcamentoId: orcamento.id, de: orcamento.status, para: status, usuarioId, observacao },
  });

  // Orçamento aprovado vira projeto e entra na fila de agendamento
  if (status === 'APROVADO') {
    const projeto = await tx.projeto.create({
      data: {
        codigo: await gerarCodigoProjeto(tx),
        orcamentoId: orcamento.id,
        clienteId: orcamento.clienteId,
      },
    });
    await registrarEvento(tx, {
      projetoId: projeto.id,
      tipo: 'PROJETO_CRIADO',
      descricao: `Orçamento ${novo.codigo} aprovado: projeto criado`,
      usuarioId,
    });
  }

  return novo;
}

// --------------------------------------------------------------------------
// Mensagem pronta de WhatsApp (o front abre o link retornado).
// POST porque altera dados: o rascunho enviado passa a ENVIADO (transição do mapa).
// Reenviar um orçamento que já saiu do rascunho não muda o status.
// --------------------------------------------------------------------------
rotasOrcamentos.post(
  '/:id/whatsapp',
  rota(async (req, res) => {
    const orcamento = await prisma.orcamento.findUnique({
      where: { id: req.params.id },
      include: { cliente: true },
    });
    if (!orcamento) throw new ErroHttp(404, 'Orçamento não encontrado');

    // o texto usa a cópia gravada (a mesma do PDF); orçamento antigo sem cópia usa o cadastro
    const primeiroNome = (orcamento.clienteNome ?? orcamento.cliente.nome).split(' ')[0];
    const mensagem = [
      `Olá, ${primeiroNome}! Tudo bem?`,
      '',
      // serve para solar e para carregador: o serviço vem do próprio orçamento, quando preenchido
      orcamento.descricaoServico
        ? `Segue a proposta ${orcamento.codigo} da Guarusolar para ${orcamento.descricaoServico.charAt(0).toLowerCase()}${orcamento.descricaoServico.slice(1)}:`
        : `Segue a proposta ${orcamento.codigo} da Guarusolar:`,
      '',
      // valores gravados ao salvar; nada é recalculado para a mensagem
      // com cartão, o total com a taxa repassada; sem cartão (ou orçamento antigo), o valor da proposta
      `• Valor total: ${formatarBRL(Number(orcamento.valorTotalCliente ?? orcamento.valorTotal))}`,
      `• Pagamento: ${orcamento.resumoPagamento ?? '[CONDIÇÃO DE PAGAMENTO]'}`,
      `• Validade: ${formatarData(orcamento.validade)}`,
      '',
      `Proposta completa em PDF: ${linkDoPdf(orcamento)}`,
      // o servidor gratuito pode estar "dormindo": a primeira abertura leva até 1 minuto
      '(se o link demorar a abrir, aguarde alguns segundos)',
      '',
      'Qualquer dúvida, estou à disposição!',
      `${req.usuario!.nome} · Guarusolar`,
    ].join('\n');

    let status = orcamento.status;
    if (orcamento.status === 'RASCUNHO' && podeMudarStatus('RASCUNHO', 'ENVIADO')) {
      const atualizado = await prisma.$transaction((tx) =>
        mudarStatus(tx, orcamento, 'ENVIADO', req.usuario!.id, 'Enviado pelo WhatsApp'),
      );
      status = atualizado.status;
    }

    // o envio vai para o WhatsApp ATUAL do cadastro: se o cliente trocou de número, chega no novo
    const telefone = `55${orcamento.cliente.whatsapp.replace(/\D/g, '')}`;
    res.json({
      mensagem,
      link: `https://wa.me/${telefone}?text=${encodeURIComponent(mensagem)}`,
      status,
    });
  }),
);
