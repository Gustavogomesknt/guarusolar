import { existsSync } from 'node:fs';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import { formatarBRL, formatarQuantidade, GARANTIA_PADRAO, mascararCep, mascararTelefone, ORDEM_DOS_GRUPOS_NA_PROPOSTA, type GrupoNaProposta } from '@guarusolar/compartilhado';
import { ARTES_DA_PROPOSTA_NOVA, EMPRESA, FOTO_DO_CARTAO, PAGINA_1, PAGINA_2_NOVA, PAGINA_3_NOVA, RODAPE_DA_PROPOSTA_NOVA } from '../conteudo/proposta';
import { capaDoOrcamento } from './capaDaProposta';
import {
  alturaDoTexto,
  ARQUIVOS_PERMITIDOS,
  caixa,
  clienteDoDocumento,
  COR,
  LARGURA,
  LATERAL,
  PAGINA,
  svgIcone,
  type OrcamentoParaPdf,
  type Peca,
} from './pdf-orcamento';

/*
 * PROPOSTA NO MODELO NOVO (formato enviado pelo cliente): três páginas A4 em retrato.
 *   1. CAPA: imagem fixa do tipo de serviço (assets/proposta/capas/, lib/capaDaProposta.ts)
 *   2. dinâmica: cliente, escopo do serviço em cartões por seção e o bloco fixo "contempla"
 *   3. arte de fundo (assets/proposta/pagina-3.jpg) com texto por cima — EM ESPERA do arquivo
 *
 * Em construção: só sai com PROPOSTA_MODELO=nova ou no `npm run pdf:exemplo` (pasta nova/).
 * O PDF em uso continua sendo o de pdf-orcamento.ts, de onde vêm cores, fontes e peças.
 *
 * Mesma regra do atual: tudo vem do que está gravado (itens, cópia do cliente, vendedor); as
 * alturas de texto são MEDIDAS (alturaDoTexto), nunca estimadas, e as caixas arredondadas são
 * desenho (canvas) sob o conteúdo. A página 2 é montada para caber numa folha: os cartões do
 * escopo têm a altura que sobra, e a foto de cada um ocupa o que os itens deixam livre.
 */

// ---------------------------------------------------------------------------------------------
// Artes (arquivos opcionais: sem o arquivo, retângulo cinza com o nome esperado)
// ---------------------------------------------------------------------------------------------

const RAIZ = path.resolve(__dirname, '../..');
function arte(relativo: string) {
  const absoluto = path.resolve(RAIZ, relativo);
  if (!existsSync(absoluto)) return { arquivo: null, nome: path.basename(relativo) };
  ARQUIVOS_PERMITIDOS.add(absoluto); // o pdfmake só lê arquivo que está nessa lista
  return { arquivo: absoluto, nome: path.basename(relativo) };
}
type Arte = ReturnType<typeof arte>;

/**
 * Artes que o modelo novo espera e NÃO estão na pasta, a partir de assets/proposta/ (capa padrão,
 * fotos dos cartões, logos, fundo da página 3). Só AVISO: no log ao subir e em /saude; o PDF sai
 * do mesmo jeito (cartão sem foto, logo pulada, lugar reservado da arte).
 */
