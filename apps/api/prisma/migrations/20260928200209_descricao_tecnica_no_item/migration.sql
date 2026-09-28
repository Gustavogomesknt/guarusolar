-- AlterTable
ALTER TABLE "ItemOrcamento" ADD COLUMN     "descricaoTecnica" TEXT;

-- AlterTable (mesma expressão já usada; o Prisma reescreve o default ao comparar)
ALTER TABLE "Orcamento" ALTER COLUMN "tokenPdf" SET DEFAULT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');

-- Itens já gravados: copia a descrição técnica atual do produto (regra 2: daqui em diante
-- fica gravada no item e não muda com o catálogo).
UPDATE "ItemOrcamento" AS i
SET "descricaoTecnica" = p."descricaoTecnica"
FROM "Produto" AS p
WHERE p."id" = i."produtoId" AND p."descricaoTecnica" IS NOT NULL;
