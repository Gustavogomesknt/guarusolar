/*
 * Importação do catálogo a partir de planilha (.xlsx), em DUAS etapas: nada é gravado sem revisão.
 *
 *   1. npm run produtos:importar -- revisar materiais.xlsx [--margem 30 | --margem "PROTECAO=35,CABO=25,*=30"]
 *      Lê COD, PRODUTO e VALOR (custo) e, se houver, UNIDADE. Gera materiais-revisao.xlsx com
 *      categoria e unidade inferidas por palavra-chave (listas de escolha no Excel), margem, preço de
 *      venda (fórmula, muda ao mexer na margem), a coluna IMPORTAR (S, N ou ?) e a SITUAÇÃO de cada
 *      linha. Linha inválida sai N; nome repetido na planilha sai "?" para você decidir; o que já
 *      está no catálogo sai N. Não grava nada.
 *   2. Revise no Excel: categoria, unidade, margem e IMPORTAR (troque todo "?" por S ou N; para
 *      importar dois itens de mesmo nome, mude o nome de um deles).
 *   3. npm run produtos:importar -- gravar materiais-revisao.xlsx
 *      Confere tudo de novo (inclusive contra o catálogo), mostra o resumo e só grava depois de
 *      você digitar IMPORTAR. Grava tudo ou nada (uma transação).
 *
 * Margem = sobre a VENDA, como o catálogo calcula: venda = custo ÷ (1 − margem). Itens de serviço
 * (mão de obra, projeto/ART, indicação) entram SEM margem: venda = custo.
 * O banco é o da DATABASE_URL (o .env: desenvolvimento). O banco aparece antes de gravar.
 */
import 'dotenv/config';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import ExcelJS from 'exceljs';
import { PrismaClient } from '@prisma/client';
import { CATEGORIAS_PRODUTO, ROTULO_CATEGORIA, ROTULO_UNIDADE, UNIDADES, type CategoriaProduto, type Unidade } from '@guarusolar/compartilhado';
import { bancoDeProducao } from '../src/lib/ambienteDoBanco';

// ---------------------------------------------------------------------------------------------
// Palavras-chave. A PRIMEIRA regra que casar vence, nesta ordem (por isso "cabo de aterramento"
// é Cabo e "caixa de passagem" é Eletroduto e fixação). Nomes comparados sem acento, em maiúsculas.
// ---------------------------------------------------------------------------------------------

