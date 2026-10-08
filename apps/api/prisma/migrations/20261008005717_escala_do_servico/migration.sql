-- AlterTable
ALTER TABLE "Agendamento" ADD COLUMN     "enviadoPorId" TEXT;

-- CreateTable
CREATE TABLE "EscalaServico" (
    "id" TEXT NOT NULL,
    "agendamentoId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EscalaServico_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EscalaServico_usuarioId_idx" ON "EscalaServico"("usuarioId");

-- CreateIndex
CREATE UNIQUE INDEX "EscalaServico_agendamentoId_usuarioId_key" ON "EscalaServico"("agendamentoId", "usuarioId");

-- AddForeignKey
ALTER TABLE "EscalaServico" ADD CONSTRAINT "EscalaServico_agendamentoId_fkey" FOREIGN KEY ("agendamentoId") REFERENCES "Agendamento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EscalaServico" ADD CONSTRAINT "EscalaServico_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agendamento" ADD CONSTRAINT "Agendamento_enviadoPorId_fkey" FOREIGN KEY ("enviadoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Serviços que já existem: a escala nasce com os técnicos ativos da equipe do serviço (e o
-- técnico responsável, se havia). Ninguém perde nem ganha acesso na virada. Para serviços
-- antigos isto é a equipe de HOJE, não necessariamente quem foi na época (dado que não existia).
INSERT INTO "EscalaServico" ("id", "agendamentoId", "usuarioId")
SELECT gen_random_uuid()::text, a."id", u."id"
FROM "Agendamento" a
JOIN "Usuario" u ON u."equipeId" = a."equipeId" AND u."papel" = 'TECNICO' AND u."ativo"
ON CONFLICT ("agendamentoId", "usuarioId") DO NOTHING;

INSERT INTO "EscalaServico" ("id", "agendamentoId", "usuarioId")
SELECT gen_random_uuid()::text, a."id", a."tecnicoResponsavelId"
FROM "Agendamento" a
WHERE a."tecnicoResponsavelId" IS NOT NULL
ON CONFLICT ("agendamentoId", "usuarioId") DO NOTHING;

-- Quem enviou para validação: o histórico do projeto já guardava (último envio de cada serviço).
UPDATE "Agendamento" a
SET "enviadoPorId" = (
  SELECT e."usuarioId" FROM "EventoProjeto" e
  WHERE e."agendamentoId" = a."id" AND e."tipo" = 'SERVICO_ENVIADO' AND e."usuarioId" IS NOT NULL
  ORDER BY e."criadoEm" DESC LIMIT 1
)
WHERE a."enviadoEm" IS NOT NULL;
