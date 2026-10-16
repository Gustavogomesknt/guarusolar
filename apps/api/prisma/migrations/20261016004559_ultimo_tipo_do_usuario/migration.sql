-- AlterTable
ALTER TABLE "Usuario" ADD COLUMN     "ultimoTipoDeServicoId" TEXT;

-- AddForeignKey
ALTER TABLE "Usuario" ADD CONSTRAINT "Usuario_ultimoTipoDeServicoId_fkey" FOREIGN KEY ("ultimoTipoDeServicoId") REFERENCES "TipoDeServico"("id") ON DELETE SET NULL ON UPDATE CASCADE;