type Regra = { categoria: CategoriaProduto; padroes: RegExp[]; semMargem?: boolean };
const REGRAS: Regra[] = [
  { categoria: 'PROJETO', semMargem: true, padroes: [/\bART\b/, /\bTRT\b/, /DIAGRAMA/, /UNIFILAR/, /HOMOLOG/, /\bPROJETO\b/, /\bLAUDO\b/] },
  { categoria: 'MAO_DE_OBRA', semMargem: true, padroes: [/INSTALACAO/, /MAO DE OBRA/, /\bVISITA\b/, /\bTECNICOS?\b/, /\bSERVICO\b/] },
  // comissão de quem indicou o cliente: repasse, sem margem
  { categoria: 'OUTROS', semMargem: true, padroes: [/INDICACAO/] },
  { categoria: 'CARREGADOR', padroes: [/CARREGADOR/, /WALL ?BOX/, /\bEVSE\b/, /TOMADA VEICULAR/] },
  { categoria: 'INVERSOR', padroes: [/INVERSOR/, /\bMICRO ?INV/] },
  { categoria: 'PAINEL_SOLAR', padroes: [/PAINEL (SOLAR|FOTOVOLTAICO)/, /\bMODULO\b/, /PLACA SOLAR/, /\bPAINEL\b.*\d+ ?W\b/] },
  { categoria: 'ESTRUTURA', padroes: [/ESTRUTURA/, /\bTRILHO/, /\bGANCHO/, /\bLAJE\b/, /CLAMP/, /\bGRAMPO/] },
  { categoria: 'CABO', padroes: [/\bCABOS?\b/, /\bCAB\b/, /\bFIOS?\b/, /CORDOALHA/] },
  {
    categoria: 'INFRAESTRUTURA',
    padroes: [
      /ELETRODUTO/, /\bELETROD\b/, /ELETROCALHA/, /CONDULETE/, /\bCURVA\b/, /\bLUVA\b/, /ABRACADEIRA/, /BRACADEIRA/,
      /\bBUCHA\b/, /PARAFUSO/, /\bPORCA\b/, /ARRUELA/, /CHUMBADOR/, /PERFILADO/, /UNIDUT/, /CAIXA DE PASSAGEM/, /\bCX\.? ?(DE )?PASSAGEM/,
    ],
  },
  { categoria: 'QUADRO', padroes: [/\bQUADRO/, /\bQDC\b/, /\bQDG\b/, /\bQD\b/, /STRING ?BOX/, /\bCAIXA\b/, /\bCX\b/, /PAINEL (ELETRICO|DE COMANDO)/] },
  {
    categoria: 'PROTECAO',
    padroes: [/\bDISJ/, /\bDPS\b/, /\bDR\b/, /\bIDR\b/, /FUSIVEL/, /SECCIONADORA/, /CHAVE SECC/, /\bHASTE/, /ATERRAMENTO/, /BOTOEIRA/, /EMERGENCIA/, /SUPRESSOR/, /\bRELE\b/, /CONTATOR/],
  },
  { categoria: 'CONEXAO', padroes: [/CONECTOR/, /\bMC ?4\b/, /TERMINAL/, /\bTERM\b/, /\bBORNE/, /BARRAMENTO/, /\bEMENDA/, /\bPLUGU?E?\b/, /\bTOMADA\b/, /SPLIT ?BOLT/, /ADAPTADOR/] },
];

const normalizar = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();

function inferirCategoria(nome: string): { categoria: CategoriaProduto; palavra: string; semMargem: boolean } {
  const n = normalizar(nome);
  for (const regra of REGRAS) {
    for (const padrao of regra.padroes) {
      const achou = n.match(padrao);
      if (achou) return { categoria: regra.categoria, palavra: achou[0].trim(), semMargem: Boolean(regra.semMargem) };
    }
  }
  return { categoria: 'OUTROS', palavra: '', semMargem: false };
}

/** Unidade escrita na planilha (UN, PC, PÇ, M, MT, BARRA, BR, ROLO, RL, KIT, SERV...). */
function unidadeDoTexto(texto: string): Unidade | null {
  const t = normalizar(texto).replace(/\.$/, '');
  const mapa: Record<string, Unidade> = {
    UN: 'UN', UND: 'UN', UNID: 'UN', UNIDADE: 'UN', PC: 'PECA', PCA: 'PECA', PECA: 'PECA', 'PC.': 'PECA',
    M: 'M', MT: 'M', MTS: 'M', METRO: 'M', METROS: 'M', BARRA: 'BARRA', BR: 'BARRA', BRR: 'BARRA',
    ROLO: 'ROLO', RL: 'ROLO', KIT: 'KIT', KT: 'KIT', SERV: 'SERVICO', SERVICO: 'SERVICO', KWP: 'KWP',
  };
  return mapa[t] ?? null;
}

function inferirUnidade(nome: string, categoria: CategoriaProduto, semMargem: boolean): Unidade {
  const n = normalizar(nome);
  if (semMargem || categoria === 'MAO_DE_OBRA' || categoria === 'PROJETO') return 'SERVICO';
  if (/\bKIT\b/.test(n)) return 'KIT';
  if (categoria === 'CABO') return 'M';
  if (/ELETRODUTO|\bELETROD\b|ELETROCALHA|PERFILADO/.test(n)) return 'BARRA';
  return 'UN';
}

// ---------------------------------------------------------------------------------------------
// Margem: "30" (todas) ou "PROTECAO=35,CABO=25,*=30" (por categoria; * = as demais)
// ---------------------------------------------------------------------------------------------

