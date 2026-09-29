-- Senha temporária (troca obrigatória no primeiro acesso) e marca de ambiente do banco.
-- Só adições: funciona também com a versão anterior do código (publicação sem queda).
ALTER TABLE "Usuario" ADD COLUMN     "senhaTemporaria" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "AmbienteDoBanco" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "nome" TEXT NOT NULL,
    "marcadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AmbienteDoBanco_pkey" PRIMARY KEY ("id")
);

