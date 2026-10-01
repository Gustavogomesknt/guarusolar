/*
 * npm run pdf:exemplo: gera propostas de EXEMPLO (dados fictícios, sem banco) para conferir o
 * layout depois de mexer em src/lib/pdf-orcamento.ts ou em src/conteudo/proposta.ts.
 *
 *   proposta-exemplo.pdf            padrão: só item e quantidade; entrada de 30% + 12x no cartão
 *   proposta-exemplo-precos.pdf     com "detalhar preços por item no PDF" (12x)
 *   proposta-exemplo-longa.pdf      muitos itens e observação longa (quebra de página), 18x
 *
 * Os valores saem do mesmo cálculo que a API grava (calcularOrcamento), e as contas do cartão
 * aparecem no terminal para conferir.
 *
 * Os arquivos saem na pasta indicada (padrão: a pasta atual).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { Prisma } from '@prisma/client';
import { calcularOrcamento, formatarBRL } from '@guarusolar/compartilhado';
import { gerarPdfOrcamento, type OrcamentoParaPdf } from '../src/lib/pdf-orcamento';

const D = (v: number) => new Prisma.Decimal(v);

function item(ordem: number, descricao: string, descricaoTecnica: string | null, quantidade: number, preco: number, unidade: 'UN' | 'M' | 'KIT' | 'SERVICO' = 'UN') {
  return {
    id: `item-${ordem}`,
    orcamentoId: 'exemplo',
    produtoId: `produto-${ordem}`,
    descricao,
    descricaoTecnica,
    unidade,
    quantidade: D(quantidade),
    precoUnitario: D(preco),
    precoTabela: D(preco),
    subtotal: D(Math.round(quantidade * preco * 100) / 100),
    ordem,
    produto: { categoria: 'OUTROS' as const },
  };
}

function exemplo(opcoes: { detalhar: boolean; longo?: boolean; parcelas: number }): OrcamentoParaPdf {
  const itens = [
    item(0, 'Instalação completa', 'Mão de obra especializada', 1, 3200, 'SERVICO'),
    item(1, 'Materiais', 'Carregador não incluso', 1, 2480),
    item(2, 'Quadro de proteção', null, 1, 1650),
    item(3, 'ART elétrica / TRT / diagrama unifilar', null, 1, 980),
    item(4, 'ART civil', null, 1, 760),
    item(5, 'Kit IT 41', 'Sinalização e segurança', 1, 690, 'KIT'),
    ...(opcoes.longo
      ? Array.from({ length: 14 }, (_, i) => item(6 + i, `Cabo solar 6 mm² — trecho ${i + 1}`, 'Preto e vermelho, dupla isolação', 25 + i, 9.9, 'M'))
      : []),
  ];
  // o mesmo cálculo que a API faz ao salvar
  const t = calcularOrcamento({
    itens: itens.map((i) => ({ quantidade: Number(i.quantidade), precoUnitario: Number(i.precoUnitario) })),
    descontoTipo: 'PERCENTUAL',
    descontoValor: 5,
    condicaoPagamento: 'ENTRADA_PARCELAS',
    entradaPct: 30,
    parcelas: opcoes.parcelas,
  });
  const c = t.cartao!;
  return {
    id: 'exemplo',
    codigo: 'GS-2026-0001',
    clienteId: 'cliente',
    vendedorId: 'vendedor',
    status: 'ENVIADO',
    subtotal: D(t.subtotal),
    descontoTipo: 'PERCENTUAL',
    descontoValor: D(5),
    descontoAplicado: D(t.descontoAplicado),
    valorTotal: D(t.valorTotal),
    condicaoPagamento: 'ENTRADA_PARCELAS',
    descontoAVistaPct: null,
    entradaPct: D(30),
    parcelas: c.parcelas,
    bancoFinanciamento: null,
    valorEntrada: D(t.entrada),
    valorParcela: D(c.valorParcela),
    resumoPagamento: t.resumoPagamento,
    pagamentoDebito: c.debito,
    absorverTaxaCartao: c.absorvida,
    taxaCartaoPct: D(c.taxaPct),
    valorPrimeiraParcela: D(c.valorPrimeiraParcela),
    valorTotalCliente: D(t.valorTotalCliente),
    valorTaxaAbsorvida: D(c.valorAbsorvido),
    tokenPdf: 'exemplo',
    validade: new Date('2026-10-31T12:00:00Z'),
    observacoes: opcoes.longo
      ? Array.from({ length: 6 }, () => 'Instalação condicionada à vistoria técnica do local e à disponibilidade de carga no padrão de entrada. ').join('')
      : 'Instalação em até 3 metros do quadro de distribuição. Vistoria técnica incluída.',
    descricaoServico: 'Instalação de carregador veicular · Residencial',
    detalharPrecosNoPdf: opcoes.detalhar,
    enviadoEm: null,
    aprovadoEm: null,
    recusadoEm: null,
    motivoRecusa: null,
    criadoEm: new Date('2026-10-01T15:00:00Z'),
    editadoEm: new Date('2026-10-01T15:00:00Z'),
    cliente: {
      id: 'cliente',
      tipoPessoa: 'FISICA',
      nome: 'Cliente de Exemplo da Silva',
      documento: '00000000000',
      whatsapp: '11900000000',
      email: 'cliente@exemplo.com.br',
      cep: '07000000',
      logradouro: 'Rua de Exemplo',
      numero: '100',
      complemento: null,
      bairro: 'Centro',
      cidade: 'Guarulhos',
      uf: 'SP',
      observacoes: null,
      ativo: true,
      criadoEm: new Date(),
      editadoEm: new Date(),
    },
    vendedor: { nome: 'Vendedor de Exemplo', telefone: '11900000001' },
    itens,
  } as OrcamentoParaPdf;
}

async function main() {
  const pasta = path.resolve(process.argv[2] ?? '.');
  mkdirSync(pasta, { recursive: true });
  const casos: [string, OrcamentoParaPdf][] = [
    ['proposta-exemplo.pdf', exemplo({ detalhar: false, parcelas: 12 })],
    ['proposta-exemplo-precos.pdf', exemplo({ detalhar: true, parcelas: 12 })],
    ['proposta-exemplo-longa.pdf', exemplo({ detalhar: true, longo: true, parcelas: 18 })],
  ];
  mostrarContas(casos[0][1]);
  for (const [nome, orcamento] of casos) {
    const destino = path.join(pasta, nome);
    writeFileSync(destino, await gerarPdfOrcamento(orcamento));
    console.log(destino);
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

/** As contas do cartão, para conferir no terminal. */
function mostrarContas(o: OrcamentoParaPdf) {
  const n = (v: unknown) => Number(v ?? 0);
  const entrada = n(o.valorEntrada);
  const saldo = n(o.valorTotal) - entrada;
  const cobrado = n(o.valorTotalCliente) - entrada;
  const taxa = n(o.taxaCartaoPct);
  const parcelas = o.parcelas ?? 1;
  console.log(`
Contas de ${o.codigo} (${parcelas}x, taxa ${taxa}%):
  Itens ${formatarBRL(n(o.subtotal))} - desconto ${formatarBRL(n(o.descontoAplicado))} = proposta ${formatarBRL(n(o.valorTotal))}
  Entrada 30% (Pix/transferência, sem taxa): ${formatarBRL(entrada)}
  Saldo no cartão: ${formatarBRL(saldo)} / (1 - ${taxa / 100}) = ${formatarBRL(saldo / (1 - taxa / 100))} -> cobrado ${formatarBRL(cobrado)} (para cima)
  Parcelas: 1a ${formatarBRL(n(o.valorPrimeiraParcela))} + ${parcelas - 1} x ${formatarBRL(n(o.valorParcela))} = ${formatarBRL(n(o.valorPrimeiraParcela) + (parcelas - 1) * n(o.valorParcela))}
  Cliente paga: ${formatarBRL(entrada)} + ${formatarBRL(cobrado)} = ${formatarBRL(n(o.valorTotalCliente))}
  Operadora desconta ${taxa}% de ${formatarBRL(cobrado)} = R$ ${(cobrado * taxa / 100).toFixed(4)}
  Do cartão sobra R$ ${(cobrado * (1 - taxa / 100)).toFixed(4)} (o saldo era ${formatarBRL(saldo)}: nunca menos)
  Guarusolar recebe: ${formatarBRL(entrada)} + ${formatarBRL(saldo)} = ${formatarBRL(n(o.valorTotal))} (o sistema arredonda para baixo)
`);
}