function lerMargens(texto: string | undefined): (c: CategoriaProduto) => number | null {
  if (!texto) return () => null;
  const partes = texto.split(',').map((p) => p.trim()).filter(Boolean);
  const porCategoria = new Map<string, number>();
  let padrao: number | null = null;
  for (const parte of partes) {
    const [chave, valor] = parte.includes('=') ? parte.split('=') : ['*', parte];
    const pct = Number(String(valor).replace(',', '.'));
    if (!(pct >= 0 && pct < 100)) throw new Error(`Margem inválida: "${parte}" (use de 0 a 99).`);
    const c = chave.trim().toUpperCase();
    if (c === '*') padrao = pct;
    else if ((CATEGORIAS_PRODUTO as readonly string[]).includes(c)) porCategoria.set(c, pct);
    else throw new Error(`Categoria desconhecida na margem: "${chave}". Use: ${CATEGORIAS_PRODUTO.join(', ')} ou *.`);
  }
  return (c) => porCategoria.get(c) ?? padrao;
}

const vendaPelaMargem = (custo: number, margemPct: number) => Math.round((custo / (1 - margemPct / 100)) * 100) / 100;

// ---------------------------------------------------------------------------------------------
// Leitura de células
// ---------------------------------------------------------------------------------------------

function textoDaCelula(valor: ExcelJS.CellValue): string {
  if (valor === null || valor === undefined) return '';
  if (typeof valor === 'object') {
    if ('result' in valor) return textoDaCelula(valor.result as ExcelJS.CellValue);
    if ('richText' in valor) return valor.richText.map((r) => r.text).join('');
    if ('text' in valor) return String(valor.text);
    if (valor instanceof Date) return valor.toISOString();
  }
  return String(valor).trim();
}

/** 1234.5, "1.234,50", "R$ 1.234,50", "1234,5" -> número; vazio ou texto -> NaN. */
function numeroDaCelula(valor: ExcelJS.CellValue): number {
  if (typeof valor === 'number') return valor;
  const t = textoDaCelula(valor).replace(/R\$\s?/i, '').trim();
  if (!t) return NaN;
  const limpo = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t;
  return /^-?\d+(\.\d+)?$/.test(limpo) ? Number(limpo) : NaN;
}

async function lerPlanilha(arquivo: string) {
  const livro = new ExcelJS.Workbook();
  await livro.xlsx.readFile(arquivo);
  const folha = livro.worksheets[0];
  if (!folha) throw new Error('A planilha não tem nenhuma aba.');
  return folha;
}

/** Acha a linha de cabeçalho e as colunas pelos nomes (COD, PRODUTO, VALOR; UNIDADE opcional). */
function acharColunas(folha: ExcelJS.Worksheet, nomes: Record<string, RegExp>) {
  for (let r = 1; r <= Math.min(folha.rowCount, 15); r++) {
    const linha = folha.getRow(r);
    const achadas: Record<string, number> = {};
    linha.eachCell((celula, c) => {
      const t = normalizar(textoDaCelula(celula.value));
      for (const [chave, padrao] of Object.entries(nomes)) if (!(chave in achadas) && padrao.test(t)) achadas[chave] = c;
    });
    if (['codigo', 'nome', 'custo'].every((k) => k in achadas)) return { cabecalho: r, colunas: achadas };
  }
  throw new Error('Não achei o cabeçalho: a planilha precisa das colunas COD, PRODUTO e VALOR (custo).');
}

// ---------------------------------------------------------------------------------------------
// Etapa 1: revisar
// ---------------------------------------------------------------------------------------------

type LinhaRevisao = {
  linha: number;
  codigo: string;
  nome: string;
  custo: number;
  categoria: CategoriaProduto;
  palavra: string;
  unidade: Unidade;
  origemUnidade: 'planilha' | 'inferida';
  margem: number | null;
  importar: 'S' | 'N' | '?';
  situacao: string[];
};

const COLUNAS_REVISAO = ['LINHA', 'CÓDIGO', 'NOME', 'CUSTO', 'CATEGORIA', 'PALAVRA QUE DEFINIU', 'UNIDADE', 'UNIDADE VEIO DE', 'MARGEM %', 'VENDA', 'IMPORTAR', 'SITUAÇÃO'];

