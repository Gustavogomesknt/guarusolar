-- O tipo do serviço passa a decidir o efeito da validação, e nenhum caminho conclui o projeto
-- sozinho: a conclusão é uma ação do gestor ("Concluir projeto"), que pode ser desfeita ("Reabrir").
-- Só adições: funciona com a versão anterior do código durante a publicação.

-- Situação nova: instalação validada, aguardando o gestor concluir (antes de CONCLUIDO na ordem)
ALTER TYPE "StatusProjeto" ADD VALUE IF NOT EXISTS 'AGUARDANDO_CONCLUSAO' BEFORE 'CONCLUIDO';

-- Evento novo do histórico: projeto reaberto pelo gestor
ALTER TYPE "TipoEventoProjeto" ADD VALUE IF NOT EXISTS 'PROJETO_REABERTO';

-- Tipo de serviço novo. VISTORIA_CONCESSIONARIA continua existindo (registros antigos), mas não
-- é mais oferecida na agenda.
ALTER TYPE "TipoServico" ADD VALUE IF NOT EXISTS 'RETRABALHO';

-- O tipo já era obrigatório no agendamento; ganha INSTALACAO como padrão
ALTER TABLE "Agendamento" ALTER COLUMN "tipo" SET DEFAULT 'INSTALACAO';

-- Histórico: de qual situação para qual (o autor e a data o evento já tinha)
ALTER TABLE "EventoProjeto" ADD COLUMN     "statusAnterior" "StatusProjeto",
ADD COLUMN     "statusNovo" "StatusProjeto";

-- Projeto: quem concluiu e quando a visita técnica foi validada
ALTER TABLE "Projeto" ADD COLUMN     "concluidoPorId" TEXT,
ADD COLUMN     "visitaTecnicaConcluidaEm" TIMESTAMP(3);

ALTER TABLE "Projeto" ADD CONSTRAINT "Projeto_concluidoPorId_fkey" FOREIGN KEY ("concluidoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
