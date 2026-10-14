/*
 * Leva as fotos já enviadas para o destino atual (STORAGE_PROVIDER), sem perder nenhuma.
 * Uso de agora: Supabase Storage -> Backblaze B2 (rode com STORAGE_PROVIDER=s3 e as S3_*). Vale
 * entre quaisquer destinos (disco, supabase, s3, sharepoint).
 *
 * DE BUCKET PARA BUCKET (Supabase -> S3) o caminho do arquivo é MANTIDO: a chave só troca de
 * prefixo ("sb:PRJ-…/01-….jpg" vira "s3:PRJ-…/01-….jpg"). As fotos refeitas ("substituidas/"),
 * que não têm registro no banco, vão junto, lidas da lista de objetos do Supabase. As miniaturas
 * não são copiadas: a API as refaz na primeira vez que cada foto for vista.
 *
 * PODE RODAR QUANTAS VEZES FOR PRECISO sem duplicar nada: foto já migrada tem a chave do destino
 * novo e sai da lista; a que parou no meio é gravada de novo no MESMO caminho (substitui);
 * substituída que já está no bucket S3 com o mesmo tamanho é pulada.
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
 * e as do novo (para gravar). Fora do caso Supabase -> S3, as fotos refeitas ("substituídas") não
 * são migradas: continuam no armazenamento antigo.
 *
 * No fim: quantas foram movidas, quantas falharam e quantas já estavam no destino.
 */
import 'dotenv/config';
import path from 'node:path';
import { apagarArquivo, copiarParaOBucketAtual, destinoAtual, destinoDaChave, lerArquivo, salvarFoto } from '../src/lib/armazenamento';
import { enviarAoS3, tamanhoNoS3 } from '../src/lib/s3';
import { apagarDoSupabase, baixarDoSupabase, bucketDasFotos, variaveisDoSupabaseFaltando } from '../src/lib/supabaseStorage';
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
  console.log(`A migrar para ${para}: ${aMigrar.length} (já estão em ${para}: ${fotos.length - aMigrar.length})`);

  // Supabase -> S3: as fotos refeitas ficam em ".../substituidas/..." e não têm registro no banco
  const substituidas =
    para === 's3' && variaveisDoSupabaseFaltando().length === 0
      ? await prisma
          .$queryRaw<{ name: string; bytes: bigint | number | null }[]>`select name, (metadata->>'size')::bigint as bytes from storage.objects where bucket_id = ${bucketDasFotos()} and name like '%/substituidas/%' order by name`
          .catch(() => [] as { name: string; bytes: bigint | number | null }[])
      : [];
  if (substituidas.length) console.log(`Fotos refeitas ("substituidas") no Supabase Storage, a conferir no destino: ${substituidas.length}`);

  if (aMigrar.length === 0 && substituidas.length === 0) {
    console.log('\nNada a migrar: movidas 0, falhas 0.');
    return;
  }
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
      // de bucket para bucket, o MESMO caminho (a chave só troca de prefixo); senão, como foto nova
      const nova =
        (await copiarParaOBucketAtual(foto.arquivoChave, original.dados, original.tipo)) ??
        (await salvarFoto(original.dados, {
          cliente: foto.agendamento.projeto.cliente,
          projetoCodigo: foto.agendamento.projeto.codigo,
          servico: { id: foto.agendamento.id, dataInicio: foto.agendamento.dataInicio, tipo: foto.agendamento.tipo },
          item: doChecklist ? { ordem: doChecklist.ordem, rotulo: doChecklist.rotulo } : null,
          capturadaEm: foto.capturadaEm ?? foto.criadoEm,
          extensao: path.extname(foto.arquivoNome) || path.extname(foto.arquivoChave) || '.jpg',
        }));
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

  // ---- fotos refeitas (Supabase -> S3): mesmo caminho; a que já está lá com o mesmo tamanho é pulada
  let refeitasMovidas = 0;
  let refeitasJaEstavam = 0;
  for (const s of substituidas) {
    try {
      const noDestino = await tamanhoNoS3(s.name);
      if (noDestino !== null && noDestino === Number(s.bytes ?? -1)) {
        refeitasJaEstavam++;
      } else {
        const dados = await baixarDoSupabase(s.name);
        await enviarAoS3(s.name, dados, 'image/jpeg');
        if ((await tamanhoNoS3(s.name)) !== dados.length) throw new Error('a cópia no destino não tem o tamanho do original');
        refeitasMovidas++;
      }
      if (apagarOrigem) {
        await apagarDoSupabase([s.name]).catch((erro) => {
          naoApagadas++;
          console.warn(`  ${s.name}: copiada, mas a cópia antiga não foi apagada (${(erro as Error).message})`);
        });
      }
    } catch (erro) {
      falhas++;
      console.error(`  FALHOU ${s.name}: ${(erro as Error).message} (continua no Supabase Storage, nada mudou)`);
    }
  }

  console.log(`\nRESULTADO: movidas ${migradas + refeitasMovidas}, falhas ${falhas}, já estavam no destino ${fotos.length - aMigrar.length + refeitasJaEstavam}.`);
  console.log(`  Fotos dos serviços: ${migradas} movidas de ${aMigrar.length}.`);
  if (substituidas.length) console.log(`  Fotos refeitas ("substituidas"): ${refeitasMovidas} movidas, ${refeitasJaEstavam} já estavam no destino.`);
  console.log(apagarOrigem ? `  Cópias antigas não apagadas: ${naoApagadas}.` : '  As cópias antigas continuam no destino anterior, intocadas.');
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
