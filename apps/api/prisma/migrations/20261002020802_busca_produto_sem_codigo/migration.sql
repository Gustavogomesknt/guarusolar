-- O código do fornecedor sai do texto de busca do produto: número curto digitado ("unidut 1")
-- casava com qualquer código que tivesse o dígito. O código passa a casar pelo COMEÇO, só com a
-- palavra inteira digitada (lib/busca.ts, campo codigoFornecedor). Coluna gerada: recriada.
ALTER TABLE "Produto" DROP COLUMN "textoBusca";
ALTER TABLE "Produto" ADD COLUMN "textoBusca" TEXT
  GENERATED ALWAYS AS (texto_de_busca("nome")) STORED;
