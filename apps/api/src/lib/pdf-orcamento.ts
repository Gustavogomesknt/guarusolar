import pdfmake from 'pdfmake';
import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import type { Prisma } from '@prisma/client';
import {
  formatarBRL,
  formatarData,
  formatarQuantidade,
  mascararCep,
  mascararDocumento,
  mascararTelefone,
  ROTULO_CATEGORIA,
  ROTULO_UNIDADE,
} from '@guarusolar/compartilhado';

/*
 * PDF do orçamento (A4), gerado com pdfmake: só JavaScript, sem navegador embutido,
 * poucos MB de memória por documento — cabe em hospedagem pequena.
 *
 * REGRA: tudo vem do que está gravado no banco (totais, subtotais dos itens, entrada,
 * parcela e resumo do pagamento). Nada é recalculado aqui.
 */

// Dados da empresa ainda não informados pelo cliente ficam visíveis como pendência.
const EMPRESA = {
  razaoSocial: '[RAZÃO SOCIAL DA GUARUSOLAR]',
  cnpj: '[CNPJ DA GUARUSOLAR]',
  endereco: '[ENDEREÇO DA GUARUSOLAR] · Guarulhos/SP',
  contato: '[TELEFONE DA GUARUSOLAR] · [E-MAIL DA GUARUSOLAR]',
};

const COR = {
  azulEscuro: '#0B2F5E',
  azul: '#1257A6',
  laranja: '#EE7C12',
  texto: '#10243D',
  secundario: '#5A6675',
  borda: '#D9E0EA',
  fundo: '#F4F6FA',
};

// Ícone de sol provisório (o mesmo das telas) até o cliente enviar o logo.
const SOL = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${COR.laranja}" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>`;

// Fontes em WOFF (não WOFF2) e só a IBM Plex Sans: o fontkit do pdfkit quebra ao montar o
// subconjunto de glifos ("Offset is outside the bounds of the DataView") com os arquivos
// WOFF2 em letras acentuadas e com a IBM Plex Mono em qualquer formato. Testado letra a letra.
// Os valores usam a Plex Sans alinhada à direita.
const fonte = (arquivo: string) => require.resolve(`@fontsource/${arquivo}`);
const FONTES = {
  PlexSans: {
    normal: fonte('ibm-plex-sans/files/ibm-plex-sans-latin-400-normal.woff'),
    bold: fonte('ibm-plex-sans/files/ibm-plex-sans-latin-700-normal.woff'),
    italics: fonte('ibm-plex-sans/files/ibm-plex-sans-latin-400-italic.woff'),
    bolditalics: fonte('ibm-plex-sans/files/ibm-plex-sans-latin-700-italic.woff'),
  },
};
const ARQUIVOS_PERMITIDOS = new Set(Object.values(FONTES).flatMap((f) => Object.values(f)));

pdfmake.setFonts(FONTES);
// o documento não busca nada na internet e só lê os arquivos de fonte acima
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
        'O valor total acima é a base para a simulação; taxa e número de parcelas dependem da análise de crédito.'
      );
  }
}

/** "Desconto (5% + 5% à vista)" conforme o que foi aplicado. */
function rotuloDoDesconto(o: OrcamentoParaPdf) {
  const partes: string[] = [];
  if (numero(o.descontoValor) > 0) {
    partes.push(o.descontoTipo === 'PERCENTUAL' ? pct(o.descontoValor) : formatarBRL(numero(o.descontoValor)));
  }
  if (o.condicaoPagamento === 'A_VISTA' && numero(o.descontoAVistaPct) > 0) {
    partes.push(`${pct(o.descontoAVistaPct)} à vista`);
  }
  return partes.length ? `Desconto (${partes.join(' + ')})` : 'Desconto';
}

const rotulo = (texto: string): Content => ({ text: texto.toUpperCase(), style: 'rotulo' });

