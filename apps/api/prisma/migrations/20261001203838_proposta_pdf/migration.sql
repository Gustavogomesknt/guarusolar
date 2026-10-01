-- AlterTable
ALTER TABLE "Orcamento" ADD COLUMN     "descricaoServico" TEXT,
ADD COLUMN     "detalharPrecosNoPdf" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "tokenPdf" SET DEFAULT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');

