import path from 'node:path';
import pdfmake from 'pdfmake';
import PDFDocument from 'pdfkit';
import type { Content, ContentCanvas, TDocumentDefinitions } from 'pdfmake/interfaces';
import type { Prisma } from '@prisma/client';
import {
  formatarBRL,
  formatarData,
  formatarQuantidade,
  mascararCep,
  mascararTelefone,
  ROTULO_UNIDADE,
} from '@guarusolar/compartilhado';
import { EMPRESA, INSTITUCIONAL, PAGINA_1, type IconePilar } from '../conteudo/proposta';

/*
 * Proposta comercial em PDF (A4, layout aprovado no canvas "Nova proposta comercial"):
 * página 1 = a proposta do orçamento; última página = institucional, fixa.
 * Textos fixos, dados da empresa e a página institucional: src/conteudo/proposta.ts.
 *
 * Gerado com pdfmake: só JavaScript, sem navegador embutido, poucos MB de memória por
 * documento (cabe nos 512 MB do plano gratuito da Render).
 *
 * REGRA: tudo vem do que está gravado no banco (totais, subtotais dos itens, entrada,
 * parcela e resumo do pagamento). Nada é recalculado aqui.
 *
 * O pdfmake não arredonda células de tabela: as caixas arredondadas são um retângulo
 * desenhado (canvas, fora do fluxo) sob uma tabela de uma célula com a mesma altura.
 * Por isso cada caixa tem altura definida aqui; quando o texto varia, ela é MEDIDA com a
 * mesma fonte (pdfkit, o motor do pdfmake), nunca estimada.
 */

const COR = {
  marinho: '#0E2E60',
  laranja: '#F26B21',
  laranjaClaro: '#FEF5EE',
  laranjaBorda: '#F3C9A8',
  laranjaTexto: '#8A4B07',
  laranjaIcone: '#FEF0E6',
  texto: '#10243D',
  textoMedio: '#3A4A5E',
  secundario: '#5A6675',
  borda: '#D9E0EA',
  linha: '#EDF1F6',
  zebra: '#F8FAFD',
  azulClaro: '#BBD0EC',
  divisoria: '#2A5290',
  assinatura: '#A9B6C6',
  branco: '#FFFFFF',
};

// A4 em pontos; medidas do canvas (px) x 0,75
const PAGINA = { largura: 595.28, altura: 841.89 };
const LATERAL = 36;
const LARGURA = PAGINA.largura - 2 * LATERAL;
const CABECALHO = 72; // faixa azul
const FAIXA_LARANJA = 3.75;
const RODAPE = 26; // faixa azul de baixo (na página institucional, 40: duas linhas)
const RODAPE_COMPLETO = 40;

// Ícone de sol provisório (o mesmo das telas) até o cliente enviar o logo.
const svgIcone = (d: string, cor: string, espessura = 2) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${cor}" stroke-width="${espessura}" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const DESENHO: Record<IconePilar, string> = {
  sol: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
  escudo: '<path d="M12 3l7 3v5c0 4.5-3 8.3-7 9.5C8 19.3 5 15.5 5 11V6z"/><path d="M9 12l2 2 4-4"/>',
  raio: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
  fone: '<path d="M4 13v-1a8 8 0 0 1 16 0v1"/><path d="M4 13h3v6H5a1 1 0 0 1-1-1zM20 13h-3v6h2a1 1 0 0 0 1-1z"/>',
};

// Fontes em WOFF (não WOFF2) e só a IBM Plex Sans: o fontkit do pdfkit quebra ao montar o
// subconjunto de glifos ("Offset is outside the bounds of the DataView") com os arquivos
// WOFF2 em letras acentuadas e com a IBM Plex Mono em qualquer formato. Testado letra a letra.
// A Bricolage Grotesque dos títulos só existe como fonte variável WOFF2: os títulos usam a
// Plex Sans em negrito.
const fonte = (arquivo: string) => require.resolve(`@fontsource/${arquivo}`);
const FONTES = {
  PlexSans: {
    normal: fonte('ibm-plex-sans/files/ibm-plex-sans-latin-400-normal.woff'),
    bold: fonte('ibm-plex-sans/files/ibm-plex-sans-latin-700-normal.woff'),
    italics: fonte('ibm-plex-sans/files/ibm-plex-sans-latin-400-italic.woff'),
    bolditalics: fonte('ibm-plex-sans/files/ibm-plex-sans-latin-700-italic.woff'),
  },
};
const LOGO = EMPRESA.logo ? path.resolve(__dirname, '../..', EMPRESA.logo) : null;
const ARQUIVOS_PERMITIDOS = new Set([...Object.values(FONTES).flatMap((f) => Object.values(f)), ...(LOGO ? [LOGO] : [])]);

