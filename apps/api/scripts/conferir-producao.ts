/*
 * npm run db:conferir-producao: termina com erro se o banco da DATABASE_URL NÃO tiver a marca
 * de produção. O workflow Publicar roda antes das migrations: segredo com a string do banco de
 * desenvolvimento por engano para aqui, sem tocar em nada. Não mostra o endereço do banco.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { bancoDeProducao } from '../src/lib/ambienteDoBanco';

async function main() {
  const prisma = new PrismaClient();
  try {
    if (await bancoDeProducao(prisma)) {
      console.log('Banco com a marca de produção.');
    } else {
      console.error('Este banco NÃO tem a marca de produção (npm run db:marcar-producao). A string de conexão é a do banco certo?');
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(`Não foi possível conferir o banco: ${(e as Error).message}`);
  process.exitCode = 1;
});
