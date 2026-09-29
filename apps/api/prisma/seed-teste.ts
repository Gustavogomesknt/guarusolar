import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { recusarEmProducao } from '../src/lib/ambienteDoBanco';

/*
 * Usuários de TESTE, com a senha pública guarusolar123 (está no README). Só em
 * desenvolvimento: recusa em banco marcado como produção e com NODE_ENV=production.
 * Rode depois do seed-base (a equipe do técnico precisa existir). npm run db:seed faz os dois.
 */

const prisma = new PrismaClient();

async function main() {
  await recusarEmProducao(prisma, 'A criação dos usuários de teste');

  const senhaHash = await bcrypt.hash('guarusolar123', 10);
  const usuarios = [
    { nome: 'Administrador', email: 'admin@guarusolar.com.br', papel: 'ADMIN' as const },
    { nome: 'Vendedor', email: 'comercial@guarusolar.com.br', papel: 'COMERCIAL' as const },
    { nome: 'Gestor de obras', email: 'gestor@guarusolar.com.br', papel: 'GESTOR' as const },
    { nome: 'Técnico Equipe A', email: 'tecnico.a@guarusolar.com.br', papel: 'TECNICO' as const, equipeId: 'Equipe A' },
  ];
  for (const u of usuarios) {
    await prisma.usuario.upsert({ where: { email: u.email }, update: {}, create: { ...u, senhaHash } });
  }
  console.log('Usuários de teste prontos. Senha de todos: guarusolar123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