async function revisar(arquivo: string, margemTexto: string | undefined, prisma: PrismaClient) {
  const margemDe = lerMargens(margemTexto);
  const folha = await lerPlanilha(arquivo);
  const { cabecalho, colunas } = acharColunas(folha, {
    codigo: /^COD/,
    nome: /^(PRODUTO|NOME|DESCRI|MATERIAL)/,
    custo: /^(VALOR|CUSTO|PRECO)/,
    unidade: /^(UN|UND|UNID|UNIDADE)$/,
  });

  const linhas: LinhaRevisao[] = [];
  for (let r = cabecalho + 1; r <= folha.rowCount; r++) {
    const row = folha.getRow(r);
    const codigo = textoDaCelula(row.getCell(colunas.codigo).value).replace(/\.0+$/, '');
    const nome = textoDaCelula(row.getCell(colunas.nome).value);
    const custoBruto = row.getCell(colunas.custo).value;
    const unidadeTexto = colunas.unidade ? textoDaCelula(row.getCell(colunas.unidade).value) : '';
    if (!codigo && !nome && textoDaCelula(custoBruto) === '') continue; // linha em branco
    const custo = numeroDaCelula(custoBruto);
    const { categoria, palavra, semMargem } = inferirCategoria(nome);
    const daPlanilha = unidadeTexto ? unidadeDoTexto(unidadeTexto) : null;
    const situacao: string[] = [];
    let importar: LinhaRevisao['importar'] = 'S';

    const invalida: string[] = [];
    if (!/[0-9A-Za-z]/.test(codigo)) invalida.push(`código "${codigo}"`);
    if (nome.length < 3 || /^(N\/?A|-+|\.+)$/i.test(nome)) invalida.push(`nome "${nome}"`);
    if (!(custo > 0)) invalida.push(`custo "${textoDaCelula(custoBruto)}"`);
    if (invalida.length) {
      importar = 'N';
      situacao.push(`INVÁLIDA: ${invalida.join(', ')}`);
    }
    if (unidadeTexto && !daPlanilha) situacao.push(`unidade "${unidadeTexto}" não reconhecida: escolha na lista`);
    if (!palavra) situacao.push('categoria não reconhecida: confira');

    linhas.push({
      linha: r,
      codigo,
      nome,
      custo,
      categoria,
      palavra,
      unidade: daPlanilha ?? inferirUnidade(nome, categoria, semMargem),
      origemUnidade: daPlanilha ? 'planilha' : 'inferida',
      margem: semMargem || categoria === 'MAO_DE_OBRA' || categoria === 'PROJETO' ? 0 : margemDe(categoria),
      importar,
      situacao,
    });
  }

  // Repetidos DENTRO da planilha: não escolho sozinho, ficam "?" para você decidir
  const marcarRepetidos = (chave: (l: LinhaRevisao) => string, oQue: string) => {
    const grupos = new Map<string, LinhaRevisao[]>();
    for (const l of linhas.filter((x) => x.importar !== 'N')) {
      const k = chave(l);
      if (k) grupos.set(k, [...(grupos.get(k) ?? []), l]);
    }
    for (const grupo of grupos.values()) {
      if (grupo.length < 2) continue;
      for (const l of grupo) {
        l.importar = '?';
        const outras = grupo.filter((x) => x !== l).map((x) => `linha ${x.linha} (cód. ${x.codigo}, ${formatar(x.custo)})`);
        l.situacao.push(`${oQue} repetido: ${outras.join('; ')}. Decida S ou N; para manter os dois, mude um nome`);
      }
    }
  };
  marcarRepetidos((l) => normalizar(l.nome), 'NOME');
  marcarRepetidos((l) => l.codigo, 'CÓDIGO');

  // Já no catálogo (itens ativos): mesmo código ou mesmo nome
  const ativos = await prisma.produto.findMany({ where: { ativo: true }, select: { nome: true, codigoFornecedor: true } });
  const porCodigo = new Map(ativos.filter((p) => p.codigoFornecedor).map((p) => [p.codigoFornecedor!, p.nome]));
  const porNome = new Set(ativos.map((p) => normalizar(p.nome)));
  for (const l of linhas) {
    if (l.importar === 'N') continue;
    if (porCodigo.has(l.codigo)) {
      l.importar = 'N';
      l.situacao.push(`JÁ NO CATÁLOGO com este código: ${porCodigo.get(l.codigo)}`);
    } else if (porNome.has(normalizar(l.nome))) {
      l.importar = 'N';
      l.situacao.push('JÁ NO CATÁLOGO com este nome');
    }
  }

  const destino = arquivo.replace(/\.xlsx$/i, '') + '-revisao.xlsx';
  await gravarRevisao(destino, linhas);
  mostrarResumoDaRevisao(linhas, destino, Boolean(margemTexto));
}

