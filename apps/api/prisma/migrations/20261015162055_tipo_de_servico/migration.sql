-- Tipo de serviço VENDIDO no orçamento (instalação fotovoltaica, carregador veicular, manutenção...),
-- para o painel separar os números. Não é a ETAPA do agendamento (enum TipoServico).
-- Só adições: o campo é opcional no banco e os orçamentos e projetos existentes ficam sem tipo
-- ("Sem tipo" na tela, para o cliente classificar depois). A API o exige nos orçamentos novos.

-- CreateTable
CREATE TABLE "TipoDeServico" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TipoDeServico_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TipoDeServico_nome_key" ON "TipoDeServico"("nome");

-- CreateIndex
CREATE INDEX "TipoDeServico_ativo_ordem_idx" ON "TipoDeServico"("ativo", "ordem");

-- AlterTable
ALTER TABLE "Orcamento" ADD COLUMN     "tipoDeServicoId" TEXT;

-- AlterTable
ALTER TABLE "Projeto" ADD COLUMN     "tipoDeServicoId" TEXT;

-- CreateIndex
CREATE INDEX "Orcamento_tipoDeServicoId_idx" ON "Orcamento"("tipoDeServicoId");

-- CreateIndex
CREATE INDEX "Projeto_tipoDeServicoId_idx" ON "Projeto"("tipoDeServicoId");

-- AddForeignKey
ALTER TABLE "Orcamento" ADD CONSTRAINT "Orcamento_tipoDeServicoId_fkey" FOREIGN KEY ("tipoDeServicoId") REFERENCES "TipoDeServico"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Projeto" ADD CONSTRAINT "Projeto_tipoDeServicoId_fkey" FOREIGN KEY ("tipoDeServicoId") REFERENCES "TipoDeServico"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Tipos iniciais, para o escritório ajustar depois (nome, ordem, ativo) na tela "Tipos de serviço".
-- ON CONFLICT: rodar de novo num banco que já os tenha não duplica nem altera nada.
INSERT INTO "TipoDeServico" ("id", "nome", "ordem", "editadoEm") VALUES
    (gen_random_uuid()::text, 'Instalação de sistema fotovoltaico', 1, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'Instalação de carregador veicular', 2, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'Manutenção de sistema fotovoltaico', 3, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'Manutenção de carregador veicular', 4, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'Reparo / corretiva', 5, CURRENT_TIMESTAMP)
ON CONFLICT ("nome") DO NOTHING;
