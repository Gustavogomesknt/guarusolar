-- Laudo AVULSO (12/11/2026): sem projeto, direto no cliente, como a visita técnica. A restrição
-- (escrita à mão em 20261015224909_visita_tecnica_avulsa; o Prisma não descreve CHECK) passa a
-- aceitar VISITA_TECNICA ou LAUDO sem projeto. Fica só mais permissiva: tudo o que já existe e o
-- código anterior continuam valendo. Exatamente um entre projeto e cliente, como antes.
ALTER TABLE "Agendamento" DROP CONSTRAINT "Agendamento_projeto_ou_cliente";
ALTER TABLE "Agendamento" ADD CONSTRAINT "Agendamento_projeto_ou_cliente" CHECK (
  ("projetoId" IS NOT NULL AND "clienteId" IS NULL)
  OR ("projetoId" IS NULL AND "clienteId" IS NOT NULL AND "tipo" IN ('VISITA_TECNICA', 'LAUDO'))
);