const formatar = (v: number) => (Number.isFinite(v) ? v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—');

async function gravarRevisao(destino: string, linhas: LinhaRevisao[]) {
  const livro = new ExcelJS.Workbook();
  const folha = livro.addWorksheet('Revisão', { views: [{ state: 'frozen', ySplit: 1 }] });
  folha.addRow(COLUNAS_REVISAO);
  folha.getRow(1).font = { bold: true };
  folha.columns = [8, 10, 46, 12, 18, 18, 12, 14, 10, 12, 10, 70].map((width) => ({ width }));

  // listas de escolha (códigos) e a legenda com o nome de cada um
  const listas = livro.addWorksheet('Listas');
  listas.addRow(['CATEGORIA', 'NOME', '', 'UNIDADE', 'NOME']);
  listas.getRow(1).font = { bold: true };
  const maior = Math.max(CATEGORIAS_PRODUTO.length, UNIDADES.length);
  for (let i = 0; i < maior; i++) {
    const c = CATEGORIAS_PRODUTO[i];
    const u = UNIDADES[i];
    listas.addRow([c ?? '', c ? ROTULO_CATEGORIA[c] : '', '', u ?? '', u ? ROTULO_UNIDADE[u] : '']);
  }
  listas.columns = [18, 26, 4, 12, 12].map((width) => ({ width }));

  linhas.forEach((l, i) => {
    const r = i + 2;
    folha.addRow([l.linha, l.codigo, l.nome, Number.isFinite(l.custo) ? l.custo : null, l.categoria, l.palavra, l.unidade, l.origemUnidade, l.margem, null, l.importar, l.situacao.join(' | ')]);
    folha.getCell(`D${r}`).numFmt = '"R$" #,##0.00';
    folha.getCell(`J${r}`).value = { formula: `IF(OR(D${r}="",I${r}=""),"",ROUND(D${r}/(1-I${r}/100),2))` };
    folha.getCell(`J${r}`).numFmt = '"R$" #,##0.00';
    folha.getCell(`E${r}`).dataValidation = { type: 'list', allowBlank: false, formulae: [`Listas!$A$2:$A$${CATEGORIAS_PRODUTO.length + 1}`] };
    folha.getCell(`G${r}`).dataValidation = { type: 'list', allowBlank: false, formulae: [`Listas!$D$2:$D$${UNIDADES.length + 1}`] };
    folha.getCell(`K${r}`).dataValidation = { type: 'list', allowBlank: false, formulae: ['"S,N,?"'] };
    if (l.importar !== 'S') {
      const cor = l.importar === '?' ? 'FFFFF2CC' : 'FFF4F6FA';
      folha.getRow(r).eachCell((celula) => (celula.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: cor } }));
    }
  });
  await livro.xlsx.writeFile(destino);
}