pdfmake.setFonts(FONTES);
// o documento não busca nada na internet e só lê as fontes e o logo acima
pdfmake.setUrlAccessPolicy(() => false);
pdfmake.setLocalAccessPolicy((caminho) => ARQUIVOS_PERMITIDOS.has(caminho));

export type OrcamentoParaPdf = Prisma.OrcamentoGetPayload<{
  include: {
    cliente: true;
    vendedor: { select: { nome: true; telefone: true } };
    itens: { include: { produto: { select: { categoria: true } } } };
  };
}>;

const numero = (v: Prisma.Decimal | number | null | undefined) => Number(v ?? 0);
const pct = (v: Prisma.Decimal | number | null | undefined) => `${formatarQuantidade(numero(v))}%`;

/** Condição de pagamento por extenso, com os valores gravados. */
function condicaoPorExtenso(o: OrcamentoParaPdf): string {
  switch (o.condicaoPagamento) {
    case 'A_VISTA':
      return numero(o.descontoAVistaPct) > 0
        ? `À vista, via Pix ou transferência bancária, com ${pct(o.descontoAVistaPct)} de desconto já aplicado no valor total.`
        : 'À vista, via Pix ou transferência bancária.';
    case 'ENTRADA_PARCELAS': {
      const parcelas = o.parcelas ?? 1;
      const saldo = `${parcelas} ${parcelas === 1 ? 'parcela mensal' : 'parcelas mensais'} de ${formatarBRL(numero(o.valorParcela))}, sem juros, no boleto ou no cartão de crédito`;
      return numero(o.valorEntrada) > 0
        ? `Entrada de ${formatarBRL(numero(o.valorEntrada))} (${pct(o.entradaPct)} do total) e o saldo em ${saldo}.`
        : `Sem entrada: ${saldo}.`;
    }
    case 'FINANCIAMENTO':
      return (
        `Financiamento solar pela linha de crédito do banco parceiro (${o.bancoFinanciamento || '[BANCO PARCEIRO]'}). ` +
        'O valor total ao lado é a base para a simulação; taxa e número de parcelas dependem da análise de crédito.'
      );
  }
}

// ---------------------------------------------------------------------------------------------
// Peças de desenho
// ---------------------------------------------------------------------------------------------

type Margem = [number, number, number, number];
/**
 * Peça montada aqui e encaixada em colunas e pilhas. Os tipos do pdfmake não descrevem bem
 * colunas com largura fixa espalhadas ({ width, ...caixa }); a estrutura é conferida no PDF.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Peca = any;

// Medidor: um documento do pdfkit só em memória (nunca gravado), com as fontes do PDF.
const medidor = new PDFDocument({ size: 'A4' });
medidor.registerFont('normal', FONTES.PlexSans.normal);
medidor.registerFont('negrito', FONTES.PlexSans.bold);

/** Altura que um texto ocupa no PDF: as linhas quebradas como o pdfmake quebra x altura da linha. */
function alturaDoTexto(texto: string, largura: number, tamanho: number, entrelinha = 1.15, negrito = false) {
  medidor.font(negrito ? 'negrito' : 'normal').fontSize(tamanho);
  const linha = medidor.currentLineHeight(true);
  const quantas = Math.max(1, Math.round(medidor.heightOfString(texto, { width: largura, lineGap: 0 }) / linha));
  return quantas * linha * entrelinha;
}

const semBordas = (padding: Margem) => ({
  hLineWidth: () => 0,
  vLineWidth: () => 0,
  paddingLeft: () => padding[0],
  paddingTop: () => padding[1],
  paddingRight: () => padding[2],
  paddingBottom: () => padding[3],
});

