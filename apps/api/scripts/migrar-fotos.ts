/*
 * Leva as fotos já enviadas para o destino atual (STORAGE_PROVIDER), sem perder nenhuma.
 * Feito para a troca do Supabase Storage (provisório) pelo SharePoint do cliente, mas vale
 * entre quaisquer destinos (disco, supabase, sharepoint).
 *
 *   npm run fotos:migrar                         só mostra o que seria migrado (não grava nada)
 *   npm run fotos:migrar -- --executar           copia para o destino atual e troca a chave no banco
 *   npm run fotos:migrar -- --executar --apagar-origem   e apaga a cópia antiga, já conferida
 *
 * Para cada foto cuja chave é de outro destino: lê o arquivo de onde está, grava no destino atual
 * (com os mesmos nomes e pastas de uma foto nova), LÊ DE VOLTA para conferir o tamanho e só então
 * troca a chave no banco. Uma foto por vez: se parar no meio, é só rodar de novo (as já migradas
 * não entram mais na lista). Sem --apagar-origem, a cópia antiga fica onde está, intocada.
 *
 * Os dois destinos precisam estar configurados na mesma janela: as variáveis do antigo (para ler)
 * e as do novo (para gravar). Fotos refeitas ("substituídas") não têm registro no banco e não são
 * migradas: continuam no armazenamento antigo.
 */
import 'dotenv/config';
import path from 'node:path';
import { apagarArquivo, destinoAtual, destinoDaChave, lerArquivo, salvarFoto } from '../src/lib/armazenamento';
import { bancoDeProducao } from '../src/lib/ambienteDoBanco';
import { prisma } from '../src/lib/prisma';

async function main() {
  const argumentos = process.argv.slice(2);
  const executar = argumentos.includes('--executar');
  const apagarOrigem = argumentos.includes('--apagar-origem');
  const para = destinoAtual();

  const fotos = await prisma.fotoServico.findMany({
    orderBy: { criadoEm: 'asc' },
    select: {
      id: true,
      chave: true,
      arquivoChave: true,
      arquivoNome: true,
      capturadaEm: true,
      criadoEm: true,
      agendamento: {
        select: { id: true, dataInicio: true, tipo: true, projeto: { select: { codigo: true, cliente: { select: { nome: true, cidade: true } } } } },
      },
    },
  });
  const aMigrar = fotos.filter((f) => destinoDaChave(f.arquivoChave) !== para);
  const porOrigem = new Map<string, number>();
  for (const f of fotos) porOrigem.set(destinoDaChave(f.arquivoChave), (porOrigem.get(destinoDaChave(f.arquivoChave)) ?? 0) + 1);

  console.log(`\nMigração de fotos — banco de ${(await bancoDeProducao(prisma)) ? 'PRODUÇÃO' : 'desenvolvimento'}`);
  console.log(`Destino atual (STORAGE_PROVIDER): ${para}`);
  console.log(`Fotos no banco: ${fotos.length} (${[...porOrigem].map(([d, n]) => `${n} em ${d}`).join(', ') || 'nenhuma'})`);
  console.log(`A migrar para ${para}: ${aMigrar.length}`);
  if (aMigrar.length === 0) return;
  if (!executar) {
    console.log('\nNada foi feito. Para migrar: npm run fotos:migrar -- --executar');
    console.log('(acrescente --apagar-origem para apagar a cópia antiga de cada foto depois de conferida)');
    return;
  }

  const checklist = await prisma.checklistFoto.findMany({ select: { tipoServico: true, chave: true, ordem: true, rotulo: true } });
  let migradas = 0;
  let falhas = 0;
  let naoApagadas = 0;
  for (const [i, foto] of aMigrar.entries()) {
    const onde = `${i + 1}/${aMigrar.length} ${foto.agendamento.projeto.codigo} ${foto.arquivoNome}`;
    try {
      const original = await lerArquivo(foto.arquivoChave);
      const doChecklist = foto.chave ? checklist.find((c) => c.tipoServico === foto.agendamento.tipo && c.chave === foto.chave) : null;
      const nova = await salvarFoto(original.dados, {
        cliente: foto.agendamento.projeto.cliente,
        projetoCodigo: foto.agendamento.projeto.codigo,
        servico: { id: foto.agendamento.id, dataInicio: foto.agendamento.dataInicio, tipo: foto.agendamento.tipo },
        item: doChecklist ? { ordem: doChecklist.ordem, rotulo: doChecklist.rotulo } : null,
        capturadaEm: foto.capturadaEm ?? foto.criadoEm,
        extensao: path.extname(foto.arquivoNome) || path.extname(foto.arquivoChave) || '.jpg',
      });
      // só troca a chave depois de ler a cópia nova e ela ter o mesmo tamanho
      const conferida = await lerArquivo(nova.chave);
      if (conferida.dados.length !== original.dados.length) {
        throw new Error(`a cópia tem ${conferida.dados.length} bytes e o original, ${original.dados.length}`);
      }
      await prisma.fotoServico.update({ where: { id: foto.id }, data: { arquivoChave: nova.chave, arquivoNome: nova.nome } });
      migradas++;
      if (apagarOrigem) {
        await apagarArquivo(foto.arquivoChave).catch((erro) => {
          naoApagadas++;
          console.warn(`  ${onde}: migrada, mas a cópia antiga não foi apagada (${(erro as Error).message})`);
        });
      }
      if (migradas % 25 === 0) console.log(`  ${migradas} migradas…`);
    } catch (erro) {
      falhas++;
      console.error(`  FALHOU ${onde}: ${(erro as Error).message} (continua no destino antigo, nada mudou)`);
    }
  }

  console.log(`\nMigradas: ${migradas}. Falhas: ${falhas}.${apagarOrigem ? ` Cópias antigas não apagadas: ${naoApagadas}.` : ' As cópias antigas continuam no destino anterior.'}`);
  if (falhas) {
    console.log('Rode de novo para tentar as que falharam: as já migradas não entram mais.');
    process.exitCode = 1;
  }
}

main()
  .catch((erro) => {
    console.error(`Erro: ${(erro as Error).message}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
