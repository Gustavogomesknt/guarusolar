/*
 * npm run db:zerar-para-entrega -- --admin email@do.admin
 *
 * Zera os DADOS DE TESTE para entregar o sistema à Guarusolar. Diferente do db:limpar, este
 * comando RODA EM PRODUÇÃO e também remove os usuários de teste. Não tem volta: faça o Backup
 * (Actions › Backup do banco) antes.
 *
 * APAGA: orçamentos (com itens, histórico de status, cópia do cliente e tokens de PDF), projetos,
 * histórico dos projetos, agendamentos, escala, fotos (os registros), materiais utilizados,
 * TODOS os clientes e TODOS os usuários menos o ADMIN indicado em --admin. Zera a numeração: o
 * próximo orçamento sai GS-<ano>-0001 e o próximo projeto, PRJ-<ano>-0001.
 *
 * MANTÉM: o catálogo de produtos, as equipes, o checklist de fotos e a marca de produção.
 *
 * Proteções: mostra qual banco é e de onde vem a conexão; recusa se o ADMIN indicado não existir,
 * não for ADMIN ou estiver desativado (para o sistema não ficar sem acesso); mostra quantos
 * registros saem e quem fica e quem sai, por nome e e-mail; exige digitar uma frase em maiúsculas
 * que traz o nome do banco; apaga tudo numa transação e confere o resultado antes de confirmar
 * (qualquer diferença desfaz tudo).
 *
 * Os ARQUIVOS das fotos (disco ou SharePoint) não são apagados por este comando.
 */
// Sem `import` no topo de propósito: anota o que já existe no ambiente ANTES de o dotenv carregar o .env.
const daJanela = process.env.DATABASE_URL !== undefined;

