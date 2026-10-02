ALTER TABLE "Orcamento" ADD COLUMN     "idCriacao" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Orcamento_idCriacao_key" ON "Orcamento"("idCriacao");

