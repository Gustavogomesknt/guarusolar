/*
 * npm run db:zerar-para-entrega -- --admin email@do.admin
 * npm run db:zerar-para-entrega -- --manter-usuarios
 *
 * Zera os DADOS DE TESTE para entregar o sistema à Guarusolar. Diferente do db:limpar, este
 * comando RODA EM PRODUÇÃO. Não tem volta: faça o Backup (Actions › Backup do banco) antes.
 *
 * APAGA: orçamentos (com itens, histórico de status, cópia do cliente e tokens de PDF), projetos,
 * histórico dos projetos, agendamentos, escala, fotos, materiais utilizados e TODOS os clientes.
 * Zera a numeração: o próximo orçamento sai GS-<ano>-0001 e o próximo projeto, PRJ-<ano>-0001.
 * Os ARQUIVOS das fotos também saem do armazenamento (senão ficariam na mesma pasta das fotos do
 * primeiro projeto real, que reusa o código PRJ-<ano>-0001).
 *
 * Usuários, em dois modos:
 *   --admin <e-mail>     remove TODOS os usuários menos esse ADMIN (limpeza completa);
 *   --manter-usuarios    não toca em usuário nenhum (para apagar um teste do fluxo depois de os
 *                        usuários reais já estarem cadastrados).
 *
 * MANTÉM sempre: o catálogo de produtos, as equipes, o checklist de fotos e a marca de produção.
 *
 * Proteções: mostra qual banco é e de onde vem a conexão; com --admin, recusa se esse ADMIN não
 * existir, não for ADMIN ou estiver desativado (para o sistema não ficar sem acesso); mostra
 * quantos registros saem e quem fica (e quem sai), por nome e e-mail; exige digitar uma frase em
 * maiúsculas que traz o nome do banco; apaga tudo numa transação e confere o resultado antes de
 * confirmar (qualquer diferença desfaz tudo). Se as fotos estão num armazenamento que esta janela
 * não alcança (faltam as variáveis), recusa antes de apagar qualquer coisa.
 */
// Sem `import` no topo de propósito: anota o que já existe no ambiente ANTES de o dotenv carregar o .env.
const daJanela = process.env.DATABASE_URL !== undefined;

