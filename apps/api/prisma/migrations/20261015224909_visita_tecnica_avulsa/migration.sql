-- Visita técnica AVULSA (pré-venda): o agendamento passa a ligar-se a um projeto OU a um cliente.
-- Só adições: projetoId fica opcional (os registros existentes continuam com projeto) e entram
-- o cliente da visita avulsa e o "dispensar" da lista de visitas aguardando orçamento.

-- AlterTable
ALTER TABLE "Agendamento" ADD COLUMN     "clienteId" TEXT,
ADD COLUMN     "dispensadaEm" TIMESTAMP(3),
ADD COLUMN     "dispensadaPorId" TEXT,
ALTER COLUMN "projetoId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "Agendamento_clienteId_idx" ON "Agendamento"("clienteId");

-- AddForeignKey
ALTER TABLE "Agendamento" ADD CONSTRAINT "Agendamento_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agendamento" ADD CONSTRAINT "Agendamento_dispensadaPorId_fkey" FOREIGN KEY ("dispensadaPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Escrita à mão (o Prisma não descreve CHECK): exatamente um entre projeto e cliente, e só a
-- visita técnica pode ser avulsa. Todo registro existente tem projeto e nenhum cliente: passa.
ALTER TABLE "Agendamento" ADD CONSTRAINT "Agendamento_projeto_ou_cliente" CHECK (
  ("projetoId" IS NOT NULL AND "clienteId" IS NULL)
  OR ("projetoId" IS NULL AND "clienteId" IS NOT NULL AND "tipo" = 'VISITA_TECNICA')
);
