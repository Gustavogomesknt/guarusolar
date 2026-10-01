-- Categorias para solar e carregador veicular, unidades da planilha e código do fornecedor.
-- Só adições (publicação sem queda). As posições (BEFORE) mantêm o catálogo agrupado: ele lista
-- pela ordem do enum (solar, mobilidade, elétrica, serviços, outros).

ALTER TYPE "CategoriaProduto" ADD VALUE IF NOT EXISTS 'CARREGADOR' BEFORE 'CABO';
ALTER TYPE "CategoriaProduto" ADD VALUE IF NOT EXISTS 'PROTECAO' BEFORE 'CABO';
ALTER TYPE "CategoriaProduto" ADD VALUE IF NOT EXISTS 'QUADRO' BEFORE 'CABO';
ALTER TYPE "CategoriaProduto" ADD VALUE IF NOT EXISTS 'CONEXAO' BEFORE 'MAO_DE_OBRA';
ALTER TYPE "CategoriaProduto" ADD VALUE IF NOT EXISTS 'INFRAESTRUTURA' BEFORE 'MAO_DE_OBRA';
ALTER TYPE "CategoriaProduto" ADD VALUE IF NOT EXISTS 'PROJETO' BEFORE 'OUTROS';

ALTER TYPE "Unidade" ADD VALUE IF NOT EXISTS 'PECA' BEFORE 'KIT';
ALTER TYPE "Unidade" ADD VALUE IF NOT EXISTS 'BARRA' BEFORE 'SERVICO';
ALTER TYPE "Unidade" ADD VALUE IF NOT EXISTS 'ROLO' BEFORE 'SERVICO';

ALTER TABLE "Produto" ADD COLUMN "codigoFornecedor" TEXT;

-- Único entre os ATIVOS (um desativado não impede reaproveitar o código). Índice parcial: o
-- Prisma não o descreve no schema; o "migrate diff" passa a sugerir DROP dele, e essa linha
-- deve ser APAGADA do SQL gerado (CLAUDE.md).
CREATE UNIQUE INDEX "Produto_codigoFornecedor_ativo_key" ON "Produto" ("codigoFornecedor")
  WHERE "ativo" AND "codigoFornecedor" IS NOT NULL;