function mostrarResumoDaRevisao(linhas: LinhaRevisao[], destino: string, comMargem: boolean) {
  const conta = (f: (l: LinhaRevisao) => boolean) => linhas.filter(f).length;
  console.log(`\n${linhas.length} linhas lidas: ${conta((l) => l.importar === 'S')} para importar, ${conta((l) => l.importar === '?')} para você decidir, ${conta((l) => l.importar === 'N')} fora.\n`);
  console.log('Por categoria (S e ?):');
  for (const c of CATEGORIAS_PRODUTO) {
    const n = conta((l) => l.categoria === c && l.importar !== 'N');
    if (n) console.log(`  ${ROTULO_CATEGORIA[c].padEnd(24)} ${n}`);
  }
  const problemas = linhas.filter((l) => l.importar !== 'S' || l.situacao.length);
  if (problemas.length) {
    console.log('\nLinhas que pedem atenção:');
    for (const l of problemas) console.log(`  [${l.importar}] linha ${l.linha} · cód. ${l.codigo || '—'} · ${l.nome || '—'} · ${formatar(l.custo)}\n        ${l.situacao.join('\n        ')}`);
  }
  if (!comMargem) console.log('\nSem --margem: a coluna MARGEM % ficou vazia nos itens com margem. Preencha na revisão ou rode de novo com --margem.');
  console.log(`\nRevisão gravada em: ${destino}\nNada foi gravado no banco. Revise e rode: npm run produtos:importar -- gravar "${destino}"`);
}

// ---------------------------------------------------------------------------------------------
// Etapa 2: gravar (a partir da revisão)
// ---------------------------------------------------------------------------------------------

