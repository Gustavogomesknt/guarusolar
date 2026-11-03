-- Hora de início do agendamento (03/11/2026). Só adição: os já gravados ficam sem hora (nulo).
ALTER TABLE "Agendamento" ADD COLUMN "horaInicio" VARCHAR(5);
