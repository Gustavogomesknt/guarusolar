-- Busca por palavras: cada tabela pesquisável ganha "textoBusca", calculada PELO BANCO (coluna
-- gerada): minúsculas, sem acento e sem pontuação, com espaço nas pontas (" disj jng 1x20a ").
-- A API procura cada palavra digitada aí (lib/busca.ts). Nada no código precisa mantê-la.
-- Só adições: a versão anterior do código ignora a coluna.

-- Acentos trocados antes do lower(): funciona com qualquer collation do banco (mesmo "C").
CREATE OR REPLACE FUNCTION texto_de_busca(texto text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT ' ' || btrim(regexp_replace(
    lower(translate(coalesce(texto, ''),
      'ÁÀÂÃÄÅÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑáàâãäåéèêëíìîïóòôõöúùûüçñ',
      'aaaaaaeeeeiiiiooooouuuucnaaaaaaeeeeiiiiooooouuuucn')),
    '[^a-z0-9]+', ' ', 'g')) || ' '
$$;

ALTER TABLE "Produto" ADD COLUMN "textoBusca" TEXT
  GENERATED ALWAYS AS (texto_de_busca(coalesce("nome", '') || ' ' || coalesce("codigoFornecedor", ''))) STORED;

ALTER TABLE "Cliente" ADD COLUMN "textoBusca" TEXT
  GENERATED ALWAYS AS (texto_de_busca(coalesce("nome", '') || ' ' || coalesce("documento", '') || ' ' || coalesce("whatsapp", ''))) STORED;

-- orçamento: código, cliente e cidade como estão na proposta (a cópia gravada); o nome atual do
-- cadastro entra pela busca do cliente (vínculo)
ALTER TABLE "Orcamento" ADD COLUMN "textoBusca" TEXT
  GENERATED ALWAYS AS (texto_de_busca(coalesce("codigo", '') || ' ' || coalesce("clienteNome", '') || ' ' || coalesce("clienteCidade", ''))) STORED;

ALTER TABLE "Projeto" ADD COLUMN "textoBusca" TEXT
  GENERATED ALWAYS AS (texto_de_busca(coalesce("codigo", ''))) STORED;