async function main() {
  await import('dotenv/config');
  const { createInterface } = await import('node:readline/promises');
  const { PrismaClient } = await import('@prisma/client');
  const { bancoDeProducao } = await import('../src/lib/ambienteDoBanco');

  const argumentos = process.argv.slice(2);
  const posicao = argumentos.indexOf('--admin');
  const emailAdmin = (posicao >= 0 ? (argumentos[posicao + 1] ?? '') : '').trim().toLowerCase();
  if (!emailAdmin || !emailAdmin.includes('@')) {
    console.error('Use: npm run db:zerar-para-entrega -- --admin email@do.admin\n(o e-mail do ADMIN que continua no sistema; todos os outros usuários são removidos)');
    process.exitCode = 1;
    return;
  }

  const prisma = new PrismaClient();
  try {
    const producao = await bancoDeProducao(prisma);
    const nomeDoBanco = producao ? 'PRODUCAO' : 'DESENVOLVIMENTO';
    const servidor = (() => {
      try {
        const h = new URL(process.env.DATABASE_URL ?? '').hostname;
        return /supabase/.test(h) ? 'Supabase' : h === 'localhost' || h === '127.0.0.1' ? 'local' : 'outro servidor';
      } catch {
        return 'não identificado';
      }
    })();

    console.log('\n==================================================================');
    console.log(` ZERAR OS DADOS DE TESTE — banco de ${producao ? 'PRODUÇÃO' : 'desenvolvimento'}`);
    console.log('==================================================================');
    console.log(`Conexão: ${daJanela ? 'variável desta JANELA' : 'arquivo apps/api/.env'} · servidor ${servidor}`);
    console.log(`Marca de produção no banco: ${producao ? 'SIM' : 'não'}`);

    // ---- o ADMIN que fica: sem ele, ninguém mais entraria no sistema
    const usuarios = await prisma.usuario.findMany({ orderBy: [{ papel: 'asc' }, { nome: 'asc' }], select: { id: true, nome: true, email: true, papel: true, ativo: true } });
    const admin = usuarios.find((u) => u.email.toLowerCase() === emailAdmin);
    const recusar = (motivo: string) => {
      console.error(`\nRECUSADO: ${motivo}\nNada foi apagado. Usuários deste banco:`);
      for (const u of usuarios) console.error(`  ${u.papel.padEnd(9)} ${u.nome} <${u.email}>${u.ativo ? '' : ' (desativado)'}`);
      process.exitCode = 1;
    };
    if (!admin) return recusar(`não existe usuário com o e-mail ${emailAdmin} neste banco.`);
    if (admin.papel !== 'ADMIN') return recusar(`${admin.nome} <${admin.email}> é ${admin.papel}, não ADMIN.`);
    if (!admin.ativo) return recusar(`${admin.nome} <${admin.email}> está desativado: não conseguiria entrar.`);
    const saem = usuarios.filter((u) => u.id !== admin.id);

    // ---- o que sai e o que fica
    const [orcamentos, itens, historico, projetos, eventos, agendamentos, escala, fotos, materiais, clientes, sequencias] = await Promise.all([
      prisma.orcamento.count(),
      prisma.itemOrcamento.count(),
      prisma.historicoStatus.count(),
      prisma.projeto.count(),
      prisma.eventoProjeto.count(),
      prisma.agendamento.count(),
      prisma.escalaServico.count(),
      prisma.fotoServico.count(),
      prisma.materialUtilizado.count(),
      prisma.cliente.count(),
      prisma.sequenciaCodigo.findMany({ orderBy: [{ prefixo: 'asc' }, { ano: 'asc' }] }),
    ]);
    const [produtos, produtosAtivos, equipes, checklist] = await Promise.all([
      prisma.produto.count(),
      prisma.produto.count({ where: { ativo: true } }),
      prisma.equipe.findMany({ orderBy: { nome: 'asc' }, select: { nome: true } }),
      prisma.checklistFoto.count(),
    ]);

    console.log('\nSERÁ APAGADO, sem possibilidade de recuperar:');
    const linha = (rotulo: string, n: number) => console.log(`  ${String(n).padStart(6)}  ${rotulo}`);
    linha('orçamentos (com a cópia do cliente e o link do PDF de cada um)', orcamentos);
    linha('itens de orçamento', itens);
    linha('registros de histórico de status', historico);
    linha('projetos', projetos);
    linha('registros de histórico dos projetos', eventos);
    linha('agendamentos', agendamentos);
    linha('escalas (quem ia em cada serviço)', escala);
    linha('fotos (os registros; os arquivos não são apagados)', fotos);
    linha('materiais utilizados', materiais);
    linha('clientes (TODOS)', clientes);
    linha('usuários', saem.length);
    console.log(
      `  Numeração: ${sequencias.length ? sequencias.map((s) => `${s.prefixo}-${s.ano} está em ${s.ultimo}`).join(', ') : 'ainda não usada'}` +
        ' -> o próximo orçamento sai GS-<ano>-0001 e o próximo projeto, PRJ-<ano>-0001.',
    );

    console.log('\nUSUÁRIOS QUE SAEM:');
    if (saem.length === 0) console.log('  (nenhum)');
    for (const u of saem) console.log(`  ${u.papel.padEnd(9)} ${u.nome} <${u.email}>${u.ativo ? '' : ' (desativado)'}`);
    console.log('\nUSUÁRIO QUE FICA (o único):');
    console.log(`  ${admin.papel.padEnd(9)} ${admin.nome} <${admin.email}>`);

    console.log('\nFICA COMO ESTÁ:');
    console.log(`  catálogo: ${produtos} itens (${produtosAtivos} ativos, ${produtos - produtosAtivos} desativados)`);
    console.log(`  equipes: ${equipes.map((e) => e.nome).join(', ') || '(nenhuma)'}`);
    console.log(`  checklist de fotos: ${checklist} itens`);
    console.log(`  marca de produção: ${producao ? 'continua' : 'este banco não tem'}`);

    const frase = `ZERAR ${nomeDoBanco}`;
    const terminal = createInterface({ input: process.stdin, output: process.stdout });
    const resposta = await terminal.question(`\nPara apagar, digite exatamente ${frase} (em maiúsculas) e tecle Enter: `).catch(() => '');
    terminal.close();
    if (resposta.trim() !== frase) {
      console.log('Cancelado: nada foi apagado.');
      return;
    }

    // ---- tudo numa transação, na ordem das dependências; confere antes de confirmar
    const apagados = await prisma.$transaction(
      async (tx) => {
        const r = {
          'Itens de orçamento': (await tx.itemOrcamento.deleteMany()).count,
          'Histórico de status': (await tx.historicoStatus.deleteMany()).count,
          'Materiais utilizados': (await tx.materialUtilizado.deleteMany()).count,
          Fotos: (await tx.fotoServico.deleteMany()).count,
          'Histórico dos projetos': (await tx.eventoProjeto.deleteMany()).count,
          Escalas: (await tx.escalaServico.deleteMany()).count,
          Agendamentos: (await tx.agendamento.deleteMany()).count,
          Projetos: (await tx.projeto.deleteMany()).count,
          Orçamentos: (await tx.orcamento.deleteMany()).count,
          Clientes: (await tx.cliente.deleteMany()).count,
          Usuários: (await tx.usuario.deleteMany({ where: { id: { not: admin.id } } })).count,
          'Sequências de código': (await tx.sequenciaCodigo.deleteMany()).count,
        };
        // conferência dentro da transação: qualquer surpresa desfaz tudo
        const [restam, ficou, catalogo, equipesDepois, checklistDepois, marca] = await Promise.all([
          tx.usuario.count(),
          tx.usuario.findUnique({ where: { id: admin.id }, select: { papel: true, ativo: true } }),
          tx.produto.count(),
          tx.equipe.count(),
          tx.checklistFoto.count(),
          bancoDeProducao(tx as unknown as InstanceType<typeof PrismaClient>),
        ]);
        if (restam !== 1 || ficou?.papel !== 'ADMIN' || !ficou.ativo) throw new Error('o ADMIN indicado não ficou como único usuário ativo');
        if (catalogo !== produtos) throw new Error(`o catálogo mudou (${produtos} -> ${catalogo})`);
        if (equipesDepois !== equipes.length || checklistDepois !== checklist) throw new Error('equipes ou checklist mudaram');
        if (marca !== producao) throw new Error('a marca de produção mudou');
        return r;
      },
      { timeout: 60_000, maxWait: 15_000 },
    );

    console.log('\nPronto. Registros apagados:');
    console.table(apagados);
    console.log(`Ficaram: 1 usuário (${admin.nome} <${admin.email}>), ${produtos} itens no catálogo, ${equipes.length} equipes, ${checklist} itens de checklist.`);
    console.log('Quem estava com o sistema aberto com outro usuário é desconectado em até 1 minuto.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((erro) => {
  console.error('\nFALHOU e NADA foi apagado (a transação foi desfeita):', erro instanceof Error ? erro.message : erro);
  process.exitCode = 1;
});

export {};
