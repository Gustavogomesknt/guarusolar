import type { PrismaClient } from '@prisma/client';

/**
 * O banco se diz de produção? (tabela AmbienteDoBanco, gravada por npm run db:marcar-producao)
 *
 * A marca fica NO BANCO, não numa variável do computador: quem roda um script de
 * desenvolvimento (db:limpar, usuários de teste) com a URL de produção colada por engano no
 * terminal é barrado do mesmo jeito, mesmo sem NODE_ENV=production.
 */
export async function bancoDeProducao(prisma: PrismaClient): Promise<boolean> {
  const marca = await prisma.ambienteDoBanco.findUnique({ where: { id: 1 } });
  return marca?.nome === 'producao';
}

/** Para scripts que nunca rodam em produção: encerra com a explicação se for. */
export async function recusarEmProducao(prisma: PrismaClient, oQue: string) {
  if (process.env.NODE_ENV === 'production' || (await bancoDeProducao(prisma))) {
    console.error(`Recusado: este é o banco de PRODUÇÃO. ${oQue} só roda em bancos de desenvolvimento.`);
    await prisma.$disconnect();
    process.exit(1);
  }
}