/** Caixa arredondada de tamanho definido, com o conteúdo por cima. */
function caixa(
  conteudo: Peca,
  o: { largura: number; altura: number; fundo?: string; borda?: string | null; raio?: number; padding?: Margem; margem?: Margem },
): Peca {
  const padding = o.padding ?? [12, 9, 12, 9];
  return {
    margin: o.margem,
    stack: [
      {
        canvas: [
          {
            type: 'rect',
            x: 0,
            y: 0,
            w: o.largura,
            h: o.altura,
            r: o.raio ?? 9,
            color: o.fundo ?? COR.branco,
            lineColor: o.borda ?? o.fundo ?? COR.branco,
            lineWidth: o.borda ? 0.75 : 0,
          },
        ],
        relativePosition: { x: 0, y: 0 },
      },
      {
        table: { widths: [o.largura - padding[0] - padding[2]], heights: [o.altura - padding[1] - padding[3]], body: [[conteudo]] },
        layout: semBordas(padding),
      },
    ],
  };
}

const rotulo = (texto: string, cor: string = COR.laranja, margem: Margem = [0, 0, 0, 4]): Content => ({
  text: texto,
  fontSize: 7.5,
  bold: true,
  characterSpacing: 1,
  color: cor,
  margin: margem,
});

const linhaHorizontal = (largura: number, cor: string, espessura = 0.75): ContentCanvas => ({
  canvas: [{ type: 'line', x1: 0, y1: 0, x2: largura, y2: 0, lineWidth: espessura, lineColor: cor }],
});

/** Logo da empresa (arquivo) ou o sol provisório. */
function logo(tamanho: number): Content {
  if (LOGO) return { image: LOGO, fit: [tamanho, tamanho] };
  return { svg: svgIcone(DESENHO.sol, COR.laranja), width: tamanho * 0.72, height: tamanho * 0.72, margin: [tamanho * 0.14, tamanho * 0.14, 0, 0] };
}

function marca(tamanho: number): Content {
  return {
    stack: [
      { text: [{ text: 'GUARU', color: COR.branco }, { text: 'SOLAR', color: COR.laranja }], fontSize: tamanho, bold: true, lineHeight: 1 },
      { text: EMPRESA.slogan, fontSize: tamanho * 0.32, color: COR.azulClaro, characterSpacing: 1.6, margin: [0, 3, 0, 0] },
    ],
  };
}

// ---------------------------------------------------------------------------------------------
// Página 1: a proposta
// ---------------------------------------------------------------------------------------------