async function main() {
  await import('dotenv/config');
  const { createInterface } = await import('node:readline/promises');
  const { PrismaClient } = await import('@prisma/client');
  const { bancoDeProducao } = await import('../src/lib/ambienteDoBanco');
  const { apagarArquivo, destinoDaChave } = await import('../src/lib/armazenamento');
  const { apagarDoSupabase, bucketDasFotos, conferirBucketPrivado, variaveisDoSupabaseFaltando } = await import('../src/lib/supabaseStorage');
  const { variaveisFaltando: variaveisDoSharepointFaltando } = await import('../src/lib/sharepoint');

  const argumentos = process.argv.slice(2);
  const posicao = argumentos.indexOf('--admin');
  const emailAdmin = (posicao >= 0 ? (argumentos[posicao + 1] ?? '') : '').trim().toLowerCase();
  const manterUsuarios = argumentos.includes('--manter-usuarios');
  if (manterUsuarios && posicao >= 0) {
    console.error('Use --admin OU --manter-usuarios, não os dois: com --manter-usuarios nenhum usuário é removido.');
    process.exitCode = 1;
    return;
  }
  if (!manterUsuarios && (!emailAdmin || !emailAdmin.includes('@'))) {
    console.error(
      'Use um dos dois:\n' +
        '  npm run db:zerar-para-entrega -- --manter-usuarios        apaga os dados de teste e NÃO toca nos usuários\n' +
        '  npm run db:zerar-para-entrega -- --admin email@do.admin   apaga também todos os usuários, menos esse ADMIN',
    );
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

    const usuarios = await prisma.usuario.findMany({ orderBy: [{ papel: 'asc' }, { nome: 'asc' }], select: { id: true, nome: true, email: true, papel: true, ativo: true } });
    // ---- com --admin, o ADMIN que fica: sem ele, ninguém mais entraria no sistema
    const admin = manterUsuarios ? null : usuarios.find((u) => u.email.toLowerCase() === emailAdmin);
    const recusar = (motivo: string) => {
      console.error(`\nRECUSADO: ${motivo}\nNada foi apagado. Usuários deste banco:`);
      for (const u of usuarios) console.error(`  ${u.papel.padEnd(9)} ${u.nome} <${u.email}>${u.ativo ? '' : ' (desativado)'}`);
      process.exitCode = 1;
    };
    if (!manterUsuarios) {
      if (!admin) return recusar(`não existe usuário com o e-mail ${emailAdmin} neste banco.`);
      if (admin.papel !== 'ADMIN') return recusar(`${admin.nome} <${admin.email}> é ${admin.papel}, não ADMIN.`);
      if (!admin.ativo) return recusar(`${admin.nome} <${admin.email}> está desativado: não conseguiria entrar.`);
    }
    const saem = admin ? usuarios.filter((u) => u.id !== admin.id) : [];
    const ficam = admin ? [admin] : usuarios;

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
    // ---- os arquivos das fotos: em qual armazenamento estão, e se esta janela alcança cada um
    const chavesDasFotos = (await prisma.fotoServico.findMany({ select: { arquivoChave: true } })).map((f) => f.arquivoChave);
    const codigosDosProjetos = (await prisma.projeto.findMany({ select: { codigo: true } })).map((p) => p.codigo);
    const noSupabase = chavesDasFotos.filter((c) => destinoDaChave(c) === 'supabase');
    const noSharepoint = chavesDasFotos.filter((c) => destinoDaChave(c) === 'sharepoint');
    const noDisco = chavesDasFotos.filter((c) => destinoDaChave(c) === 'disco');
    const semArquivos = argumentos.includes('--sem-arquivos');
    if (!semArquivos) {
      const falta: string[] = [];
      if (noSupabase.length && variaveisDoSupabaseFaltando().length) falta.push(`${noSupabase.length} foto(s) no Supabase Storage, e faltam nesta janela: ${variaveisDoSupabaseFaltando().join(', ')}`);
      if (noSharepoint.length && variaveisDoSharepointFaltando().length) falta.push(`${noSharepoint.length} foto(s) no SharePoint, e faltam nesta janela: ${variaveisDoSharepointFaltando().join(', ')}`);
      if (falta.length) {
        console.error(
          `\nRECUSADO: há arquivos de fotos que esta janela não consegue apagar.\n  ${falta.join('\n  ')}\n` +
            'Nada foi apagado. Defina essas variáveis na janela (as mesmas da hospedagem) e rode de novo.\n' +
            'Sem apagar os arquivos, as fotos de teste ficariam na pasta do primeiro projeto real (o código PRJ-<ano>-0001 é reusado).\n' +
            '(Para apagar só os registros e deixar os arquivos: acrescente --sem-arquivos.)',
        );
        process.exitCode = 1;
        return;
      }
      if (noSupabase.length) await conferirBucketPrivado(true); // prova que a chave e o bucket desta janela funcionam
    }
    // No Supabase sai a pasta inteira de cada projeto (com miniaturas e substituídas, que não têm registro)
    let objetosNoSupabase: string[] = [];
    if (!semArquivos && !variaveisDoSupabaseFaltando().length && codigosDosProjetos.length) {
      const filtros = codigosDosProjetos.flatMap((c) => [`${c}/%`, `miniaturas/${c}/%`]);
      const linhas = await prisma
        .$queryRaw<{ name: string }[]>`select name from storage.objects where bucket_id = ${bucketDasFotos()} and name like any(${filtros})`
        .catch(() => [] as { name: string }[]);
      objetosNoSupabase = [...new Set([...linhas.map((l) => l.name), ...noSupabase.map((c) => c.slice(3))])];
    }

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
    linha('fotos (registros)', fotos);
    if (semArquivos) {
      console.log('          os ARQUIVOS das fotos NÃO serão apagados (--sem-arquivos)');
    } else {
      if (objetosNoSupabase.length) linha('arquivos no Supabase Storage (fotos, miniaturas e substituídas dos projetos apagados)', objetosNoSupabase.length);
      if (noSharepoint.length) linha('arquivos no SharePoint', noSharepoint.length);
      if (noDisco.length) linha('arquivos no disco deste computador (se existirem aqui)', noDisco.length);
    }
    linha('materiais utilizados', materiais);
    linha('clientes (TODOS)', clientes);
    if (!manterUsuarios) linha('usuários', saem.length);
    console.log(
      `  Numeração: ${sequencias.length ? sequencias.map((s) => `${s.prefixo}-${s.ano} está em ${s.ultimo}`).join(', ') : 'ainda não usada'}` +
        ' -> o próximo orçamento sai GS-<ano>-0001 e o próximo projeto, PRJ-<ano>-0001.',
    );

    if (manterUsuarios) {
      console.log(`\nUSUÁRIOS: NENHUM será apagado (--manter-usuarios). Os ${ficam.length} continuam como estão:`);
      for (const u of ficam) console.log(`  ${u.papel.padEnd(9)} ${u.nome} <${u.email}>${u.ativo ? '' : ' (desativado)'}`);
    } else {
      console.log('\nUSUÁRIOS QUE SAEM:');
      if (saem.length === 0) console.log('  (nenhum)');
      for (const u of saem) console.log(`  ${u.papel.padEnd(9)} ${u.nome} <${u.email}>${u.ativo ? '' : ' (desativado)'}`);
      console.log('\nUSUÁRIO QUE FICA (o único):');
      for (const u of ficam) console.log(`  ${u.papel.padEnd(9)} ${u.nome} <${u.email}>`);
    }

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
          Usuários: admin ? (await tx.usuario.deleteMany({ where: { id: { not: admin.id } } })).count : 0,
          'Sequências de código': (await tx.sequenciaCodigo.deleteMany()).count,
        };
        // conferência dentro da transação: qualquer surpresa desfaz tudo
        const [restam, ficou, catalogo, equipesDepois, checklistDepois, marca] = await Promise.all([
          tx.usuario.count(),
          admin ? tx.usuario.findUnique({ where: { id: admin.id }, select: { papel: true, ativo: true } }) : null,
          tx.produto.count(),
          tx.equipe.count(),
          tx.checklistFoto.count(),
          bancoDeProducao(tx as unknown as InstanceType<typeof PrismaClient>),
        ]);
        if (admin && (restam !== 1 || ficou?.papel !== 'ADMIN' || !ficou.ativo)) throw new Error('o ADMIN indicado não ficou como único usuário ativo');
        if (!admin && restam !== usuarios.length) throw new Error(`a quantidade de usuários mudou (${usuarios.length} -> ${restam})`);
        if (catalogo !== produtos) throw new Error(`o catálogo mudou (${produtos} -> ${catalogo})`);
        if (equipesDepois !== equipes.length || checklistDepois !== checklist) throw new Error('equipes ou checklist mudaram');
        if (marca !== producao) throw new Error('a marca de produção mudou');
        return r;
      },
      { timeout: 60_000, maxWait: 15_000 },
    );

    console.log('\nPronto. Registros apagados:');
    console.table(apagados);
    console.log(
      `Ficaram: ${admin ? `1 usuário (${admin.nome} <${admin.email}>)` : `os ${usuarios.length} usuários, sem mudança`}, ` +
        `${produtos} itens no catálogo, ${equipes.length} equipes, ${checklist} itens de checklist.`,
    );
    if (admin) console.log('Quem estava com o sistema aberto com outro usuário é desconectado em até 1 minuto.');

    // ---- os arquivos das fotos, depois de o banco confirmar (se falhar aqui, os registros já saíram)
    if (!semArquivos) {
      const falhas: string[] = [];
      let apagados = 0;
      for (let i = 0; i < objetosNoSupabase.length; i += 100) {
        const lote = objetosNoSupabase.slice(i, i + 100);
        await apagarDoSupabase(lote).then(
          () => (apagados += lote.length),
          (erro) => falhas.push(`Supabase Storage: ${(erro as Error).message}`),
        );
      }
      for (const chave of [...noSharepoint, ...noDisco]) {
        await apagarArquivo(chave).then(
          () => apagados++,
          (erro) => {
            // arquivo do disco que não está neste computador não é falha: o disco do servidor já foi apagado
            if (destinoDaChave(chave) !== 'disco') falhas.push(`${chave}: ${(erro as Error).message}`);
          },
        );
      }
      if (objetosNoSupabase.length || noSharepoint.length || noDisco.length) console.log(`Arquivos de fotos apagados do armazenamento: ${apagados}.`);
      if (falhas.length) {
        console.log(`ATENÇÃO: ${falhas.length} arquivo(s) não foram apagados (os registros já saíram do banco). Apague as pastas dos projetos pelo painel do armazenamento:`);
        for (const f of falhas.slice(0, 5)) console.log(`  ${f}`);
        process.exitCode = 1;
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((erro) => {
  console.error('\nFALHOU e NADA foi apagado (a transação foi desfeita):', erro instanceof Error ? erro.message : erro);
  process.exitCode = 1;
});

export {};
