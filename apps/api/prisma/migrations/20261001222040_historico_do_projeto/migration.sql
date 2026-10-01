-- CreateEnum
CREATE TYPE "TipoEventoProjeto" AS ENUM ('PROJETO_CRIADO', 'SERVICO_AGENDADO', 'SERVICO_REMARCADO', 'SERVICO_INICIADO', 'SERVICO_ENVIADO', 'SERVICO_DEVOLVIDO', 'SERVICO_APROVADO', 'SERVICO_CANCELADO', 'PROJETO_EDITADO', 'PROJETO_CONCLUIDO', 'PROJETO_CANCELADO');


ALTER TABLE "Projeto" ADD COLUMN     "canceladoEm" TIMESTAMP(3),
ADD COLUMN     "motivoCancelamento" TEXT;

-- CreateTable
CREATE TABLE "EventoProjeto" (
    "id" TEXT NOT NULL,
    "projetoId" TEXT NOT NULL,
    "agendamentoId" TEXT,
    "tipo" "TipoEventoProjeto" NOT NULL,
    "descricao" TEXT NOT NULL,
    "usuarioId" TEXT,
    "reconstruido" BOOLEAN NOT NULL DEFAULT false,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventoProjeto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EventoProjeto_projetoId_criadoEm_idx" ON "EventoProjeto"("projetoId", "criadoEm");

-- AddForeignKey
ALTER TABLE "EventoProjeto" ADD CONSTRAINT "EventoProjeto_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "Projeto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventoProjeto" ADD CONSTRAINT "EventoProjeto_agendamentoId_fkey" FOREIGN KEY ("agendamentoId") REFERENCES "Agendamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventoProjeto" ADD CONSTRAINT "EventoProjeto_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------------------------
-- Reconstrução do histórico a partir das datas que já existiam. Tudo marcado como reconstruído.
-- Remarcações, devoluções anteriores à última e quem agendou não eram registrados: o texto diz
-- o que é aproximado. Horários em UTC no banco; a tela mostra no fuso da empresa.
-- ---------------------------------------------------------------------------------------------

-- 1. projeto criado (aprovação do orçamento), com quem aprovou
INSERT INTO "EventoProjeto" ("id", "projetoId", "tipo", "descricao", "usuarioId", "reconstruido", "criadoEm")
SELECT gen_random_uuid()::text, p."id", 'PROJETO_CRIADO',
       'Orçamento ' || o."codigo" || ' aprovado: projeto criado',
       (SELECT h."usuarioId" FROM "HistoricoStatus" h
         WHERE h."orcamentoId" = o."id" AND h."para" = 'APROVADO' ORDER BY h."criadoEm" DESC LIMIT 1),
       true, p."criadoEm"
FROM "Projeto" p JOIN "Orcamento" o ON o."id" = p."orcamentoId";

-- rótulo e período de cada serviço, para os textos abaixo
CREATE TEMP TABLE servico_texto AS
SELECT a."id", a."projetoId",
       CASE a."tipo" WHEN 'INSTALACAO' THEN 'Instalação' WHEN 'VISITA_TECNICA' THEN 'Visita técnica'
                     WHEN 'MANUTENCAO' THEN 'Manutenção' ELSE 'Vistoria da concessionária' END AS rotulo,
       CASE WHEN a."dataInicio" = a."dataFim" THEN to_char(a."dataInicio", 'DD/MM')
            ELSE to_char(a."dataInicio", 'DD/MM') || ' a ' || to_char(a."dataFim", 'DD/MM') END AS periodo,
       e."nome" AS equipe
FROM "Agendamento" a JOIN "Equipe" e ON e."id" = a."equipeId";

-- 2. serviço agendado (com as datas e a equipe de HOJE: remarcações antigas não foram guardadas)
INSERT INTO "EventoProjeto" ("id", "projetoId", "agendamentoId", "tipo", "descricao", "reconstruido", "criadoEm")
SELECT gen_random_uuid()::text, a."projetoId", a."id", 'SERVICO_AGENDADO',
       t.rotulo || ' agendada para ' || t.periodo || ' · ' || t.equipe || ' (datas atuais; remarcações anteriores não foram registradas)',
       true, a."criadoEm"
FROM "Agendamento" a JOIN servico_texto t ON t."id" = a."id";

-- 3. início: a primeira foto enviada, por quem enviou
INSERT INTO "EventoProjeto" ("id", "projetoId", "agendamentoId", "tipo", "descricao", "usuarioId", "reconstruido", "criadoEm")
SELECT gen_random_uuid()::text, a."projetoId", a."id", 'SERVICO_INICIADO',
       t.rotulo || ' em execução: primeira foto enviada', f."enviadaPorId", true, f."criadoEm"
FROM "Agendamento" a
JOIN servico_texto t ON t."id" = a."id"
JOIN LATERAL (SELECT * FROM "FotoServico" x WHERE x."agendamentoId" = a."id" ORDER BY x."criadoEm" LIMIT 1) f ON true;

-- 4. devolução que ficou para trás: o serviço foi reenviado depois (o motivo se perdeu)
INSERT INTO "EventoProjeto" ("id", "projetoId", "agendamentoId", "tipo", "descricao", "usuarioId", "reconstruido", "criadoEm")
SELECT gen_random_uuid()::text, a."projetoId", a."id", 'SERVICO_DEVOLVIDO',
       t.rotulo || ' devolvida ao técnico (o motivo não era registrado)', a."validadoPorId", true, a."validadoEm"
FROM "Agendamento" a JOIN servico_texto t ON t."id" = a."id"
WHERE a."status" = 'AGUARDANDO_VALIDACAO' AND a."validadoEm" IS NOT NULL AND a."enviadoEm" > a."validadoEm";

-- 5. envio para validação (o último; envios anteriores foram sobrescritos)
INSERT INTO "EventoProjeto" ("id", "projetoId", "agendamentoId", "tipo", "descricao", "reconstruido", "criadoEm")
SELECT gen_random_uuid()::text, a."projetoId", a."id", 'SERVICO_ENVIADO',
       t.rotulo || ' enviada para validação' ||
         CASE WHEN a."sistemaTestado" THEN ' com o teste do sistema confirmado' ELSE '' END,
       true, a."enviadoEm"
FROM "Agendamento" a JOIN servico_texto t ON t."id" = a."id"
WHERE a."enviadoEm" IS NOT NULL;

-- 6. resultado da validação, por quem validou
INSERT INTO "EventoProjeto" ("id", "projetoId", "agendamentoId", "tipo", "descricao", "usuarioId", "reconstruido", "criadoEm")
SELECT gen_random_uuid()::text, a."projetoId", a."id",
       CASE a."status" WHEN 'APROVADO' THEN 'SERVICO_APROVADO'::"TipoEventoProjeto" ELSE 'SERVICO_DEVOLVIDO'::"TipoEventoProjeto" END,
       CASE a."status" WHEN 'APROVADO' THEN t.rotulo || ' aprovada na validação'
            ELSE t.rotulo || ' devolvida ao técnico: ' || coalesce(a."motivoDevolucao", 'motivo não informado') END,
       a."validadoPorId", true, a."validadoEm"
FROM "Agendamento" a JOIN servico_texto t ON t."id" = a."id"
WHERE a."validadoEm" IS NOT NULL AND a."status" IN ('APROVADO', 'DEVOLVIDO');

-- 7. serviço cancelado (data aproximada: a última alteração do serviço)
INSERT INTO "EventoProjeto" ("id", "projetoId", "agendamentoId", "tipo", "descricao", "reconstruido", "criadoEm")
SELECT gen_random_uuid()::text, a."projetoId", a."id", 'SERVICO_CANCELADO',
       t.rotulo || ' de ' || t.periodo || ' cancelada (data aproximada)', true, a."editadoEm"
FROM "Agendamento" a JOIN servico_texto t ON t."id" = a."id"
WHERE a."status" = 'CANCELADO';

-- 8. projeto concluído
INSERT INTO "EventoProjeto" ("id", "projetoId", "tipo", "descricao", "reconstruido", "criadoEm")
SELECT gen_random_uuid()::text, p."id", 'PROJETO_CONCLUIDO', 'Projeto concluído', true, p."concluidoEm"
FROM "Projeto" p WHERE p."concluidoEm" IS NOT NULL;

DROP TABLE servico_texto;
