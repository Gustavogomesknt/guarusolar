/*
 * npm run pdf:exemplo: gera propostas de EXEMPLO (dados fictícios, sem banco) para conferir o
 * layout depois de mexer em src/lib/pdf-orcamento.ts ou em src/conteudo/proposta.ts.
 *
 *   proposta-exemplo.pdf            padrão: só item e quantidade
 *   proposta-exemplo-precos.pdf     com "detalhar preços por item no PDF"
 *   proposta-exemplo-longa.pdf      muitos itens e observação longa (quebra de página)
 *
 * Os arquivos saem na pasta indicada (padrão: a pasta atual).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { Prisma } from '@prisma/client';
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

function exemplo(opcoes: { detalhar: boolean; longo?: boolean }): OrcamentoParaPdf {
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
  const subtotal = itens.reduce((t, i) => t + Number(i.subtotal), 0);
  const desconto = Math.round(subtotal * 0.05 * 100) / 100;
  const total = subtotal - desconto;
  const entrada = Math.round(total * 0.3 * 100) / 100;
  return {
    id: 'exemplo',
    codigo: 'GS-2026-0001',
    clienteId: 'cliente',
    vendedorId: 'vendedor',
    status: 'ENVIADO',
    subtotal: D(subtotal),
    descontoTipo: 'PERCENTUAL',
    descontoValor: D(5),
    descontoAplicado: D(desconto),
    valorTotal: D(total),
    condicaoPagamento: 'ENTRADA_PARCELAS',
    descontoAVistaPct: null,
    entradaPct: D(30),
    parcelas: 6,
    bancoFinanciamento: null,
    valorEntrada: D(entrada),
    valorParcela: D(Math.round(((total - entrada) / 6) * 100) / 100),
    resumoPagamento: null, // comResumo() preenche como o cálculo grava
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

function comResumo(o: OrcamentoParaPdf): OrcamentoParaPdf {
  const brl = (v: unknown) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  return { ...o, resumoPagamento: `Entrada de ${brl(o.valorEntrada)} + ${o.parcelas}x de ${brl(o.valorParcela)}` };
}

async function main() {
  const pasta = path.resolve(process.argv[2] ?? '.');
  mkdirSync(pasta, { recursive: true });
  const casos: [string, OrcamentoParaPdf][] = [
    ['proposta-exemplo.pdf', comResumo(exemplo({ detalhar: false }))],
    ['proposta-exemplo-precos.pdf', comResumo(exemplo({ detalhar: true }))],
    // sem resumo gravado (orçamento antigo): condição por extenso
    ['proposta-exemplo-longa.pdf', exemplo({ detalhar: true, longo: true })],
  ];
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
