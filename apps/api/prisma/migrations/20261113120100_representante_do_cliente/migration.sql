-- Dono do cliente cadastrado por um representante. Aditiva: os clientes que já existem ficam
-- NULOS (= clientes da casa), sem preenchimento.
ALTER TABLE "Cliente" ADD COLUMN "representanteId" TEXT;

CREATE INDEX "Cliente_representanteId_idx" ON "Cliente"("representanteId");

ALTER TABLE "Cliente" ADD CONSTRAINT "Cliente_representanteId_fkey" FOREIGN KEY ("representanteId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