function paginaDaProposta(o: OrcamentoParaPdf): Content[] {
  const c = o.cliente;
  const endereco = [[c.logradouro, c.numero].filter(Boolean).join(', '), c.complemento, c.bairro].filter(Boolean).join(' — ');
  const cidade = [[c.cidade, c.uf].filter(Boolean).join('/'), c.cep ? `CEP ${mascararCep(c.cep)}` : null].filter(Boolean).join(' · ');
  const contato = [mascararTelefone(c.whatsapp), c.email].filter(Boolean).join(' · ');

  // --- Cliente ao lado de emissão, validade e consultor
  const larguraDatas = 210;
  const larguraCliente = LARGURA - larguraDatas - 12;
  const linhaDeData = (titulo: string, valor: string, destaque = false, margem: Margem = [0, 0, 0, 0]): Peca =>
    caixa(
      {
        columns: [
          { text: titulo, fontSize: 9, color: destaque ? COR.laranjaTexto : COR.secundario, width: '*' },
          { text: valor, fontSize: 10.5, bold: true, color: destaque ? COR.laranjaTexto : COR.texto, width: 'auto' },
        ],
      },
      {
        largura: larguraDatas,
        altura: 27,
        padding: [12, 8, 12, 5],
        margem,
        fundo: destaque ? COR.laranjaClaro : COR.branco,
        borda: destaque ? COR.laranjaBorda : COR.borda,
      },
    );
  const larguraTexto = larguraCliente - 28;
  const alturaCliente = Math.max(
    3 * 27 + 2 * 6,
    20 + 14 + alturaDoTexto(c.nome, larguraTexto, 13, 1.15, true) + 3 +
      [endereco, cidade, contato].filter(Boolean).reduce((t, linha) => t + alturaDoTexto(linha, larguraTexto, 10), 0) + 2,
  );

  const blocoCliente: Peca = {
    columns: [
      {
        width: larguraCliente,
        ...(caixa(
          {
            stack: [
              rotulo('CLIENTE'),
              { text: c.nome, fontSize: 13, bold: true, lineHeight: 1.15, margin: [0, 0, 0, 3] },
              ...(endereco ? [{ text: endereco, fontSize: 10, color: COR.textoMedio }] : []),
              ...(cidade ? [{ text: cidade, fontSize: 10, color: COR.textoMedio }] : []),
              { text: contato, fontSize: 10, color: COR.textoMedio, margin: [0, 2, 0, 0] },
            ],
          },
          { largura: larguraCliente, altura: alturaCliente, borda: COR.borda, padding: [14, 11, 14, 9] },
        ) as object),
      },
      {
        width: larguraDatas,
        stack: [
          linhaDeData('Emissão', formatarData(o.criadoEm)),
          linhaDeData('Proposta válida até', formatarData(o.validade), true, [0, 6, 0, 0]),
          linhaDeData('Consultor', o.vendedor.nome, false, [0, 6, 0, 0]),
        ],
      },
    ],
    columnGap: 12,
  };

  // --- Itens: só item e quantidade, ou com preços (detalharPrecosNoPdf)
  const detalhar = o.detalharPrecosNoPdf;
  const larguras = detalhar ? ['*', 62, 80, 86] : ['*', 112];
  const cabecalho = detalhar
    ? ['ITEM / SERVIÇO', 'QTD.', 'PREÇO UNIT.', 'SUBTOTAL']
    : ['ITEM / SERVIÇO', 'QUANTIDADE'];
  const alinhar = (i: number) => (i === 0 ? 'left' : detalhar ? 'right' : 'center');
  const itens = o.itens.slice().sort((a, b) => a.ordem - b.ordem);
  const quantidade = (item: (typeof itens)[number]) =>
    item.unidade === 'UN' || item.unidade === 'SERVICO' ? formatarQuantidade(numero(item.quantidade)) : `${formatarQuantidade(numero(item.quantidade))} ${ROTULO_UNIDADE[item.unidade]}`;
  const linhasItens = itens.map((item) => [
    {
      stack: [
        { text: item.descricao, bold: true, fontSize: 10 },
        ...(item.descricaoTecnica ? [{ text: item.descricaoTecnica, fontSize: 8, color: COR.secundario, margin: [0, 1, 0, 0] }] : []),
      ],
    },
    { text: quantidade(item), alignment: alinhar(1), fontSize: 10 },
    ...(detalhar
      ? [
          { text: formatarBRL(numero(item.precoUnitario)), alignment: 'right', fontSize: 10 },
          { text: formatarBRL(numero(item.subtotal)), alignment: 'right', fontSize: 10, bold: true },
        ]
      : []),
  ]);
  const colunas = larguras.length;
  const corpo = [
    cabecalho.map((t, i) => ({ text: t, alignment: alinhar(i), fontSize: 8, bold: true, color: COR.branco, characterSpacing: 0.8 })),
    ...linhasItens,
    [
      { text: PAGINA_1.notaDosItens, colSpan: colunas, fontSize: 8.5, color: COR.secundario },
      ...Array.from({ length: colunas - 1 }, () => ({})),
    ],
  ];
  const ultima = corpo.length - 1;
  const tabelaItens: Peca = {
    table: { headerRows: 1, dontBreakRows: true, widths: larguras, body: corpo },
    layout: {
      fillColor: (i: number) => (i === 0 ? COR.marinho : i === ultima ? COR.zebra : i % 2 === 1 ? COR.branco : COR.zebra),
      hLineWidth: (i: number, no: { table: { body: unknown[] } }) => (i === 0 || i === 1 ? 0 : i === no.table.body.length ? 0.75 : 0.75),
      hLineColor: (i: number, no: { table: { body: unknown[] } }) => (i === no.table.body.length || i === ultima ? COR.borda : COR.linha),
      // nas bordas, a linha cinza; entre as colunas do cabeçalho, uma da cor do fundo (sem emenda clara)
      vLineWidth: (i: number, no: { table: { widths?: unknown[] } }, linha?: number) =>
        i === 0 || i === (no.table.widths?.length ?? 0) ? 0.75 : linha === 0 ? 0.75 : 0,
      vLineColor: (i: number, no: { table: { widths?: unknown[] } }, linha?: number) =>
        i === 0 || i === (no.table.widths?.length ?? 0) ? (linha === 0 ? COR.marinho : COR.borda) : COR.marinho,
      paddingLeft: () => 13,
      paddingRight: () => 13,
      paddingTop: (i: number) => (i === 0 ? 7 : 5),
      paddingBottom: (i: number) => (i === 0 ? 6 : 5),
    },
  } as Content;

  // --- Pagamento ao lado do valor total
  const larguraTotal = 225;
  const larguraPagamento = LARGURA - larguraTotal - 12;
  // resumo curto gravado (como no canvas); por extenso só em orçamento antigo, sem resumo
  const textoPagamento = o.resumoPagamento
    ? o.condicaoPagamento === 'FINANCIAMENTO' && o.bancoFinanciamento
      ? `${o.resumoPagamento} (${o.bancoFinanciamento})`
      : o.resumoPagamento
    : condicaoPorExtenso(o);
  const desconto = numero(o.descontoAplicado);
  const alturaPagamento = Math.max(
    76,
    35 + alturaDoTexto(textoPagamento, larguraPagamento - 28, 10.5, 1.3, true) + (PAGINA_1.notaDoPagamento ? 4 + alturaDoTexto(PAGINA_1.notaDoPagamento, larguraPagamento - 28, 9, 1.3) : 0),
  );
  const linhaDoDesconto =
    desconto > 0
      ? detalhar
        ? `Subtotal ${formatarBRL(numero(o.subtotal))} · desconto de ${formatarBRL(desconto)}`
        : `Já com desconto de ${formatarBRL(desconto)}`
      : '';
  const blocoPagamento: Peca = {
    columns: [
      {
        width: larguraPagamento,
        ...(caixa(
          {
            stack: [
              rotulo('CONDIÇÕES DE PAGAMENTO'),
              { text: textoPagamento, fontSize: 10.5, bold: true, lineHeight: 1.3 },
              ...(PAGINA_1.notaDoPagamento
                ? [{ text: PAGINA_1.notaDoPagamento, fontSize: 9, color: COR.textoMedio, lineHeight: 1.3, margin: [0, 4, 0, 0] }]
                : []),
            ],
          },
          { largura: larguraPagamento, altura: alturaPagamento, borda: COR.borda, padding: [14, 11, 14, 9] },
        ) as object),
      },
      {
        width: larguraTotal,
        ...(caixa(
          {
            stack: [
              { text: 'VALOR TOTAL DA PROPOSTA', fontSize: 8, bold: true, characterSpacing: 0.9, color: COR.branco },
              { text: formatarBRL(numero(o.valorTotal)), fontSize: 27, bold: true, color: COR.branco, lineHeight: 1.1, margin: [0, 2, 0, 0] },
              ...(linhaDoDesconto ? [{ text: linhaDoDesconto, fontSize: 8.5, color: COR.branco, margin: [0, 2, 0, 0] }] : []),
            ],
          },
          {
            largura: larguraTotal,
            altura: alturaPagamento,
            fundo: COR.laranja,
            padding: [15, Math.max(10, (alturaPagamento - (linhaDoDesconto ? 58 : 46)) / 2), 15, 8],
          },
        ) as object),
      },
    ],
    columnGap: 12,
  };

  // --- Prazo, garantia e suporte
  const larguraTerco = (LARGURA - 2 * 9) / 3;
  const textos = [PAGINA_1.prazo.texto, PAGINA_1.garantia.texto, PAGINA_1.suporte.texto];
  const alturaCaixinha = 29 + Math.max(...textos.map((t) => alturaDoTexto(t, larguraTerco - 22, 9.5, 1.25)));
  const caixinha = (titulo: string, texto: string): Peca => ({
    width: larguraTerco,
    ...(caixa(
      { stack: [rotulo(titulo, COR.secundario, [0, 0, 0, 3]), { text: texto, fontSize: 9.5, lineHeight: 1.25 }] },
      { largura: larguraTerco, altura: alturaCaixinha, borda: COR.borda, padding: [11, 9, 11, 6] },
    ) as object),
  });
  const blocoCondicoes: Peca = {
    columns: [
      caixinha(PAGINA_1.prazo.titulo, PAGINA_1.prazo.texto),
      caixinha(PAGINA_1.garantia.titulo, PAGINA_1.garantia.texto),
      caixinha(PAGINA_1.suporte.titulo, PAGINA_1.suporte.texto),
    ],
    columnGap: 9,
  };

  // --- Observações (barra laranja à esquerda); longas quebram de página normalmente
  const observacoes: Content[] = o.observacoes
    ? [
        {
          table: {
            widths: ['*'],
            body: [[{ stack: [rotulo('OBSERVAÇÕES', COR.secundario, [0, 0, 0, 2]), { text: o.observacoes, fontSize: 10, color: COR.textoMedio, lineHeight: 1.3 }] }]],
          },
          layout: {
            hLineWidth: () => 0,
            vLineWidth: (i: number) => (i === 0 ? 2.25 : 0),
            vLineColor: () => COR.laranja,
            paddingLeft: () => 11,
            paddingRight: () => 0,
            paddingTop: () => 1,
            paddingBottom: () => 1,
          },
        } as Content,
      ]
    : [];

  // --- Aceite
  const aceite: Content = {
    unbreakable: true,
    margin: [0, 26, 0, 0],
    columns: [
      { width: '*', stack: [linhaHorizontal((LARGURA - 27) * 0.615, COR.assinatura), { text: `Aceite do cliente — ${c.nome}`, fontSize: 8.5, color: COR.secundario, margin: [0, 5, 0, 0] }] },
      { width: (LARGURA - 27) * 0.385, stack: [linhaHorizontal((LARGURA - 27) * 0.385, COR.assinatura), { text: 'Data', fontSize: 8.5, color: COR.secundario, margin: [0, 5, 0, 0] }] },
    ],
    columnGap: 27,
  };

  return [
    { text: 'Proposta comercial', fontSize: 22, bold: true, lineHeight: 1, characterSpacing: -0.3 },
    ...(o.descricaoServico ? [{ text: o.descricaoServico, fontSize: 10, color: COR.secundario, margin: [0, 3, 0, 0] } as Content] : []),
    { ...blocoCliente, margin: [0, 12, 0, 0] } as Content,
    { ...tabelaItens, margin: [0, 12, 0, 0] } as Content,
    { ...blocoPagamento, margin: [0, 12, 0, 0], unbreakable: true } as Content,
    { ...blocoCondicoes, margin: [0, 10, 0, 0], unbreakable: true } as Content,
    // curta, fica inteira na mesma página; longa demais para uma página, quebra normalmente
    ...observacoes.map((b) => ({ ...(b as object), margin: [0, 12, 0, 0], unbreakable: (o.observacoes ?? '').length < 1200 }) as Content),
    aceite,
  ];
}

