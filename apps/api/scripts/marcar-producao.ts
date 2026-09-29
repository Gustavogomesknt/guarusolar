/*
 * Marca o banco da DATABASE_URL como PRODUÇÃO (npm run db:marcar-producao). Rode uma vez, no
 * banco novo de produção, logo depois das migrations. A partir daí db:limpar e os usuários de
 * teste se recusam a rodar nele, de qualquer computador.
 */
import 'dotenv/config';
import { createInterface } from 'node:readline/promises';
import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  try {
    const servidor = (() => {
      try {
        return new URL(process.env.DATABASE_URL ?? '').hostname;
      } catch {
        return '(não identificado)';
      }
    })();
    const [usuarios, clientes] = await Promise.all([prisma.usuario.count(), prisma.cliente.count()]);
    console.log(`Banco em ${servidor}: ${usuarios} usuários, ${clientes} clientes.`);
    const pergunta = createInterface({ input: process.stdin, output: process.stdout });
    const resposta = await pergunta.question('Marcar ESTE banco como PRODUÇÃO? Digite PRODUCAO para confirmar: ');
    pergunta.close();
    if (resposta.trim() !== 'PRODUCAO') {
      console.log('Nada foi feito.');
      return;
    }
    await prisma.ambienteDoBanco.upsert({ where: { id: 1 }, update: { nome: 'producao' }, create: { id: 1, nome: 'producao' } });
    console.log('Marcado como produção. db:limpar e os usuários de teste passam a recusar este banco.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
