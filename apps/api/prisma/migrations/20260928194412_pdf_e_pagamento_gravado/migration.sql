-- AlterTable
ALTER TABLE "Orcamento" ADD COLUMN     "resumoPagamento" TEXT,
ADD COLUMN     "tokenPdf" TEXT NOT NULL DEFAULT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
ADD COLUMN     "valorEntrada" DECIMAL(12,2),
ADD COLUMN     "valorParcela" DECIMAL(12,2);

-- CreateIndex
CREATE UNIQUE INDEX "Orcamento_tokenPdf_key" ON "Orcamento"("tokenPdf");

