import 'dotenv/config';
import { createInterface } from 'node:readline/promises';
import { PrismaClient } from '@prisma/client';

/*
 * Limpa os dados de operação para começar os cadastros reais: `npm run db:limpar`.
 *
 * APAGA (de verdade, sem volta): itens de orçamento, histórico de status, materiais
 * utilizados, fotos, agendamentos, projetos, orçamentos e clientes; e zera a numeração
 * dos códigos (o próximo orçamento volta a ser GS-<ano>-0001 e o projeto PRJ-<ano>-0001).
 *
 * MANTÉM: usuários, equipes, checklist de fotos e produtos do catálogo.
 *
 * Proteções: recusa com NODE_ENV=production e só roda se alguém digitar LIMPAR.
 * Arquivos de fotos já enviados (pasta de armazenamento) não são apagados por este script.
 */

const PALAVRA = 'LIMPAR';

async function main() {
  if (process.env.NODE_ENV === 'production') {
    console.error('Recusado: NODE_ENV=production. Este script nunca roda em produção.');
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    // mostra onde vai apagar, sem expor usuário e senha da conexão
    const url = process.env.DATABASE_URL ?? '';
    const servidor = (() => {
      try {
        return new URL(url).hostname;
      } catch {
        return '(não identificado)';
      }
    })();

    const [clientes, orcamentos, projetos, agendamentos] = await Promise.all([
      prisma.cliente.count(),
      prisma.orcamento.count(),
      prisma.projeto.count(),
      prisma.agendamento.count(),
    ]);

    console.log('\nLIMPEZA DOS DADOS DE OPERAÇÃO — Guarusolar');
    console.log(`Banco: ${servidor}`);
    console.log(
      `Serão apagados, sem possibilidade de recuperar: ${clientes} clientes, ${orcamentos} orçamentos, ` +
        `${projetos} projetos e ${agendamentos} agendamentos (com itens, histórico, fotos e materiais).`,
    );
    console.log('A numeração dos códigos recomeça em GS-<ano>-0001 e PRJ-<ano>-0001.');
    console.log('Usuários, equipes, checklist de fotos e catálogo de produtos ficam como estão.\n');

    const terminal = createInterface({ input: process.stdin, output: process.stdout });
    const resposta = await terminal.question(`Para confirmar, digite ${PALAVRA} e tecle Enter: `).catch(() => '');
    terminal.close();
    if (resposta.trim() !== PALAVRA) {
      console.log('Cancelado: nada foi apagado.');
      return;
    }

    // tudo numa transação, na ordem das dependências: ou apaga tudo, ou nada
    const [itens, historico, materiais, fotos, agend, proj, orc, cli, sequencias] = await prisma.$transaction([
      prisma.itemOrcamento.deleteMany(),
      prisma.historicoStatus.deleteMany(),
      prisma.materialUtilizado.deleteMany(),
      prisma.fotoServico.deleteMany(),
      prisma.agendamento.deleteMany(),
      prisma.projeto.deleteMany(),
      prisma.orcamento.deleteMany(),
      prisma.cliente.deleteMany(),
      prisma.sequenciaCodigo.deleteMany(),
    ]);

    console.log('\nPronto. Registros apagados:');
    console.table({
      'Itens de orçamento': itens.count,
      'Histórico de status': historico.count,
      'Materiais utilizados': materiais.count,
      Fotos: fotos.count,
      Agendamentos: agend.count,
      Projetos: proj.count,
      Orçamentos: orc.count,
      Clientes: cli.count,
      'Sequências de código': sequencias.count,
    });
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((erro) => {
  console.error('A limpeza falhou e nada foi apagado:', erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