function documento(o: OrcamentoParaPdf): TDocumentDefinitions {
  const c = o.cliente;
  const endereco = [
    [c.logradouro, c.numero].filter(Boolean).join(', '),
    c.complemento,
    c.bairro,
  ]
    .filter(Boolean)
    .join(' — ');
  const cidade = [c.cidade, c.uf].filter(Boolean).join('/');
  const tipoDocumento = c.documento.length === 14 ? 'CNPJ' : 'CPF';

  const linhasItens = o.itens
    .slice()
    .sort((a, b) => a.ordem - b.ordem)
    .map((item, i) => [
      { text: String(i + 1), style: 'celulaNumero', color: COR.secundario },
      {
        stack: [
          { text: item.descricao, bold: true },
          { text: ROTULO_CATEGORIA[item.produto.categoria], fontSize: 8, color: COR.secundario },
          // descrição técnica gravada no item (cópia do catálogo na hora do orçamento)
          ...(item.descricaoTecnica
            ? [{ text: item.descricaoTecnica, fontSize: 8, color: COR.secundario, margin: [0, 2, 0, 0] as [number, number, number, number] }]
            : []),
        ],
      },
      { text: `${formatarQuantidade(numero(item.quantidade))} ${ROTULO_UNIDADE[item.unidade]}`, style: 'celulaNumero' },
      { text: formatarBRL(numero(item.precoUnitario)), style: 'celulaNumero' },
      { text: formatarBRL(numero(item.subtotal)), style: 'celulaNumero', bold: true },
    ]);

  return {
    pageSize: 'A4',
    pageMargins: [40, 40, 40, 56],
    info: { title: `Orçamento ${o.codigo} — Guarusolar`, author: 'Guarusolar', subject: 'Orçamento de energia solar' },
    defaultStyle: { font: 'PlexSans', fontSize: 9.5, color: COR.texto, lineHeight: 1.25 },
    styles: {
      rotulo: { fontSize: 7.5, bold: true, color: COR.secundario, characterSpacing: 0.6, margin: [0, 0, 0, 3] },
      tituloSecao: { fontSize: 11, bold: true, color: COR.azulEscuro, margin: [0, 14, 0, 6] },
      celulaNumero: { alignment: 'right' },
      cabecalhoTabela: { fontSize: 7.5, bold: true, color: COR.secundario, characterSpacing: 0.5 },
    },
    footer: (pagina, total) => ({
      margin: [40, 16, 40, 0],
      columns: [
        { text: `Guarusolar · Orçamento ${o.codigo}`, fontSize: 7.5, color: COR.secundario },
        { text: `Página ${pagina} de ${total}`, fontSize: 7.5, color: COR.secundario, alignment: 'right' },
      ],
    }),
    content: [
      // Cabeçalho: logo e dados da empresa
      {
        columns: [
          {
            width: '*',
            columns: [
              { svg: SOL, width: 30, height: 30 },
              {
                width: '*',
                margin: [8, 2, 0, 0],
                stack: [
                  { text: 'Guarusolar', fontSize: 20, bold: true, color: COR.azulEscuro, lineHeight: 1 },
                  { text: 'Energia solar · Guarulhos/SP', fontSize: 8.5, color: COR.secundario },
                ],
              },
            ],
          },
          {
            width: 'auto',
            alignment: 'right',
            fontSize: 8,
            color: COR.secundario,
            stack: [{ text: EMPRESA.razaoSocial, bold: true, color: COR.texto }, `CNPJ ${EMPRESA.cnpj}`, EMPRESA.endereco, EMPRESA.contato],
          },
        ],
      },
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 2, lineColor: COR.laranja }], margin: [0, 14, 0, 16] },

      // Número, emissão e validade
      {
        columns: [
          {
            width: '*',
            stack: [
              rotulo('Orçamento'),
              { text: o.codigo, fontSize: 18, bold: true, color: COR.azulEscuro },
            ],
          },
          { width: 90, stack: [rotulo('Emissão'), formatarData(o.criadoEm)] },
          { width: 90, stack: [rotulo('Válido até'), { text: formatarData(o.validade), bold: true }] },
          { width: 120, stack: [rotulo('Vendedor'), o.vendedor.nome] },
        ],
      },

      // Cliente
      { text: 'Cliente', style: 'tituloSecao' },
      {
        table: {
          widths: ['*', '*'],
          body: [
            [
              {
                stack: [
                  rotulo('Nome'),
                  { text: c.nome, bold: true },
                  { text: `${tipoDocumento} ${mascararDocumento(c.documento)}`, color: COR.secundario, margin: [0, 2, 0, 0] },
                ],
              },
              {
                stack: [
                  rotulo('Contato'),
                  `WhatsApp ${mascararTelefone(c.whatsapp)}`,
                  { text: c.email || 'E-mail não informado', color: COR.secundario },
                ],
              },
            ],
            [
              {
                colSpan: 2,
                stack: [
                  rotulo('Endereço da instalação'),
                  endereco || 'Endereço não informado',
                  { text: [cidade, c.cep ? `CEP ${mascararCep(c.cep)}` : null].filter(Boolean).join(' · '), color: COR.secundario },
                ],
              },
              {},
            ],
          ],
        },
        layout: {
          fillColor: () => COR.fundo,
          hLineWidth: () => 0,
          vLineWidth: () => 0,
          paddingLeft: () => 12,
          paddingRight: () => 12,
          paddingTop: () => 9,
          paddingBottom: () => 9,
        },
      },

      // Itens
      { text: 'Itens do orçamento', style: 'tituloSecao' },
      {
        table: {
          headerRows: 1,
          dontBreakRows: true,
          widths: [16, '*', 62, 78, 82],
          body: [
            [
              { text: '#', style: 'cabecalhoTabela' },
              { text: 'DESCRIÇÃO', style: 'cabecalhoTabela' },
              { text: 'QTD.', style: 'cabecalhoTabela', alignment: 'right' },
              { text: 'PREÇO UNIT.', style: 'cabecalhoTabela', alignment: 'right' },
              { text: 'SUBTOTAL', style: 'cabecalhoTabela', alignment: 'right' },
            ],
            ...linhasItens,
          ],
        },
        layout: {
          hLineWidth: (i) => (i === 0 ? 0 : i === 1 ? 1.2 : 0.6),
          hLineColor: (i) => (i === 1 ? COR.azulEscuro : COR.borda),
          vLineWidth: () => 0,
          paddingTop: () => 6,
          paddingBottom: () => 6,
          paddingLeft: (i) => (i === 0 ? 0 : 6),
          paddingRight: (i, no) => (i === (no.table.widths?.length ?? 1) - 1 ? 0 : 6),
        },
      },

      // Totais (gravados)
      {
        margin: [0, 12, 0, 0],
        columns: [
          { width: '*', text: '' },
          {
            width: 230,
            table: {
              widths: ['*', 'auto'],
              body: [
                ['Subtotal dos itens', { text: formatarBRL(numero(o.subtotal)), style: 'celulaNumero' }],
                // sem desconto, a linha não aparece
                ...(numero(o.descontoAplicado) > 0
                  ? [[rotuloDoDesconto(o), { text: `- ${formatarBRL(numero(o.descontoAplicado))}`, style: 'celulaNumero' }]]
                  : []),
                [
                  { text: 'Valor total', bold: true, color: '#FFFFFF', fontSize: 11 },
                  { text: formatarBRL(numero(o.valorTotal)), style: 'celulaNumero', bold: true, color: '#FFFFFF', fontSize: 12 },
                ],
              ],
            },
            // a última linha é sempre o valor total (a do desconto pode não existir)
            layout: {
              fillColor: (i, no) => (i === no.table.body.length - 1 ? COR.azulEscuro : null),
              hLineWidth: (i, no) => (i > 0 && i < no.table.body.length - 1 ? 0.6 : 0),
              hLineColor: () => COR.borda,
              vLineWidth: () => 0,
              paddingTop: (i, no) => (i === no.table.body.length - 1 ? 8 : 4),
              paddingBottom: (i, no) => (i === no.table.body.length - 1 ? 8 : 4),
              paddingLeft: () => 10,
              paddingRight: () => 10,
            },
          },
        ],
      },

      // Pagamento, validade e observações (título e texto nunca ficam em páginas separadas)
      {
        unbreakable: true,
        stack: [
          { text: 'Condições de pagamento', style: 'tituloSecao' },
          { text: condicaoPorExtenso(o) },
          {
            text: `Este orçamento é válido até ${formatarData(o.validade)}. Após essa data, preços e condições podem ser revistos.`,
            color: COR.secundario,
            margin: [0, 6, 0, 0],
          },
        ],
      },
      ...(o.observacoes
        ? ([
            // observação longa demais para uma página quebra normalmente
            { unbreakable: o.observacoes.length < 1200, stack: [{ text: 'Observações', style: 'tituloSecao' }, { text: o.observacoes }] },
          ] as Content[])
        : []),

      // Aceite
      {
        unbreakable: true,
        stack: [
          { text: 'Aceite do cliente', style: 'tituloSecao' },
          {
            text: 'Declaro que li e concordo com os itens, valores e condições deste orçamento.',
            margin: [0, 0, 0, 26],
          },
          {
            columns: [
              {
                width: '*',
                stack: [
                  { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 200, y2: 0, lineWidth: 0.8, lineColor: COR.secundario }] },
                  { text: 'Local e data', fontSize: 8, color: COR.secundario, margin: [0, 4, 0, 0] },
                ],
              },
              {
                width: '*',
                stack: [
                  { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 240, y2: 0, lineWidth: 0.8, lineColor: COR.secundario }] },
                  { text: `${c.nome} (${tipoDocumento} ${mascararDocumento(c.documento)})`, fontSize: 8, color: COR.secundario, margin: [0, 4, 0, 0] },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

/** Gera o PDF em memória (Buffer). */
export async function gerarPdfOrcamento(o: OrcamentoParaPdf): Promise<Buffer> {
  return pdfmake.createPdf(documento(o)).getBuffer();
}