export function artesQueFaltam(): string[] {
  const A = ARTES_DA_PROPOSTA_NOVA;
  const esperadas = [A.fotoDocumentacao, A.fotoBombeiros, A.fotoInfraestrutura, ...A.logosDasMontadoras, A.fundoPagina3];
  const faltam = esperadas.filter((relativo) => !existsSync(path.resolve(RAIZ, relativo)));
  // a capa aceita .jpg, .jpeg ou .png (capaDaProposta.ts): confere pela mesma regra do PDF
  const capa = capaDoOrcamento(null);
  if (!capa.arquivo) faltam.unshift(capa.esperado);
  return faltam.map((relativo) => relativo.replace(/^assets\/proposta\//, ''));
}
// conferido a cada PDF: colocar o arquivo na pasta vale sem reiniciar
const artes = () => ({
  pagina3: arte(ARTES_DA_PROPOSTA_NOVA.fundoPagina3),
  fotos: {
    DOCUMENTACAO: arte(ARTES_DA_PROPOSTA_NOVA.fotoDocumentacao),
    BOMBEIROS: arte(ARTES_DA_PROPOSTA_NOVA.fotoBombeiros),
    MATERIAL: arte(ARTES_DA_PROPOSTA_NOVA.fotoInfraestrutura),
  } as Record<GrupoNaProposta, Arte>,
  // logo que falta é pulada (a faixa segue com as outras)
  montadoras: ARTES_DA_PROPOSTA_NOVA.logosDasMontadoras.map(arte).filter((a) => a.arquivo !== null),
});

const RESERVADO = '#D5DBE3'; // cinza do lugar reservado das artes
const RESERVADO_TEXTO = '#6B7685';

// ---------------------------------------------------------------------------------------------
// Ícones (traço, 24 x 24, no estilo dos que já estão no PDF)
// ---------------------------------------------------------------------------------------------

const ICONE = {
  pessoa: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  telefone:
    '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>',
  local: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
  documento: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
  chama:
    '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
  chave:
    '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
  prancheta:
    '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M9 12h6M9 16h4"/>',
  caixa: '<path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/>',
  ferramenta:
    '<path d="M2 18a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1z"/><path d="M10 10V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5"/><path d="M4 15v-3a6 6 0 0 1 6-6M14 6a6 6 0 0 1 6 6v3"/>',
  teste: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
  suporte: '<path d="M4 13v-1a8 8 0 0 1 16 0v1"/><path d="M4 13h3v6H5a1 1 0 0 1-1-1zM20 13h-3v6h2a1 1 0 0 0 1-1z"/>',
};

/** Marcador do item: círculo laranja com um tique branco. */
const TIQUE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="12" fill="${COR.laranja}"/><path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="#FFFFFF" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

/** Ícone branco num quadrado laranja arredondado (cartão do cliente). */
function iconeQuadrado(desenho: string, lado = 18): Peca {
  return {
    width: lado,
    stack: [
      { canvas: [{ type: 'rect', x: 0, y: 0, w: lado, h: lado, r: 4, color: COR.laranja }], relativePosition: { x: 0, y: 0 } },
      { svg: svgIcone(desenho, COR.branco, 2.2), width: lado * 0.6, height: lado * 0.6, margin: [lado * 0.2, lado * 0.2, 0, 0] },
    ],
  };
}

/** Texto em caixa alta com um trecho em laranja (o resto na cor dada). */
function comTrechoLaranja(linha: string, laranja: string, cor: string): Peca[] {
  const i = laranja ? linha.indexOf(laranja) : -1;
  if (i < 0) return [{ text: linha, color: cor }];
  return [
    ...(i > 0 ? [{ text: linha.slice(0, i), color: cor }] : []),
    { text: laranja, color: COR.laranja },
    ...(i + laranja.length < linha.length ? [{ text: linha.slice(i + laranja.length), color: cor }] : []),
  ];
}

// ---------------------------------------------------------------------------------------------
// Página 2
// ---------------------------------------------------------------------------------------------

const MARGEM_PAGINA = 36;
const ALTURA_UTIL = PAGINA.altura - 2 * MARGEM_PAGINA;
const ESPACO = { aposCliente: 16, aposTitulo: 12, aposCartoes: 14, aposFaixa: 7 };
/** folga para o pdfmake não empurrar o último bloco para a página seguinte por arredondamento */
const FOLGA = 4;
const FOTO_MINIMA = 70;

function cartaoDoCliente(o: OrcamentoParaPdf): { peca: Peca; altura: number } {
  const c = clienteDoDocumento(o);
  const linha1 = [[c.logradouro, c.numero].filter(Boolean).join(', '), c.complemento, c.bairro].filter(Boolean).join(' — ');
  const linha2 = [[c.cidade, c.uf].filter(Boolean).join('/'), c.cep ? `CEP ${mascararCep(c.cep)}` : null].filter(Boolean).join(' · ');
  const telefone = mascararTelefone(c.whatsapp) || '—';

  const padding = [16, 12, 16, 12] as const;
  const larguraConsultor = 150;
  const gapColunas = 16;
  const larguraEsquerda = LARGURA - padding[0] - padding[2] - larguraConsultor - 1 - 2 * gapColunas;
  const larguraTexto = larguraEsquerda - 18 - 9;
  const ICONE_LADO = 18;
  const espacoLinhas = 7;

  const altNome = Math.max(ICONE_LADO, alturaDoTexto(c.nome, larguraTexto, 12, 1.15, true));
  const altEndereco = Math.max(ICONE_LADO, (linha1 ? alturaDoTexto(linha1, larguraTexto, 9.5) : 0) + (linha2 ? alturaDoTexto(linha2, larguraTexto, 9.5) : 0));
  const altura = padding[1] + padding[3] + altNome + ICONE_LADO + altEndereco + 2 * espacoLinhas + 2;

  // texto de uma linha só fica centrado na altura do ícone
  const linhaComIcone = (desenho: string, conteudo: Peca, alturaTexto: number, margem: number): Peca => ({
    columns: [iconeQuadrado(desenho, ICONE_LADO), { width: '*', margin: [0, Math.max(0, (ICONE_LADO - alturaTexto) / 2), 0, 0], ...conteudo }],
    columnGap: 9,
    margin: [0, margem, 0, 0],
  });

  const esquerda: Peca = {
    width: larguraEsquerda,
    stack: [
      linhaComIcone(ICONE.pessoa, { text: c.nome, fontSize: 12, bold: true, lineHeight: 1.15 }, altNome, 0),
      linhaComIcone(ICONE.telefone, { text: telefone, fontSize: 10, color: COR.textoMedio }, alturaDoTexto(telefone, larguraTexto, 10), espacoLinhas),
      linhaComIcone(
        ICONE.local,
        { stack: [linha1, linha2].filter(Boolean).map((t) => ({ text: t, fontSize: 9.5, color: COR.textoMedio })) },
        altEndereco === ICONE_LADO ? alturaDoTexto(linha1 || linha2 || ' ', larguraTexto, 9.5) : altEndereco,
        espacoLinhas,
      ),
    ],
  };
  const alturaInterna = altura - padding[1] - padding[3];
  const altConsultor = 14 + alturaDoTexto(o.vendedor.nome, larguraConsultor, 11, 1.15, true);
  const direita: Peca = {
    width: larguraConsultor,
    margin: [0, Math.max(0, (alturaInterna - altConsultor) / 2), 0, 0],
    stack: [
      {
        columns: [
          { width: 11, svg: svgIcone(ICONE.pessoa, COR.laranja, 2.4), height: 11 },
          { width: '*', text: (o.vendedor.cargoNaProposta?.trim() || 'Consultor').toUpperCase(), fontSize: 7.5, bold: true, characterSpacing: 1.1, color: COR.secundario, margin: [0, 1.5, 0, 0] },
        ],
        columnGap: 5,
      },
      { text: o.vendedor.nome, fontSize: 11, bold: true, color: COR.marinho, margin: [0, 3, 0, 0] },
    ],
  };
  const divisoria: Peca = { width: 1, canvas: [{ type: 'line', x1: 0, y1: 0, x2: 0, y2: alturaInterna, lineWidth: 0.75, lineColor: COR.laranjaBorda }] };

  return {
    altura,
    peca: caixa(
      { columns: [esquerda, divisoria, direita], columnGap: gapColunas },
      { largura: LARGURA, altura, borda: COR.laranja, raio: 10, padding: [...padding] },
    ),
  };
}

function tituloDoEscopo(): { peca: Peca; altura: number } {
  const tamanho = 15;
  const t = PAGINA_2_NOVA.titulo;
  const larguraTexto = medirLargura(`${t.azul} ${t.laranja}`, tamanho);
  return {
    altura: tamanho * 1.15,
    peca: {
      columns: [
        { width: 'auto', text: [{ text: `${t.azul} `, color: COR.marinho }, { text: t.laranja, color: COR.laranja }], fontSize: tamanho, bold: true, lineHeight: 1, characterSpacing: 0.4 },
        {
          width: '*',
          canvas: [{ type: 'line', x1: 0, y1: tamanho * 0.5, x2: LARGURA - larguraTexto - 14, y2: tamanho * 0.5, lineWidth: 0.75, lineColor: COR.borda }],
        },
      ],
      columnGap: 12,
    },
  };
}

// largura de um texto em negrito, com o mesmo pdfkit (motor do pdfmake) que mede as alturas
const regua = new PDFDocument({ size: 'A4' });
regua.registerFont('negrito', require.resolve('@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-700-normal.woff'));
function medirLargura(texto: string, tamanho: number, espacamento = 0.4) {
  return regua.font('negrito').fontSize(tamanho).widthOfString(texto, { characterSpacing: espacamento });
}

/** Item do escopo: o nome e a descrição técnica, se houver ("Cabos de cobre 10 mm² · isolação 1 kV"). */
type ItemDoEscopo = { nome: string; tecnica: string | null };
type Cartao = { grupo: GrupoNaProposta; itens: ItemDoEscopo[] };

const SEPARADOR = ' · ';
/** O texto inteiro, como é medido; a descrição vira uma linha só (no catálogo ela pode ter quebras). */
const textoDoItem = (i: ItemDoEscopo) => (i.tecnica ? `${i.nome}${SEPARADOR}${i.tecnica}` : i.nome);
/** O mesmo texto para o PDF: a descrição técnica num tom mais claro que o nome (mesma fonte e tamanho). */
const pecaDoItem = (i: ItemDoEscopo): Peca[] => [
  { text: i.nome, color: COR.texto },
  ...(i.tecnica ? [{ text: `${SEPARADOR}${i.tecnica}`, color: COR.secundario }] : []),
];

/** Seções com itens; Infraestrutura sempre aparece (é a seção padrão de todo item). */
function cartoesDoOrcamento(o: OrcamentoParaPdf): Cartao[] {
  const visiveis = o.itens.filter((i) => i.apareceNaProposta).sort((a, b) => a.ordem - b.ordem);
  const doItem = (i: (typeof visiveis)[number]): ItemDoEscopo => ({
    nome: i.descricao.trim(),
    tecnica: i.descricaoTecnica?.replace(/\s+/g, ' ').trim() || null,
  });
  return ORDEM_DOS_GRUPOS_NA_PROPOSTA.map((grupo) => ({ grupo, itens: visiveis.filter((i) => i.grupoNaProposta === grupo).map(doItem) })).filter(
    (c) => c.itens.length > 0 || c.grupo === 'MATERIAL',
  );
}

// tamanhoSobreLaranja: o título branco sobre o laranja da marca sai maior (o negrito 700 já é o
// peso máximo da IBM Plex Sans), para compensar o contraste menor: até 10,5 pt, o maior em que
// cada linha cabe sem quebrar na largura do cartão. Com três cartões "CORPO DE BOMBEIROS" limita:
// as letras ficam um pouco mais juntas (0,2) para chegar a 10 pt

const CABECALHO_CARTAO = { paddingX: 11, paddingY: 10, tamanho: 9.5, tamanhoSobreLaranja: 10.5, entrelinha: 1.12, icone: 20, espacamento: 0.5 };

/** Tamanho e espaçamento do título: o padrão, ou o maior que cabe (até o teto) no de bombeiros. */
function tituloDoCartao(grupo: GrupoNaProposta, larguraDoCartao: number): { tamanho: number; espacamento: number } {
  const padrao = { tamanho: CABECALHO_CARTAO.tamanho, espacamento: CABECALHO_CARTAO.espacamento };
  if (grupo !== 'BOMBEIROS') return padrao;
  const larguraTexto = larguraDoCartao - 2 * CABECALHO_CARTAO.paddingX - CABECALHO_CARTAO.icone - 9 - 0.5;
  const linhas = PAGINA_2_NOVA.cartoes[grupo].linhas;
  for (let tamanho = CABECALHO_CARTAO.tamanhoSobreLaranja; tamanho > CABECALHO_CARTAO.tamanho; tamanho -= 0.25) {
    for (const espacamento of [CABECALHO_CARTAO.espacamento, 0.2]) {
      if (linhas.every((l) => medirLargura(l, tamanho, espacamento) <= larguraTexto)) return { tamanho, espacamento };
    }
  }
  return padrao;
}
const ITENS_CARTAO = { paddingX: 11, paddingTop: 11, paddingBottom: 10, tamanho: 9, entrelinha: 1.2, marcador: 11, gap: 6, entreItens: 6 };

function alturaDosItens(itens: ItemDoEscopo[], larguraColuna: number) {
  const larguraTexto = larguraColuna - ITENS_CARTAO.marcador - ITENS_CARTAO.gap;
  return itens.reduce(
    (t, item, i) => t + (i ? ITENS_CARTAO.entreItens : 0) + Math.max(ITENS_CARTAO.marcador, alturaDoTexto(textoDoItem(item), larguraTexto, ITENS_CARTAO.tamanho, ITENS_CARTAO.entrelinha)),
    0,
  );
}

/** Itens em uma coluna (dois ou três cartões) ou duas (cartão sozinho na largura toda). */
function colunasDosItens(itens: ItemDoEscopo[], largura: number, colunas: number) {
  const gap = 14;
  const larguraColuna = (largura - (colunas - 1) * gap) / colunas;
  const porColuna = Math.ceil(itens.length / colunas) || 0;
  const grupos = Array.from({ length: colunas }, (_, i) => itens.slice(i * porColuna, (i + 1) * porColuna));
  const altura = Math.max(0, ...grupos.map((g) => alturaDosItens(g, larguraColuna)));
  const larguraTexto = larguraColuna - ITENS_CARTAO.marcador - ITENS_CARTAO.gap;
  const peca: Peca = {
    columns: grupos.map((g) => ({
      width: larguraColuna,
      stack: g.map((item, i) => {
        const alturaTexto = alturaDoTexto(textoDoItem(item), larguraTexto, ITENS_CARTAO.tamanho, ITENS_CARTAO.entrelinha);
        return {
          columns: [
            // o tique acompanha a primeira linha do texto
            { width: ITENS_CARTAO.marcador, svg: TIQUE, height: ITENS_CARTAO.marcador, margin: [0, Math.max(0, (Math.min(alturaTexto, ITENS_CARTAO.tamanho * ITENS_CARTAO.entrelinha * 1.15) - ITENS_CARTAO.marcador) / 2), 0, 0] },
            { width: '*', text: pecaDoItem(item), fontSize: ITENS_CARTAO.tamanho, lineHeight: ITENS_CARTAO.entrelinha },
          ],
          columnGap: ITENS_CARTAO.gap,
          margin: [0, i ? ITENS_CARTAO.entreItens : 0, 0, 0],
        };
      }),
    })),
    columnGap: gap,
  };
  return { peca, altura };
}

function alturaDoCabecalho(cartoes: Cartao[], larguraDoCartao: number) {
  const altura = (c: Cartao) =>
    PAGINA_2_NOVA.cartoes[c.grupo].linhas.length * alturaDoTexto('X', 200, tituloDoCartao(c.grupo, larguraDoCartao).tamanho, CABECALHO_CARTAO.entrelinha, true);
  return Math.max(CABECALHO_CARTAO.icone, ...cartoes.map(altura)) + 2 * CABECALHO_CARTAO.paddingY;
}

const MM = 72 / 25.4;
/** Margem da foto até as bordas do cartão e até os itens. */
const RESPIRO_DA_FOTO = 11;

/**
 * Tamanho da foto: 3:4 (retrato), FOTO_DO_CARTAO.larguraMm de largura (o mesmo nos três cartões,
 * em qualquer arranjo); menor, mantendo os 3:4, só se a altura que sobra no cartão não couber.
 * Largura e altura saem SEMPRE na proporção: o pdfmake distorce se receber outra.
 */
function tamanhoDaFoto(larguraDoCartao: number, alturaDaArea: number) {
  const larguraMaxima = Math.min(FOTO_DO_CARTAO.larguraMm * MM, larguraDoCartao - 2 * RESPIRO_DA_FOTO);
  const alturaMaxima = alturaDaArea - 2 * RESPIRO_DA_FOTO;
  const largura = Math.min(larguraMaxima, alturaMaxima * FOTO_DO_CARTAO.proporcao);
  return { largura, altura: largura / FOTO_DO_CARTAO.proporcao };
}

/**
 * Foto no pé do cartão, centrada, com os cantos arredondados (máscaras brancas por cima: o cartão
 * é branco). Sem o arquivo, o cartão sai sem foto (a área fica em branco) e o PDF segue.
 */
function fotoDoCartao(foto: Arte, larguraDoCartao: number, alturaDaArea: number): Peca {
  // a área tem altura fixa (o cartão inteiro foi medido com ela), com ou sem foto
  const area = (conteudo: Peca[]): Peca => ({
    table: { widths: [larguraDoCartao], heights: [alturaDaArea], body: [[{ stack: conteudo }]] },
    layout: semBordas([0, 0, 0, 0]),
  });
  if (!foto.arquivo) return area([]);
  const { largura: w, altura: h } = tamanhoDaFoto(larguraDoCartao, alturaDaArea);
  const r = 6;
  const canto = (x: number, y: number, sx: number, sy: number) =>
    `<path d="M${x} ${y + sy * r} L${x} ${y} L${x + sx * r} ${y} A${r} ${r} 0 0 ${sx * sy > 0 ? 0 : 1} ${x} ${y + sy * r} Z" fill="#FFFFFF"/>`;
  const mascaras =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">` +
    canto(0, 0, 1, 1) + canto(w, 0, -1, 1) + canto(0, h, 1, -1) + canto(w, h, -1, -1) +
    `</svg>`;
  const x = (larguraDoCartao - w) / 2;
  const y = alturaDaArea - RESPIRO_DA_FOTO - h; // no pé, com o respiro embaixo
  return area([
    // cover na MESMA proporção do arquivo (3:4): não distorce; a sobra de um arquivo que não seja
    // 3:4 exato (o de materiais tem 178 x 237) é cortada, menos de 1 px
    // as duas no mesmo ponto, fora do fluxo (a altura da área é a da tabela)
    { image: foto.arquivo, cover: { width: w, height: h, align: 'center', valign: 'center' }, relativePosition: { x, y } },
    { svg: mascaras, width: w, height: h, relativePosition: { x, y } },
  ]);
}

function cartaoDoEscopo(cartao: Cartao, largura: number, alturas: { cabecalho: number; itens: number; foto: number }, colunasDeItens: number, foto: Arte): Peca {
  const raio = 9;
  const config = PAGINA_2_NOVA.cartoes[cartao.grupo];
  const laranja = cartao.grupo === 'BOMBEIROS';
  // Laranja DA MARCA com texto branco: exceção consciente à regra de contraste (CLAUDE.md, cores),
  // porque a página fica entre as artes do cliente, de laranja vivo. Compensa: título maior.
  const fundo = laranja ? COR.laranja : COR.marinho;
  const corIcone = laranja ? COR.branco : COR.laranja;
  const desenho = { DOCUMENTACAO: ICONE.documento, BOMBEIROS: ICONE.chama, MATERIAL: ICONE.chave }[cartao.grupo];
  const total = alturas.cabecalho + alturas.itens + alturas.foto;
  const itens = colunasDosItens(cartao.itens, largura - 2 * ITENS_CARTAO.paddingX, colunasDeItens);
  const { tamanho: tamanhoTitulo, espacamento } = tituloDoCartao(cartao.grupo, largura);
  const linhaTitulo = alturaDoTexto('X', 200, tamanhoTitulo, CABECALHO_CARTAO.entrelinha, true);
  const alturaTitulo = config.linhas.length * linhaTitulo;
  const alturaInternaCabecalho = alturas.cabecalho - 2 * CABECALHO_CARTAO.paddingY;

  return {
    width: largura,
    stack: [
      {
        // contorno do cartão inteiro e o cabeçalho (cantos de cima arredondados)
        canvas: [
          { type: 'rect', x: 0, y: 0, w: largura, h: total, r: raio, color: COR.branco, lineColor: COR.borda, lineWidth: 0.75 },
          { type: 'rect', x: 0, y: 0, w: largura, h: alturas.cabecalho, r: raio, color: fundo },
          { type: 'rect', x: 0, y: alturas.cabecalho - raio, w: largura, h: raio, color: fundo },
        ],
        relativePosition: { x: 0, y: 0 },
      },
      {
        table: {
          widths: [largura - 2 * CABECALHO_CARTAO.paddingX],
          heights: [alturaInternaCabecalho],
          body: [
            [
              {
                columns: [
                  {
                    width: CABECALHO_CARTAO.icone,
                    svg: svgIcone(desenho, corIcone, 2),
                    height: CABECALHO_CARTAO.icone,
                    margin: [0, Math.max(0, (alturaInternaCabecalho - CABECALHO_CARTAO.icone) / 2), 0, 0],
                  },
                  {
                    width: '*',
                    margin: [0, Math.max(0, (alturaInternaCabecalho - alturaTitulo) / 2), 0, 0],
                    stack: config.linhas.map((linha) => ({
                      text: comTrechoLaranja(linha, laranja ? '' : config.laranja, COR.branco),
                      fontSize: tamanhoTitulo,
                      bold: true,
                      lineHeight: CABECALHO_CARTAO.entrelinha,
                      characterSpacing: espacamento,
                    })),
                  },
                ],
                columnGap: 9,
              },
            ],
          ],
        },
        layout: semBordas([CABECALHO_CARTAO.paddingX, CABECALHO_CARTAO.paddingY, CABECALHO_CARTAO.paddingX, CABECALHO_CARTAO.paddingY]),
      },
      {
        table: {
          widths: [largura - 2 * ITENS_CARTAO.paddingX],
          heights: [alturas.itens - ITENS_CARTAO.paddingTop - ITENS_CARTAO.paddingBottom],
          body: [[itens.peca]],
        },
        layout: semBordas([ITENS_CARTAO.paddingX, ITENS_CARTAO.paddingTop, ITENS_CARTAO.paddingX, ITENS_CARTAO.paddingBottom]),
      },
      ...(alturas.foto > 0 ? [fotoDoCartao(foto, largura, alturas.foto)] : []),
    ],
  };
}

const semBordas = (p: [number, number, number, number]) => ({
  hLineWidth: () => 0,
  vLineWidth: () => 0,
  paddingLeft: () => p[0],
  paddingTop: () => p[1],
  paddingRight: () => p[2],
  paddingBottom: () => p[3],
});

function blocoContempla(): { peca: Peca; altura: number } {
  const C = PAGINA_2_NOVA.contempla;
  const alturaFaixa = 27;
  const alturaCaixa = 66;
  const etapas = C.etapas;
  const larguraColuna = LARGURA / etapas.length;
  const DESENHOS = { prancheta: ICONE.prancheta, caixa: ICONE.caixa, ferramenta: ICONE.ferramenta, teste: ICONE.teste, suporte: ICONE.suporte };

  const faixa = caixa(
    {
      text: [{ text: `${C.faixa.azul} `, color: COR.branco }, { text: C.faixa.laranja, color: COR.laranja }],
      alignment: 'center',
      fontSize: 10.5,
      bold: true,
      characterSpacing: 1,
    },
    { largura: LARGURA, altura: alturaFaixa, fundo: COR.marinho, raio: 8, padding: [12, 7.5, 12, 4] },
  );
  const caixaDasEtapas: Peca = {
    stack: [
      {
        canvas: [
          { type: 'rect', x: 0, y: 0, w: LARGURA, h: alturaCaixa, r: 9, color: COR.branco, lineColor: COR.borda, lineWidth: 0.75 },
          ...etapas.slice(1).map((_, i) => ({
            type: 'line',
            x1: larguraColuna * (i + 1),
            y1: 11,
            x2: larguraColuna * (i + 1),
            y2: alturaCaixa - 11,
            lineWidth: 0.75,
            lineColor: COR.borda,
          })),
        ],
        relativePosition: { x: 0, y: 0 },
      },
      {
        columns: etapas.map((e) => ({
          width: larguraColuna,
          margin: [4, 10, 4, 0],
          stack: [
            { svg: svgIcone(DESENHOS[e.icone], COR.laranja, 2), width: 18, height: 18, alignment: 'center' },
            { text: e.linhas[0], fontSize: 8.5, bold: true, color: COR.marinho, alignment: 'center', margin: [0, 5, 0, 0] },
            { text: e.linhas[1], fontSize: 8.5, color: COR.textoMedio, alignment: 'center' },
          ],
        })),
        columnGap: 0,
      },
    ],
    height: alturaCaixa,
  };
  // a linha de condições (PAGINA_2_NOVA.contempla.condicoes), medida: entra na altura do bloco
  const condicoes = C.condicoes.trim();
  const TAMANHO_CONDICOES = 8;
  const ANTES_CONDICOES = 7;
  const alturaCondicoes = condicoes ? ANTES_CONDICOES + alturaDoTexto(condicoes, LARGURA, TAMANHO_CONDICOES) : 0;
  return {
    altura: alturaFaixa + ESPACO.aposFaixa + alturaCaixa + alturaCondicoes,
    peca: {
      stack: [
        faixa,
        { ...caixaDasEtapas, margin: [0, ESPACO.aposFaixa, 0, 0] },
        ...(condicoes
          ? [{ text: condicoes, fontSize: TAMANHO_CONDICOES, lineHeight: 1.15, color: COR.textoMedio, alignment: 'center', margin: [0, ANTES_CONDICOES, 0, 0] } as Peca]
          : []),
      ],
    },
  };
}

/** Página 2 inteira, e quanto sobrou para as fotos (para conferir no pdf:exemplo). */
export function paginaDoEscopo(o: OrcamentoParaPdf): { conteudo: Content[]; foto: number; itens: number; cartoes: number } {
  const A = artes();
  const cliente = cartaoDoCliente(o);
  const titulo = tituloDoEscopo();
  const contempla = blocoContempla();

  const cartoes = cartoesDoOrcamento(o);
  const gap = 10;
  const largura = (LARGURA - (cartoes.length - 1) * gap) / cartoes.length;
  const colunasDeItens = cartoes.length === 1 ? 2 : 1;
  const cabecalho = alturaDoCabecalho(cartoes, largura);
  const itensMedidos = Math.max(
    ...cartoes.map((c) => colunasDosItens(c.itens, largura - 2 * ITENS_CARTAO.paddingX, colunasDeItens).altura),
  );
  const itens = itensMedidos + ITENS_CARTAO.paddingTop + ITENS_CARTAO.paddingBottom;
  // os cartões ficam com a altura que sobra na folha; a foto, com o que sobra dentro deles
  const disponivel =
    ALTURA_UTIL - cliente.altura - ESPACO.aposCliente - titulo.altura - ESPACO.aposTitulo - ESPACO.aposCartoes - contempla.altura - FOLGA;
  // o que sobra na folha para a foto; o cartão NÃO estica até ele: a área da foto tem a altura da
  // própria foto (40 mm em 3:4) e a sobra vai para antes do "contempla", que fica no pé da folha
  const sobra = disponivel - cabecalho - itens;
  const algumaFoto = cartoes.some((c) => A.fotos[c.grupo].arquivo !== null);
  const fotoInteira = algumaFoto ? tamanhoDaFoto(largura, Infinity).altura + 2 * RESPIRO_DA_FOTO : 0;
  const foto = Math.min(sobra, fotoInteira);
  const topo: Content[] = [cliente.peca, { ...titulo.peca, margin: [0, ESPACO.aposCliente, 0, 0] }];
  const fim: Content = { ...contempla.peca, margin: [0, ESPACO.aposCartoes + Math.max(0, sobra - foto), 0, 0], unbreakable: true };

  // Itens demais para caber com a foto mínima: formato de reserva, as seções uma embaixo da
  // outra, na largura toda, sem foto, podendo seguir na folha seguinte (o título da seção se
  // repete no alto da folha nova). Cartão de altura fixa não passa de uma folha.
  if (sobra < FOTO_MINIMA) {
    return {
      foto: 0,
      itens: itensMedidos,
      cartoes: cartoes.length,
      conteudo: [
        ...topo,
        ...cartoes.map((c, i) => ({ ...secaoEmLista(c), margin: [0, i ? 10 : ESPACO.aposTitulo, 0, 0] }) as Content),
        { ...contempla.peca, margin: [0, ESPACO.aposCartoes, 0, 0], unbreakable: true },
      ],
    };
  }
  const alturas = { cabecalho, itens, foto };
  return {
    foto,
    itens: itensMedidos,
    cartoes: cartoes.length,
    conteudo: [
      ...topo,
      {
        columns: cartoes.map((c) => cartaoDoEscopo(c, largura, alturas, colunasDeItens, A.fotos[c.grupo])),
        columnGap: gap,
        margin: [0, ESPACO.aposTitulo, 0, 0],
      },
      fim,
    ],
  };
}

/** Formato de reserva: a seção como tabela de três colunas de itens, que quebra de página. */
function secaoEmLista(cartao: Cartao): Peca {
  const config = PAGINA_2_NOVA.cartoes[cartao.grupo];
  const laranja = cartao.grupo === 'BOMBEIROS';
  const fundo = laranja ? COR.laranja : COR.marinho; // exceção consciente: ver cartaoDoEscopo
  const COLUNAS = 3;
  // a soma das colunas e dos espaçamentos (11 nas bordas, 4 de cada lado entre colunas) fecha com a largura
  const larguraColuna = (LARGURA - 2 * ITENS_CARTAO.paddingX - (COLUNAS - 1) * 2 * 4) / COLUNAS;
  const celula = (item?: ItemDoEscopo): Peca =>
    item
      ? {
          columns: [
            { width: ITENS_CARTAO.marcador, svg: TIQUE, height: ITENS_CARTAO.marcador, margin: [0, 0.5, 0, 0] },
            { width: '*', text: pecaDoItem(item), fontSize: ITENS_CARTAO.tamanho, lineHeight: ITENS_CARTAO.entrelinha },
          ],
          columnGap: ITENS_CARTAO.gap,
        }
      : { text: '' };
  const linhas: Peca[][] = [];
  for (let i = 0; i < cartao.itens.length; i += COLUNAS) {
    linhas.push(Array.from({ length: COLUNAS }, (_, j) => celula(cartao.itens[i + j])));
  }
  const titulo = config.linhas.join(' ');
  const cabecalho = [
    {
      colSpan: COLUNAS,
      fillColor: fundo,
      text: comTrechoLaranja(titulo, laranja ? '' : config.laranja, COR.branco),
      fontSize: tituloDoCartao(cartao.grupo, LARGURA).tamanho,
      bold: true,
      characterSpacing: 0.5,
      margin: [0, 2, 0, 2],
    },
    ...Array.from({ length: COLUNAS - 1 }, () => ({})),
  ];
  const total = linhas.length + 1;
  return {
    table: { headerRows: 1, dontBreakRows: true, widths: Array.from({ length: COLUNAS }, () => larguraColuna), body: [cabecalho, ...linhas] },
    layout: {
      hLineWidth: (i: number) => (i === total ? 0.75 : 0),
      vLineWidth: (i: number) => (i === 0 || i === COLUNAS ? 0.75 : 0),
      hLineColor: () => COR.borda,
      vLineColor: () => COR.borda,
      paddingLeft: (i: number) => (i === 0 ? ITENS_CARTAO.paddingX : 4),
      paddingRight: (i: number) => (i === COLUNAS - 1 ? ITENS_CARTAO.paddingX : 4),
      paddingTop: (i: number) => (i === 0 ? 8 : i === 1 ? 10 : 3),
      paddingBottom: (i: number) => (i === 0 ? 8 : i === total - 1 ? 10 : 3),
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Páginas 1 e 3: arte de fundo com texto por cima
// ---------------------------------------------------------------------------------------------

/**
 * Fundo de página inteira. Sem o arquivo: página cinza com o nome esperado.
 * O TEXTO POR CIMA de cada arte (código, cliente, valor, condições...) entra em `sobreAArte`
 * quando a arte chegar: as posições dependem dela.
 */
function paginaDeArte(fundo: Arte, numero: 1 | 3, o: OrcamentoParaPdf): Content[] {
  // absolutePosition no PRÓPRIO nó: só assim o pdfmake deixa o desenho passar da área útil
  const camada: Content[] = fundo.arquivo
    ? [{ image: fundo.arquivo, width: PAGINA.largura, height: PAGINA.altura, absolutePosition: { x: 0, y: 0 } }]
    : [
        { canvas: [{ type: 'rect', x: 0, y: 0, w: PAGINA.largura, h: PAGINA.altura, color: '#EEF1F5' }], absolutePosition: { x: 0, y: 0 } },
        {
          text: [
            { text: `Página ${numero}: arte do cliente\n`, fontSize: 16, bold: true, color: RESERVADO_TEXTO },
            { text: `aguardando o arquivo ${fundo.nome.includes('/') ? fundo.nome : `assets/proposta/${fundo.nome}`}`, fontSize: 10, color: RESERVADO_TEXTO },
          ],
          alignment: 'center',
          absolutePosition: { x: 0, y: PAGINA.altura / 2 - 20 },
        } as Content,
      ];
  return [...camada, ...sobreAArte(numero, o, fundo.arquivo !== null)];
}

/** Textos posicionados sobre as artes. A capa (1) é fixa: nada por cima. */
function sobreAArte(numero: 1 | 3, o: OrcamentoParaPdf, comArte: boolean): Content[] {
  return numero === 3 ? valoresEContato(o, comArte) : [];
}

// ---------------------------------------------------------------------------------------------
// Página 3: os três valores e o contato, por cima da arte (posições em conteudo/proposta.ts)
// ---------------------------------------------------------------------------------------------

const A_DEFINIR = '[A DEFINIR]';
const n = (v: { toString(): string } | null | undefined) => (v == null ? null : Number(v));

/** Uma linha de texto num campo da página 3 (tamanho, peso e cor próprios). */
type Linha = { texto: string; tamanho: number; negrito?: boolean; cor?: string; acima?: number; entrelinha?: number };

/**
 * O maior tamanho (do máximo ao mínimo) em que o texto cabe numa linha da largura; null = não
 * cabe nem no mínimo. Mede em negrito: para texto normal sobra folga.
 */
function tamanhoQueCabe(texto: string, largura: number, maximo = PAGINA_3_NOVA.tamanhoDoValor, minimo = 11): number | null {
  for (let t = maximo; t >= minimo; t -= 0.5) if (medirLargura(texto, t, 0) <= largura) return t;
  return null;
}

/** Linhas empilhadas num campo de PAGINA_3_NOVA.campos (posição absoluta, largura da caixa). */
function campo(nome: keyof typeof PAGINA_3_NOVA.campos, linhas: Linha[]): Content {
  const c = PAGINA_3_NOVA.campos[nome];
  return {
    absolutePosition: { x: c.x, y: c.y },
    // tabela de uma célula: em posição absoluta é ela que limita a largura do texto ao campo
    table: {
      widths: [c.largura],
      body: [[{
        stack: linhas.map((l) => ({
          text: l.texto,
          fontSize: l.tamanho,
          bold: l.negrito ?? false,
          color: l.cor ?? PAGINA_3_NOVA.cores.valor,
          lineHeight: l.entrelinha ?? 1.05,
          margin: [0, l.acima ?? 0, 0, 0],
        })),
      }]],
    },
    layout: semBordas([0, 0, 0, 0]),
  } as Content;
}

/** Valor grande de um campo: o maior tamanho que cabe na largura dele. */
const valorGrande = (nome: keyof typeof PAGINA_3_NOVA.campos, texto: string): Linha => ({
  texto,
  tamanho: tamanhoQueCabe(texto, PAGINA_3_NOVA.campos[nome].largura) ?? 11,
  negrito: true,
});

/**
 * Linha de apoio (cor de detalhe) no tamanho dado, SEM encolher. Só as duas linhas do orçamento
 * antigo com entrada (anterior a 25/10/2026) saem a 7,5 pt e podem descer até 7 para caber numa
 * linha (`encolheAte`); nada novo usa isso.
 */
const linhaDeApoio = (nome: keyof typeof PAGINA_3_NOVA.campos, texto: string, maximo: number, acima = 0, encolheAte = maximo): Linha => ({
  texto,
  tamanho: tamanhoQueCabe(texto, PAGINA_3_NOVA.campos[nome].largura, maximo, encolheAte) ?? maximo,
  cor: PAGINA_3_NOVA.cores.detalhe,
  acima,
});

/**
 * Os campos dos valores, só com o que está GRAVADO (propostaInvestimento, propostaAVista...,
 * propostaCartao...). Os rótulos ("VALOR DO INVESTIMENTO", "CARTÃO DE CRÉDITO"...) são da arte.
 */
function camposDosValores(o: OrcamentoParaPdf): Content[] {
  const P = PAGINA_3_NOVA;
  const investimento = n(o.propostaInvestimento);
  const aVista = n(o.propostaAVistaValor);
  const parcelas = o.propostaCartaoParcelas;
  const parcela = n(o.propostaCartaoParcela);
  const total = n(o.propostaCartaoTotal);
  const campos: Content[] = [
    campo('investimento', [valorGrande('investimento', investimento == null ? A_DEFINIR : formatarBRL(investimento))]),
    campo('aVista', [valorGrande('aVista', aVista == null ? A_DEFINIR : formatarBRL(aVista))]),
  ];
  if (parcelas == null || parcela == null || total == null) {
    return [...campos, campo('cartaoParcelas', [valorGrande('cartaoParcelas', A_DEFINIR)])];
  }
  const debito = Boolean(o.propostaCartaoDebito);
  const entrada = n(o.propostaCartaoEntrada) ?? 0;
  const ultima = n(o.propostaCartaoUltima);
  const primeira = n(o.propostaCartaoPrimeira);
  // a parcela diferente: a última (regra de 25/10/2026) ou, em orçamento salvo antes, a 1ª
  const outra =
    debito || parcelas < 2
      ? null
      : ultima != null
        ? ultima !== parcela
          ? `última parcela de ${formatarBRL(ultima)}`
          : null
        : primeira != null && primeira !== parcela
          ? `1ª parcela de ${formatarBRL(primeira)}`
          : null;
  // entrada: só orçamento salvo antes de 25/10/2026 (sai como foi enviado), na linha de baixo
  const acima = debito ? 'no débito' : `${parcelas} ${parcelas === 1 ? 'parcela' : 'parcelas'} de`;
  const valor = debito ? formatarBRL(total - entrada) : formatarBRL(parcela);
  const abaixo = [...(entrada > 0 ? [`+ entrada de ${formatarBRL(entrada)} via Pix`] : []), ...(outra ? [outra] : [])];
  // duas linhas de apoio (só orçamento antigo com entrada): menores, para caber antes do total
  const tamanhoAbaixo = abaixo.length > 1 ? 7.5 : 8.5;
  return [
    ...campos,
    campo('cartaoParcelas', [
      linhaDeApoio('cartaoParcelas', acima, 10),
      { ...valorGrande('cartaoParcelas', valor), acima: 1 },
      ...abaixo.map((t, i) => ({
        ...linhaDeApoio('cartaoParcelas', t, tamanhoAbaixo, i === 0 ? (abaixo.length > 1 ? 1 : 2) : 0, abaixo.length > 1 ? 7 : tamanhoAbaixo),
        entrelinha: abaixo.length > 1 ? 0.95 : 1.05,
      })),
    ]),
    campo('cartaoTotal', [linhaDeApoio('cartaoTotal', `total de ${formatarBRL(total)}`, 9)]),
  ];
}

/** Primeiro nome + último sobrenome ("Maria Aparecida dos Santos Ferreira" -> "Maria Ferreira"). */
function nomeAbreviado(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  return partes.length > 2 ? `${partes[0]} ${partes[partes.length - 1]}` : partes.join(' ');
}

/**
 * Nome da consultora e o telefone DA EMPRESA (EMPRESA.telefone; nunca o celular do vendedor) na
 * faixa "PRONTO PARA APROVAR?", numa linha, nome e telefone no mesmo tamanho (10,5 pt). Nome que
 * não cabe se resolve ABREVIANDO, não encolhendo: primeiro nome + último sobrenome a 10,5 pt; só
 * depois disso a letra desce, até 9 pt (piso, como nos selos); por fim, só o primeiro nome. O
 * telefone sai sempre inteiro.
 */
function campoDoContato(o: OrcamentoParaPdf): Content {
  const largura = PAGINA_3_NOVA.campos.contato.largura;
  const completo = o.vendedor.nome.trim();
  const primeiro = completo.split(/\s+/)[0];
  const tentativas: [string, number][] = [
    [completo, 10.5],
    [nomeAbreviado(completo), 10.5],
    [nomeAbreviado(completo), 9],
    [primeiro, 9],
  ];
  for (const [nome, minimo] of tentativas) {
    const linha = `${nome}  ·  ${EMPRESA.telefone}`;
    const tamanho = tamanhoQueCabe(linha, largura, 10.5, minimo);
    if (tamanho !== null) return campo('contato', [{ texto: linha, tamanho, negrito: true }]);
  }
  // só um primeiro nome de mais de ~30 letras chega aqui: sai a 9 pt, inteiro (quebra a linha)
  return campo('contato', [{ texto: `${primeiro}  ·  ${EMPRESA.telefone}`, tamanho: 9, negrito: true }]);
}

/** Os sete campos da página 3 (posições em conteudo/proposta.ts); as logos, só sem a arte. */
function valoresEContato(o: OrcamentoParaPdf, comArte: boolean): Content[] {
  return [...selosNaArte(o), ...camposDosValores(o), campoDoContato(o), ...(comArte ? [] : faixaDasMontadoras())];
}

const ENTRELINHA_DO_SELO = 1.05;
type Selo = keyof typeof PAGINA_3_NOVA.selos;

/** O maior tamanho (do máximo ao mínimo, de 0,5 em 0,5) em que o texto cabe no selo; null = não cabe. */
function tamanhoNoSelo(selo: Selo, texto: string): number | null {
  const caixa = PAGINA_3_NOVA.selos[selo];
  const E = PAGINA_3_NOVA.estiloDosSelos;
  for (let t = E.tamanhoMaximo; t >= E.tamanhoMinimo; t -= 0.5) {
    if (alturaDoTexto(texto, caixa.largura, t, ENTRELINHA_DO_SELO, true) <= caixa.altura) return t;
  }
  return null;
}

/** Para a API conferir ao salvar: o texto cabe no selo sem passar do tamanho mínimo. */
export function cabeNoSelo(selo: Selo, texto: string): boolean {
  return tamanhoNoSelo(selo, texto.trim()) !== null;
}

/**
 * Prazo e garantia nos selos da arte (PAGINA_3_NOVA.selos), medidos com o pdfkit. Nunca corta nem
 * passa abaixo do mínimo: o que não cabe é barrado na entrada (cabeNoSelo); orçamento antigo com
 * texto maior sai no mínimo, inteiro (o comando orcamentos:prazo-garantia lista esses).
 */
function selosNaArte(o: OrcamentoParaPdf): Content[] {
  const textos: Record<Selo, string> = {
    prazo: o.prazoExecucao?.trim() || PAGINA_1.prazo.semPrazo,
    garantia: o.garantia?.trim() || GARANTIA_PADRAO,
  };
  const E = PAGINA_3_NOVA.estiloDosSelos;
  return (Object.keys(textos) as Selo[]).map((selo) => {
    const caixa = PAGINA_3_NOVA.selos[selo];
    return {
      absolutePosition: { x: caixa.x, y: caixa.y },
      // tabela de uma célula: em posição absoluta é ela que limita a largura do texto à caixa
      table: {
        widths: [caixa.largura],
        body: [[{ text: textos[selo], fontSize: tamanhoNoSelo(selo, textos[selo]) ?? E.tamanhoMinimo, bold: true, color: E.cor, lineHeight: ENTRELINHA_DO_SELO }]],
      },
      layout: semBordas([0, 0, 0, 0]),
    } as Content;
  });
}

/**
 * Faixa das logos das montadoras (página 3): fixa, todas do MESMO tamanho, na proporção do arquivo
 * (480 x 220). Logo cujo arquivo falta é pulada e as outras se espalham na mesma faixa.
 */
function faixaDasMontadoras(): Content[] {
  const F = PAGINA_3_NOVA.montadoras;
  const logos = artes().montadoras;
  if (logos.length === 0) return [];
  const largura = Math.min(F.larguraMm, 25) * MM;
  const altura = (largura * 220) / 480;
  const espaco = logos.length > 1 ? (F.largura - logos.length * largura) / (logos.length - 1) : 0;
  const inicio = logos.length > 1 ? F.x : F.x + (F.largura - largura) / 2;
  return logos.map((logo, i) => ({
    image: logo.arquivo!,
    width: largura,
    height: altura,
    absolutePosition: { x: inicio + i * (largura + espaco), y: F.y },
  }));
}

/** Capa do tipo de serviço do orçamento (ou a padrão), no mesmo formato das outras artes. */
function capa(o: OrcamentoParaPdf): Arte {
  const c = capaDoOrcamento(o.tipoDeServico?.nome);
  if (c.arquivo) ARQUIVOS_PERMITIDOS.add(c.arquivo);
  return { arquivo: c.arquivo, nome: c.esperado };
}

// ---------------------------------------------------------------------------------------------
// Documento
// ---------------------------------------------------------------------------------------------

export function documentoDaPropostaNova(o: OrcamentoParaPdf): TDocumentDefinitions {
  const A = artes();
  const escopo = paginaDoEscopo(o);
  return {
    pageSize: 'A4',
    pageMargins: [LATERAL, MARGEM_PAGINA, LATERAL, MARGEM_PAGINA],
    info: { title: `Proposta ${o.codigo} — ${EMPRESA.nome}`, author: EMPRESA.nome, subject: 'Proposta comercial' },
    defaultStyle: { font: 'PlexSans', fontSize: 10, color: COR.texto, lineHeight: 1.15 },
    // "Página X de N" nas páginas 2 em diante; a capa (página 1) é a arte, sem rodapé do sistema
    footer: (pagina: number, total: number) => {
      if (pagina === 1) return null;
      const R = RODAPE_DA_PROPOSTA_NOVA;
      return {
        text: R.texto.replace('{pagina}', String(pagina)).replace('{total}', String(total)),
        fontSize: R.tamanho,
        color: pagina === total ? R.corSobreAArte : R.cor,
        alignment: R.alinhamento,
        characterSpacing: R.espacamento,
        margin: [LATERAL, MARGEM_PAGINA - R.distanciaDaBase - R.tamanho, LATERAL, 0],
      } as Content;
    },
    content: [
      ...paginaDeArte(capa(o), 1, o),
      { text: '', pageBreak: 'after' },
      ...escopo.conteudo,
      { text: '', pageBreak: 'before' },
      ...paginaDeArte(A.pagina3, 3, o),
    ],
  };
}
