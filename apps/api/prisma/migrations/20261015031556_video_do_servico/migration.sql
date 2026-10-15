-- Vídeos dos serviços (opcionais, separados do roteiro de fotos). O arquivo vai do celular direto
-- para o bucket S3 por link assinado; esta tabela só recebe a linha depois de a API conferir que
-- ele chegou. Tabela nova: nada muda nos dados existentes.
-- CreateTable
CREATE TABLE "VideoServico" (
    "id" TEXT NOT NULL,
    "agendamentoId" TEXT NOT NULL,
    "arquivoChave" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "tamanhoBytes" INTEGER NOT NULL,
    "duracaoSegundos" INTEGER,
    "capaChave" TEXT,
    "gravadoEm" TIMESTAMP(3),
    "enviadoPorId" TEXT NOT NULL,
    "idLocal" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VideoServico_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VideoServico_idLocal_key" ON "VideoServico"("idLocal");

-- CreateIndex
CREATE INDEX "VideoServico_agendamentoId_idx" ON "VideoServico"("agendamentoId");

-- AddForeignKey
ALTER TABLE "VideoServico" ADD CONSTRAINT "VideoServico_agendamentoId_fkey" FOREIGN KEY ("agendamentoId") REFERENCES "Agendamento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoServico" ADD CONSTRAINT "VideoServico_enviadoPorId_fkey" FOREIGN KEY ("enviadoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

