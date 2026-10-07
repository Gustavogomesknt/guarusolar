-- O custo do produto passa a ser opcional: em branco (NULL) = custo desconhecido.
-- O catálogo da Guarusolar vem da planilha só com preço de venda. Nenhum item existente muda.
ALTER TABLE "Produto" ALTER COLUMN "precoCusto" DROP NOT NULL;
