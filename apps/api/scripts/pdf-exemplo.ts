/*
 * npm run pdf:exemplo: gera propostas de EXEMPLO (dados fictícios, sem banco) para conferir o
 * layout depois de mexer em src/lib/pdf-orcamento.ts ou em src/conteudo/proposta.ts.
 *
 *   proposta-exemplo.pdf            padrão: escopo em três seções (Documentação, Bombeiros,
 *                                   Infraestrutura), um item fora do PDF; entrada de 30% + 12x
 *   proposta-exemplo-duas-secoes.pdf  Documentação e Infraestrutura (sem itens de bombeiros), 12x
 *   proposta-exemplo-simples.pdf    todos os itens em Infraestrutura: uma seção só (12x)
 *   proposta-exemplo-longa.pdf      muitos itens e observação longa (quebra de página), 18x
 *
 * Cada caso sai nos dois modelos: o ATUAL na pasta indicada e o NOVO (três páginas, em
 * construção: lib/pdf-proposta-nova.ts) na subpasta nova/.
 *
 * Os valores saem do mesmo cálculo que a API grava (calcularOrcamento), e as contas do cartão
 * aparecem no terminal para conferir.
 *
 * Os arquivos saem na pasta indicada (padrão: a pasta atual).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { Prisma } from '@prisma/client';
import { calcularOrcamento, formatarBRL, GARANTIA_PADRAO, MARGEM_PADRAO, SUGESTOES_DE_PRAZO } from '@guarusolar/compartilhado';
import { gerarPdfOrcamento, type OrcamentoParaPdf } from '../src/lib/pdf-orcamento';

const D = (v: number) => new Prisma.Decimal(v);

type Grupo = 'MATERIAL' | 'DOCUMENTACAO' | 'BOMBEIROS';
type Secoes = 3 | 2 | 1;

function item(
  ordem: number,
  descricao: string,
  descricaoTecnica: string | null,
  quantidade: number,
  preco: number,
  unidade: 'UN' | 'M' | 'KIT' | 'SERVICO' = 'UN',
  grupoNaProposta: Grupo = 'MATERIAL',
  apareceNaProposta = true,
) {
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
    grupoNaProposta,
    apareceNaProposta,
    ordem,
    produto: { categoria: 'OUTROS' as const },
  };
}

function exemplo(opcoes: { secoes: Secoes; longo?: boolean; parcelas: number }): OrcamentoParaPdf {
  // 2 seções: sem bombeiros (o Kit vai para Infraestrutura); 1: tudo em Infraestrutura
  const g = (grupo: Grupo): Grupo => (opcoes.secoes === 3 || (opcoes.secoes === 2 && grupo === 'DOCUMENTACAO') ? grupo : 'MATERIAL');
  const itens = [
    item(0, 'Instalação completa', 'Mão de obra especializada', 1, 3200, 'SERVICO'),
    item(1, 'Materiais', 'Carregador não incluso', 1, 2480),
    item(2, 'Quadro de proteção', null, 1, 1650),
    item(3, 'ART elétrica / TRT / diagrama unifilar', null, 1, 980, 'UN', g('DOCUMENTACAO')),
    item(4, 'ART civil', null, 1, 760, 'UN', g('DOCUMENTACAO')),
    item(5, 'Kit IT 41', 'Sinalização e segurança', 1, 690, 'KIT', g('BOMBEIROS')),
    // entra no preço, não aparece no PDF ("aparece na proposta" desligado)
    item(6, 'Parafusos e buchas (não aparece no PDF)', null, 40, 1.5, 'UN', 'MATERIAL', false),
    ...(opcoes.longo
      ? Array.from({ length: 14 }, (_, i) => item(7 + i, `Cabo solar 6 mm² — trecho ${i + 1}`, 'Preto e vermelho, dupla isolação', 25 + i, 9.9, 'M'))
      : []),
  ];
  // o mesmo cálculo que a API faz ao salvar
  const t = calcularOrcamento({
    itens: itens.map((i) => ({ quantidade: Number(i.quantidade), precoUnitario: Number(i.precoUnitario) })),
    margem: MARGEM_PADRAO,
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
    margem: D(t.margem),
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
    tipoDeServico: { nome: 'Instalação de carregador veicular' },
    detalharPrecosNoPdf: false,
    prazoExecucao: opcoes.longo
      ? '45 dias após a aprovação, conforme a homologação na concessionária e a liberação do acesso ao local da instalação'
      : SUGESTOES_DE_PRAZO[2],
    garantia: GARANTIA_PADRAO,
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
    ['proposta-exemplo.pdf', exemplo({ secoes: 3, parcelas: 12 })],
    ['proposta-exemplo-duas-secoes.pdf', exemplo({ secoes: 2, parcelas: 12 })],
    ['proposta-exemplo-simples.pdf', exemplo({ secoes: 1, parcelas: 12 })],
    ['proposta-exemplo-longa.pdf', exemplo({ secoes: 3, longo: true, parcelas: 18 })],
  ];
  mostrarContas(casos[0][1]);
  mkdirSync(path.join(pasta, 'nova'), { recursive: true });
  for (const [nome, orcamento] of casos) {
    for (const modelo of ['atual', 'nova'] as const) {
      const destino = modelo === 'atual' ? path.join(pasta, nome) : path.join(pasta, 'nova', nome);
      writeFileSync(destino, await gerarPdfOrcamento(orcamento, modelo));
      console.log(destino);
    }
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
  Itens + margem ${formatarBRL(n(o.subtotal))} (margem ${formatarBRL(n(o.margem))}) - desconto ${formatarBRL(n(o.descontoAplicado))} = proposta ${formatarBRL(n(o.valorTotal))}
  Entrada 30% (Pix/transferência, sem taxa): ${formatarBRL(entrada)}
  Saldo no cartão: ${formatarBRL(saldo)} / (1 - ${taxa / 100}) = ${formatarBRL(saldo / (1 - taxa / 100))} -> cobrado ${formatarBRL(cobrado)} (para cima)
  Parcelas: 1a ${formatarBRL(n(o.valorPrimeiraParcela))} + ${parcelas - 1} x ${formatarBRL(n(o.valorParcela))} = ${formatarBRL(n(o.valorPrimeiraParcela) + (parcelas - 1) * n(o.valorParcela))}
  Cliente paga: ${formatarBRL(entrada)} + ${formatarBRL(cobrado)} = ${formatarBRL(n(o.valorTotalCliente))}
  Operadora desconta ${taxa}% de ${formatarBRL(cobrado)} = R$ ${(cobrado * taxa / 100).toFixed(4)}
  Do cartão sobra R$ ${(cobrado * (1 - taxa / 100)).toFixed(4)} (o saldo era ${formatarBRL(saldo)}: nunca menos)
  Guarusolar recebe: ${formatarBRL(entrada)} + ${formatarBRL(saldo)} = ${formatarBRL(n(o.valorTotal))} (o sistema arredonda para baixo)
`);
}
