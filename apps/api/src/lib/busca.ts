/*
 * Busca por palavras, igual em produtos, clientes, orçamentos e projetos.
 *
 * Cada tabela tem a coluna "textoBusca", GERADA pelo banco (função texto_de_busca, migration
 * texto_de_busca): minúsculas, sem acento e sem pontuação, com espaço nas pontas:
 *   "DISJ. JNG 1X20A"  ->  " disj jng 1x20a "
 * (o código do fornecedor do produto fica FORA: casa só digitado inteiro, na rota de produtos)
 *
 * Regras:
 *  - TODAS as palavras digitadas precisam aparecer, em qualquer ordem e em qualquer campo;
 *  - cada palavra casa como pedaço do texto ("20" acha "1x20a"; "acacias" acha "Acácias");
 *  - abreviação do catálogo: uma palavra do item com 4+ letras casa com qualquer palavra
 *    digitada que COMECE com ela ("disjuntor" acha "DISJ", "eletroduto" acha "ELETROD").
 *    Sem dicionário de apelidos: DUTO, CX, PÇ (que não são começo da palavra) não entram.
 *
 * Desempenho (medido com 20 mil itens, README): sem índice, cabe folgado no tempo de uma tecla.
 */

/** O mesmo que a função texto_de_busca do banco faz, do lado da API. */
export function normalizarBusca(texto: string) {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Palavras da busca, sem repetir; no máximo 8 (o resto não muda o resultado na prática). */
export function palavrasDaBusca(q: string | undefined | null) {
  return [...new Set(normalizarBusca(q ?? '').split(' ').filter(Boolean))].slice(0, 8);
}

const MINIMO_ABREVIACAO = 4;

/**
 * Formas de uma palavra casar: como pedaço do texto, ou (palavra só de letras, maior que a
 * abreviação) um começo dela com 4+ letras que esteja no texto como palavra inteira.
 */
export function padroesDaPalavra(palavra: string): string[] {
  const padroes = [palavra];
  if (/^[a-z]+$/.test(palavra)) {
    for (let n = MINIMO_ABREVIACAO; n < palavra.length; n++) padroes.push(` ${palavra.slice(0, n)} `);
  }
  return padroes;
}

/**
 * Filtro do Prisma: cada palavra (AND) casa em algum dos campos (OR), por algum padrão.
 * `campos` monta o filtro de um campo de texto de busca a partir do padrão, ex.:
 *   (p) => [{ textoBusca: { contains: p } }, { cliente: { textoBusca: { contains: p } } }]
 */
export function filtroDeBusca<T>(q: string | undefined | null, campos: (padrao: string) => T[]): { AND: { OR: T[] }[] } | undefined {
  const palavras = palavrasDaBusca(q);
  if (!palavras.length) return undefined;
  return { AND: palavras.map((palavra) => ({ OR: padroesDaPalavra(palavra).flatMap(campos) })) };
}