// ---------------------------------------------------------------------------------------------
// Última página: institucional (src/conteudo/proposta.ts)
// ---------------------------------------------------------------------------------------------

function paginaInstitucional(o: OrcamentoParaPdf): Content[] {
  const I = INSTITUCIONAL;

  const destaque = caixa(
    {
      columns: [
        {
          width: 'auto',
          text: [
            { text: `${I.destaque.prefixo} `, fontSize: 15, bold: true, color: COR.branco },
            { text: I.destaque.numero, fontSize: 40, bold: true, color: COR.laranja },
          ],
          lineHeight: 1,
        },
        { width: 1, canvas: [{ type: 'line', x1: 0, y1: 4, x2: 0, y2: 38, lineWidth: 0.75, lineColor: COR.divisoria }] },
        {
          width: '*',
          margin: [0, 6, 0, 0],
          stack: [
            { text: I.destaque.titulo, fontSize: 12, bold: true, color: COR.branco },
            { text: I.destaque.texto, fontSize: 9.5, color: COR.azulClaro, margin: [0, 1, 0, 0] },
          ],
        },
      ],
      columnGap: 16,
    },
    { largura: LARGURA, altura: 66, fundo: COR.marinho, raio: 10, padding: [20, 12, 20, 8] },
  );

  const marcas = I.homologacoes.marcas;
  const larguraMarca = (LARGURA - (marcas.length - 1) * 9) / marcas.length;
  const homologacoes: Peca = {
    stack: [
      rotulo(I.homologacoes.titulo, COR.laranja, [0, 0, 0, 8]),
      {
        columns: marcas.map((nome) => ({
          width: larguraMarca,
          ...(caixa(
            { text: nome, alignment: 'center', fontSize: 11.5, bold: true, color: COR.marinho, characterSpacing: 0.5 },
            { largura: larguraMarca, altura: 46, borda: COR.borda, raio: 8, padding: [6, 16, 6, 6] },
          ) as object),
        })),
        columnGap: 9,
      },
      ...(I.homologacoes.nota ? [{ text: I.homologacoes.nota, fontSize: 8.5, color: COR.secundario, margin: [0, 7, 0, 0] } as Content] : []),
    ],
  };

  const larguraPilar = (LARGURA - 10) / 2;
  const pilar = (p: (typeof I.pilares)[number]): Peca => ({
    width: larguraPilar,
    ...(caixa(
      {
        columns: [
          {
            width: 28,
            stack: [
              { canvas: [{ type: 'ellipse', x: 14, y: 14, r1: 14, r2: 14, color: COR.laranjaIcone }], relativePosition: { x: 0, y: 0 } },
              { svg: svgIcone(DESENHO[p.icone], COR.laranja), width: 15, height: 15, margin: [6.5, 6.5, 0, 0] },
            ],
          },
          {
            width: '*',
            stack: [
              { text: p.titulo, fontSize: 11, bold: true },
              { text: p.texto, fontSize: 9.5, color: COR.textoMedio, lineHeight: 1.3, margin: [0, 1, 0, 0] },
            ],
          },
        ],
        columnGap: 10,
      },
      { largura: larguraPilar, altura: 60, borda: COR.borda, padding: [12, 11, 12, 6] },
    ) as object),
  });
  const pilares: Content[] = [];
  for (let i = 0; i < I.pilares.length; i += 2) {
    pilares.push({
      columns: [pilar(I.pilares[i]), I.pilares[i + 1] ? pilar(I.pilares[i + 1]) : { width: larguraPilar, text: '' }],
      columnGap: 10,
      margin: [0, i === 0 ? 0 : 10, 0, 0],
    });
  }

  const etapas = I.comoFunciona.etapas;
  const larguraEtapa = (LARGURA - (etapas.length - 1) * 8) / etapas.length;
  const comoFunciona: Peca = {
    stack: [
      rotulo(I.comoFunciona.titulo, COR.laranja, [0, 0, 0, 9]),
      {
        columns: etapas.map((e, i) => ({
          width: larguraEtapa,
          stack: [
            {
              canvas: [
                { type: 'ellipse', x: 9, y: 9, r1: 9, r2: 9, color: COR.marinho },
                { type: 'rect', x: 24, y: 8.25, w: larguraEtapa - 28, h: 1.5, color: COR.linha },
              ],
            },
            // o número fica sobre o círculo (fora do fluxo, logo acima)
            { text: String(i + 1), color: COR.branco, bold: true, fontSize: 9, relativePosition: { x: 6.4, y: -15.5 } },
            { text: e.titulo, fontSize: 10, bold: true, margin: [0, 7, 0, 0] },
            { text: e.texto, fontSize: 8.5, color: COR.secundario, lineHeight: 1.3, margin: [0, 2, 0, 0] },
          ],
        })),
        columnGap: 8,
      },
    ],
  };

  const telefoneVendedor = o.vendedor.telefone?.replace(/\D/g, '') ?? '';
  const comQr = I.contato.qrCodeWhatsApp && telefoneVendedor.length >= 10;
  const frase = telefoneVendedor
    ? `Fale com ${o.vendedor.nome} no WhatsApp ${mascararTelefone(telefoneVendedor)}.`
    : `Fale com ${o.vendedor.nome} pelo telefone ${EMPRESA.telefone}.`;
  const contato = caixa(
    {
      columns: [
        {
          width: '*',
          margin: [0, comQr ? 13 : 0, 0, 0],
          stack: [
            { text: I.contato.titulo, fontSize: 11, bold: true, color: COR.laranjaTexto },
            { text: frase, fontSize: 9.5, color: COR.laranjaTexto, margin: [0, 2, 0, 0] },
          ],
        },
        ...(comQr ? [{ width: 54, qr: `https://wa.me/55${telefoneVendedor}`, fit: 54, foreground: COR.marinho, background: COR.laranjaClaro } as Content] : []),
      ],
      columnGap: 12,
    },
    { largura: LARGURA, altura: comQr ? 76 : 50, fundo: COR.laranjaClaro, borda: COR.laranjaBorda, padding: [14, 11, 14, 8] },
  );

  return [
    { text: I.titulo, fontSize: 21, bold: true, lineHeight: 1.1, characterSpacing: -0.3, pageBreak: 'before' },
    { text: I.missao, fontSize: 10, color: COR.textoMedio, lineHeight: 1.35, margin: [0, 4, 0, 0] },
    { ...(destaque as object), margin: [0, 16, 0, 0] } as Content,
    { ...homologacoes, margin: [0, 18, 0, 0] } as Content,
    { stack: pilares, margin: [0, 18, 0, 0] },
    { ...comoFunciona, margin: [0, 18, 0, 0] } as Content,
    { ...(contato as object), margin: [0, 22, 0, 0], unbreakable: true } as Content,
  ];
}

