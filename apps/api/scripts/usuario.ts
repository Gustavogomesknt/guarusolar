/*
 * Usuários reais (em produção não há usuários de teste):
 *
 *   npm run usuario -- criar --nome "Maria Souza" --email maria@guarusolar.com.br --papel COMERCIAL
 *   npm run usuario -- criar --nome "João" --email joao@guarusolar.com.br --papel TECNICO --equipe "Equipe A"
 *   npm run usuario -- nova-senha --email maria@guarusolar.com.br   (esqueceu a senha)
 *   npm run usuario -- desativar --email maria@guarusolar.com.br     (saiu da empresa)
 *   npm run usuario -- trocar-email --email errado@x.com --novo certo@guarusolar.com.br
 *   npm run usuario -- listar
 *
 * Mesmo efeito da tela Usuários (só ADMIN), que é o caminho normal; este comando é a alternativa.
 * A senha gerada aparece UMA vez, aqui no terminal: passe à pessoa por um canal seguro. Ela é
 * temporária: no primeiro acesso o sistema obriga a criar uma senha pessoal.
 */
import 'dotenv/config';
import { gerarSenhaTemporaria } from '../src/lib/senhaTemporaria';
import { PrismaClient, type Papel } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { bancoDeProducao } from '../src/lib/ambienteDoBanco';

const PAPEIS: Papel[] = ['ADMIN', 'COMERCIAL', 'GESTOR', 'TECNICO'];

const senhaTemporaria = gerarSenhaTemporaria;

function opcoes(argumentos: string[]) {
  const resultado: Record<string, string> = {};
  for (let i = 0; i < argumentos.length; i++) {
    if (argumentos[i].startsWith('--')) resultado[argumentos[i].slice(2)] = argumentos[i + 1] ?? '';
  }
  return resultado;
}

async function main() {
  const [comando, ...resto] = process.argv.slice(2);
  const o = opcoes(resto);
  const prisma = new PrismaClient();
  try {
    const onde = (await bancoDeProducao(prisma)) ? 'PRODUÇÃO' : 'desenvolvimento';
    console.log(`Banco: ${onde}\n`);

    if (comando === 'criar') {
      const email = o.email?.trim().toLowerCase();
      const papel = o.papel?.trim().toUpperCase() as Papel;
      if (!o.nome || !email || !PAPEIS.includes(papel)) {
        throw new Error(`Use: criar --nome "Nome" --email email --papel ${PAPEIS.join('|')} [--equipe "Equipe A"]`);
      }
      if (papel === 'TECNICO' && !o.equipe) throw new Error('Técnico precisa de --equipe (ex.: --equipe "Equipe A").');
      if (o.equipe && !(await prisma.equipe.findUnique({ where: { id: o.equipe } }))) {
        throw new Error(`A equipe "${o.equipe}" não existe. Equipes: ${(await prisma.equipe.findMany()).map((e) => e.id).join(', ')}`);
      }
      if (await prisma.usuario.findUnique({ where: { email } })) throw new Error(`Já existe usuário com ${email}. Para nova senha: nova-senha --email ${email}`);
      const senha = senhaTemporaria();
      await prisma.usuario.create({
        data: { nome: o.nome.trim(), email, papel, equipeId: o.equipe || null, senhaHash: await bcrypt.hash(senha, 10), senhaTemporaria: true },
      });
      console.log(`Criado: ${o.nome} <${email}> (${papel}${o.equipe ? `, ${o.equipe}` : ''})`);
      console.log(`Senha temporária: ${senha}\n(trocada pela pessoa no primeiro acesso)`);
    } else if (comando === 'nova-senha') {
      const email = o.email?.trim().toLowerCase();
      if (!email) throw new Error('Use: nova-senha --email email');
      const senha = senhaTemporaria();
      await prisma.usuario.update({ where: { email }, data: { senhaHash: await bcrypt.hash(senha, 10), senhaTemporaria: true, sessaoVersao: { increment: 1 } } });
      console.log(`Nova senha temporária de ${email}: ${senha}\n(trocada pela pessoa no próximo acesso)`);
    } else if (comando === 'trocar-email') {
      const email = o.email?.trim().toLowerCase();
      const novo = o.novo?.trim().toLowerCase();
      if (!email || !novo) throw new Error('Use: trocar-email --email atual --novo novo');
      if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(novo)) throw new Error(`"${novo}" não parece um e-mail.`);
      if (await prisma.usuario.findUnique({ where: { email: novo } })) throw new Error(`Já existe usuário com ${novo}.`);
      await prisma.usuario.update({ where: { email }, data: { email: novo } });
      console.log(`E-mail trocado: ${email} -> ${novo}. A senha continua a mesma.`);
    } else if (comando === 'desativar') {
      const email = o.email?.trim().toLowerCase();
      if (!email) throw new Error('Use: desativar --email email');
      await prisma.usuario.update({ where: { email }, data: { ativo: false, sessaoVersao: { increment: 1 } } });
      console.log(`${email} desativado: não entra mais (nada é apagado).`);
    } else if (comando === 'listar') {
      const usuarios = await prisma.usuario.findMany({ orderBy: [{ ativo: 'desc' }, { papel: 'asc' }, { nome: 'asc' }] });
      for (const u of usuarios) {
        console.log(`${u.ativo ? ' ' : 'x'} ${u.papel.padEnd(9)} ${u.nome} <${u.email}>${u.equipeId ? ` · ${u.equipeId}` : ''}${u.senhaTemporaria ? ' · senha temporária' : ''}`);
      }
    } else {
      console.log('Comandos: criar, nova-senha, trocar-email, desativar, listar (detalhes no topo de apps/api/scripts/usuario.ts)');
    }
  } catch (erro) {
    const mensagem = (erro as { code?: string }).code === 'P2025' ? 'Usuário não encontrado.' : (erro as Error).message;
    console.error(`Erro: ${mensagem}`);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void main();