async function gravar(arquivo: string, prisma: PrismaClient) {
  const folha = await lerPlanilha(arquivo);
  const cab = folha.getRow(1);
  const coluna = (nome: string) => {
    let achada = 0;
    cab.eachCell((celula, c) => {
      if (textoDaCelula(celula.value) === nome) achada = c;
    });
    if (!achada) throw new Error(`Esta não parece a planilha de revisão: falta a coluna ${nome}.`);
    return achada;
  };
  const col = Object.fromEntries(COLUNAS_REVISAO.map((n) => [n, coluna(n)]));

  type Item = { linha: number; codigo: string; nome: string; custo: number; categoria: CategoriaProduto; unidade: Unidade; margem: number; venda: number };
  const itens: Item[] = [];
  const erros: string[] = [];
  let pulados = 0;
  for (let r = 2; r <= folha.rowCount; r++) {
    const row = folha.getRow(r);
    const v = (n: string) => row.getCell(col[n]).value;
    const importar = textoDaCelula(v('IMPORTAR')).toUpperCase();
    const linha = numeroDaCelula(v('LINHA'));
    if (!importar && !textoDaCelula(v('NOME'))) continue;
    if (importar === 'N') {
      pulados++;
      continue;
    }
    const onde = `linha ${linha} da planilha original`;
    if (importar !== 'S') {
      erros.push(`${onde}: IMPORTAR está "${importar || 'vazio'}"; decida S ou N`);
      continue;
    }
    const codigo = textoDaCelula(v('CÓDIGO'));
    const nome = textoDaCelula(v('NOME'));
    const custo = numeroDaCelula(v('CUSTO'));
    const categoria = textoDaCelula(v('CATEGORIA')).toUpperCase() as CategoriaProduto;
    const unidade = textoDaCelula(v('UNIDADE')).toUpperCase() as Unidade;
    const margem = numeroDaCelula(v('MARGEM %'));
    const problemas: string[] = [];
    if (!/[0-9A-Za-z]/.test(codigo)) problemas.push('código inválido');
    if (nome.length < 3) problemas.push('nome inválido');
    if (!(custo > 0)) problemas.push('custo inválido');
    if (!(CATEGORIAS_PRODUTO as readonly string[]).includes(categoria)) problemas.push(`categoria "${categoria}" não existe`);
    if (!(UNIDADES as readonly string[]).includes(unidade)) problemas.push(`unidade "${unidade}" não existe`);
    if (!(margem >= 0 && margem < 100)) problemas.push('MARGEM % vazia ou fora de 0 a 99');
    if (problemas.length) {
      erros.push(`${onde} (${nome || codigo}): ${problemas.join(', ')}`);
      continue;
    }
    itens.push({ linha, codigo, nome, custo, categoria, unidade, margem, venda: vendaPelaMargem(custo, margem) });
  }

  // repetidos entre os que vão entrar, e contra o catálogo
  const repetidos = (chave: (i: Item) => string, oQue: string) => {
    const vistos = new Map<string, Item>();
    for (const i of itens) {
      const k = chave(i);
      const outro = vistos.get(k);
      if (outro) erros.push(`${oQue} repetido entre as linhas ${outro.linha} e ${i.linha} ("${i.nome}"): só uma pode ficar S`);
      else vistos.set(k, i);
    }
  };
  repetidos((i) => i.codigo, 'Código');
  repetidos((i) => normalizar(i.nome), 'Nome');
  const ativos = await prisma.produto.findMany({ where: { ativo: true }, select: { nome: true, codigoFornecedor: true } });
  for (const i of itens) {
    const mesmoCodigo = ativos.find((p) => p.codigoFornecedor === i.codigo);
    if (mesmoCodigo) erros.push(`linha ${i.linha}: o código ${i.codigo} já é de "${mesmoCodigo.nome}" no catálogo`);
    else if (ativos.some((p) => normalizar(p.nome) === normalizar(i.nome))) erros.push(`linha ${i.linha}: "${i.nome}" já existe no catálogo`);
  }

  if (erros.length) {
    console.error(`\nNada foi gravado. Corrija na revisão e rode de novo:\n  ${erros.join('\n  ')}`);
    process.exitCode = 1;
    return;
  }
  if (!itens.length) {
    console.log('Nenhuma linha com IMPORTAR = S.');
    return;
  }

  const onde = (await bancoDeProducao(prisma)) ? 'PRODUÇÃO' : 'desenvolvimento';
  console.log(`\nBanco: ${onde}\n${itens.length} itens para importar (${pulados} linhas marcadas N ficam de fora):`);
  for (const c of CATEGORIAS_PRODUTO) {
    const daCategoria = itens.filter((i) => i.categoria === c);
    if (daCategoria.length) console.log(`  ${ROTULO_CATEGORIA[c].padEnd(24)} ${String(daCategoria.length).padStart(3)}   custo ${formatar(daCategoria.reduce((t, i) => t + i.custo, 0)).padStart(14)}   venda ${formatar(daCategoria.reduce((t, i) => t + i.venda, 0)).padStart(14)}`);
  }
  console.log('\nAmostra:');
  for (const i of itens.slice(0, 5)) console.log(`  cód. ${i.codigo} · ${i.nome} · custo ${formatar(i.custo)} · margem ${i.margem}% · venda ${formatar(i.venda)} · ${ROTULO_UNIDADE[i.unidade]}`);

  const pergunta = createInterface({ input: process.stdin, output: process.stdout });
  const resposta = await pergunta.question(`\nGravar ${itens.length} itens no banco de ${onde}? Digite IMPORTAR para confirmar: `);
  pergunta.close();
  if (resposta.trim() !== 'IMPORTAR') {
    console.log('Nada foi gravado.');
    return;
  }
  await prisma.$transaction(
    itens.map((i) =>
      prisma.produto.create({
        data: { nome: i.nome, codigoFornecedor: i.codigo, categoria: i.categoria, unidade: i.unidade, precoCusto: i.custo, precoVenda: i.venda },
      }),
    ),
  );
  console.log(`${itens.length} itens importados no catálogo.`);
}

// ---------------------------------------------------------------------------------------------

async function main() {
  const [etapa, arquivo, ...resto] = process.argv.slice(2);
  const opcao = (nome: string) => {
    const i = resto.indexOf(`--${nome}`);
    return i >= 0 ? resto[i + 1] : undefined;
  };
  if (!['revisar', 'gravar'].includes(etapa) || !arquivo) {
    console.log('Use:\n  npm run produtos:importar -- revisar planilha.xlsx [--margem 30]\n  npm run produtos:importar -- gravar planilha-revisao.xlsx');
    process.exitCode = 1;
    return;
  }
  const prisma = new PrismaClient();
  try {
    if (etapa === 'revisar') await revisar(path.resolve(arquivo), opcao('margem'), prisma);
    else await gravar(path.resolve(arquivo), prisma);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(`Erro: ${(e as Error).message}`);
  process.exitCode = 1;
});