// ---------------------------------------------------------------------------------------------
// Documento
// ---------------------------------------------------------------------------------------------

function documento(o: OrcamentoParaPdf): TDocumentDefinitions {
  return {
    pageSize: 'A4',
    pageMargins: [LATERAL, CABECALHO + FAIXA_LARANJA + 16, LATERAL, RODAPE + 12],
    info: { title: `Proposta ${o.codigo} — ${EMPRESA.nome}`, author: EMPRESA.nome, subject: 'Proposta comercial' },
    defaultStyle: { font: 'PlexSans', fontSize: 10, color: COR.texto, lineHeight: 1.15 },

    // faixas de cor de ponta a ponta (fora das margens)
    background: () => ({
      canvas: [
        { type: 'rect', x: 0, y: 0, w: PAGINA.largura, h: CABECALHO, color: COR.marinho },
        { type: 'rect', x: 0, y: CABECALHO, w: PAGINA.largura, h: FAIXA_LARANJA, color: COR.laranja },
      ],
    }),

    // página 1: cabeçalho grande com o número; as outras: menor (a última é a institucional)
    header: (pagina, total) => {
      const primeira = pagina === 1;
      const institucional = pagina === total;
      const tamanhoLogo = primeira ? 44 : 34;
      return {
        margin: [LATERAL, primeira ? 14 : 19, LATERAL, 0],
        columns: [
          { width: tamanhoLogo, ...(logo(tamanhoLogo) as object) },
          { width: 1, canvas: [{ type: 'line', x1: 0, y1: 4, x2: 0, y2: tamanhoLogo - 4, lineWidth: 0.75, lineColor: COR.divisoria }] },
          { width: '*', margin: [0, primeira ? 6 : 4, 0, 0], ...(marca(primeira ? 22 : 17) as object) },
          institucional ? { width: 'auto', text: '' } : {
            width: 'auto',
            alignment: 'right',
            margin: [0, primeira ? 8 : 6, 0, 0],
            stack: [
              { text: 'PROPOSTA Nº', fontSize: primeira ? 7.5 : 6.5, bold: true, characterSpacing: 1.2, color: '#F6A96B' },
              { text: o.codigo, fontSize: primeira ? 14 : 11, color: COR.branco, margin: [0, 2, 0, 0] },
            ],
          },
        ],
        columnGap: 12,
      } as Content;
    },

    // Rodapé: uma linha nas páginas da proposta; duas (razão social, endereço e contatos) na
    // institucional, que é a última e tem espaço livre embaixo: a faixa dela sobe além da margem.
    footer: (pagina, total) => {
      const area = RODAPE + 12;
      const completo = pagina === total;
      const altura = completo ? RODAPE_COMPLETO : RODAPE;
      const numeracao = { text: `Proposta ${o.codigo} · Página ${pagina} de ${total}`, fontSize: 8, color: COR.azulClaro, width: 'auto' };
      const linhas = completo
        ? [
            {
              columns: [
                { text: [{ text: EMPRESA.razaoSocial, bold: true }, ` · CNPJ ${EMPRESA.cnpj}`], fontSize: 8, color: COR.branco, width: '*' },
                numeracao,
              ],
            },
            {
              margin: [0, 3, 0, 0],
              columns: [
                { text: EMPRESA.endereco, fontSize: 7.5, color: COR.azulClaro, width: '*' },
                {
                  text: [EMPRESA.telefone, EMPRESA.email, EMPRESA.instagram, EMPRESA.site].filter(Boolean).join(' · '),
                  fontSize: 7.5,
                  color: COR.azulClaro,
                  width: 'auto',
                },
              ],
            },
          ]
        : [{ columns: [{ text: `${EMPRESA.nome.toUpperCase()} · CNPJ ${EMPRESA.cnpj}`, fontSize: 8, color: COR.azulClaro, width: '*' }, numeracao] }];
      return {
        stack: [
          // a faixa fica fora do fluxo, por baixo do texto (como nas caixas)
          { canvas: [{ type: 'rect', x: 0, y: area - altura, w: PAGINA.largura, h: altura, color: COR.marinho }], relativePosition: { x: 0, y: 0 } },
          { stack: linhas, margin: [LATERAL, area - altura + (completo ? 10 : 9), LATERAL, 0] },
        ],
      } as Content;
    },

    content: [...paginaDaProposta(o), ...paginaInstitucional(o)],
  };
}

/** Gera o PDF em memória (Buffer). */
export async function gerarPdfOrcamento(o: OrcamentoParaPdf): Promise<Buffer> {
  return pdfmake.createPdf(documento(o)).getBuffer();
}
