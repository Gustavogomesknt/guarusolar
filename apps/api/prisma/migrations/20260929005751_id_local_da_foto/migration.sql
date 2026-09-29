-- AlterTable
ALTER TABLE "FotoServico" ADD COLUMN     "idLocal" TEXT;

-- AlterTable
ALTER TABLE "Orcamento" ALTER COLUMN "tokenPdf" SET DEFAULT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');

-- CreateIndex
CREATE UNIQUE INDEX "FotoServico_idLocal_key" ON "FotoServico"("idLocal");

