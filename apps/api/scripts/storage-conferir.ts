/*
 * Relatório do espaço das fotos (só LEITURA; precisa só da DATABASE_URL do projeto do Supabase):
 *   npm run storage:relatorio
 * Total ocupado, número de fotos, tamanho médio, o que entrou em cada mês e quantos meses
 * faltam para o teto (SUPABASE_STORAGE_LIMITE_MB) no ritmo atual. No fim, uma CONTA APROXIMADA
 * do egress do mês (o outro teto do plano gratuito): o número exato só existe no painel.
 *
 * Confere o Supabase Storage antes de ligar em produção (e mostra o relatório no fim):
 *   npm run storage:conferir
 * Usa SUPABASE_URL, SUPABASE_SERVICE_KEY e SUPABASE_BUCKET do ambiente (ou do .env). Passos:
 * bucket existe e é PRIVADO, envio de um arquivo de teste, leitura de volta, prova de que ele
 * NÃO abre sem login, medição do espaço e remoção. Diz em qual passo parou e por quê.
 *
 * Também responde, na prática, se o Storage funciona com a Data API do projeto desativada: se
 * todos os passos derem ok, funciona.
 */
import 'dotenv/config';
import sharp from 'sharp';
import {
  abreSemLogin,
  apagarDoSupabase,
  baixarDoSupabase,
  bucketDasFotos,
  conferirBucketPrivado,
  enviarAoSupabase,
  FRACAO_DE_AVISO,
  FRACAO_DE_RECUSA,
  ABERTURAS_DA_FOTO_INTEIRA,
  ABERTURAS_DA_MINIATURA,
  egressEstimado,
  relatorioDoStorage,
  usoDoStorage,
  variaveisDoSupabaseFaltando,
} from '../src/lib/supabaseStorage';
import { prisma } from '../src/lib/prisma';

/** Falha já explicada na tela: encerra a conferência sem repetir a mensagem. */
class ConferenciaInterrompida extends Error {}

async function passo<T>(descricao: string, fazer: () => Promise<T>): Promise<T> {
  process.stdout.write(`- ${descricao}… `);
  try {
    const resultado = await fazer();
    console.log('ok');
    return resultado;
  } catch (erro) {
    console.log('FALHOU');
    console.error(`\n  ${(erro as Error).message}\n`);
    throw new ConferenciaInterrompida();
  }
}

const mb = (b: number) => (b / 1024 / 1024).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const kb = (b: number) => Math.round(b / 1024).toLocaleString('pt-BR');
const inteiro = (n: number) => n.toLocaleString('pt-BR');

/** Só leitura: quanto o Storage ocupa, como cresce e quando chega ao teto. */
async function relatorio() {
  const r = await relatorioDoStorage();
  if (!r) {
    console.log(
      'Não deu para medir: a tabela storage.objects não existe neste banco.\n' +
        'A DATABASE_URL desta janela precisa ser a do MESMO projeto do Supabase onde está o bucket.',
    );
    return false;
  }
  console.log(`Relatório do espaço das fotos (Supabase Storage), teto de ${inteiro(r.limiteBytes / 1024 / 1024)} MB (SUPABASE_STORAGE_LIMITE_MB${process.env.SUPABASE_STORAGE_LIMITE_MB ? '' : ' não definida: usando o padrão'})\n`);
  console.log(`  Total ocupado     ${mb(r.usadoBytes)} MB  (${(r.fracao * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% do teto), ${inteiro(r.arquivos)} arquivo(s)`);
  console.log(`  Fotos             ${inteiro(r.fotos.arquivos)}, ${mb(r.fotos.bytes)} MB; tamanho médio ${kb(r.fotos.mediaBytes)} KB`);
  console.log(`  Miniaturas        ${inteiro(r.miniaturas.arquivos)}, ${mb(r.miniaturas.bytes)} MB`);
  console.log(`  Fotos refeitas    ${inteiro(r.substituidas.arquivos)}, ${mb(r.substituidas.bytes)} MB (versões anteriores, guardadas)`);
  console.log(`  Livre até o teto  ${mb(Math.max(0, r.limiteBytes - r.usadoBytes))} MB; a API avisa em ${FRACAO_DE_AVISO * 100}% e recusa fotos novas em ${FRACAO_DE_RECUSA * 100}%`);

  console.log('\n  Crescimento por mês (o que entrou em cada mês):');
  if (r.porMes.length === 0) console.log('    nenhum arquivo ainda');
  for (const m of r.porMes) {
    const [ano, mes] = m.mes.split('-');
    console.log(`    ${mes}/${ano}   ${mb(m.bytes).padStart(8)} MB   ${inteiro(m.arquivos).padStart(6)} arquivo(s)`);
  }

  console.log('');
  if (r.ritmoMensalBytes === null || r.mesesAteOTeto === null) {
    console.log('  Ritmo atual: nada entrou nos últimos 90 dias; sem ritmo não há previsão.');
  } else {
    const dias = Math.round(r.diasMedidos);
    console.log(`  Ritmo atual       ${mb(r.ritmoMensalBytes)} MB por mês (medido nos últimos ${dias} dia${dias === 1 ? '' : 's'})`);
    const meses = r.mesesAteOTeto;
    const ate95 = Math.max(0, r.limiteBytes * FRACAO_DE_RECUSA - r.usadoBytes) / r.ritmoMensalBytes;
    const escrito = (n: number) => (n >= 120 ? 'mais de 10 anos' : n >= 24 ? `cerca de ${Math.round(n / 12)} anos` : `cerca de ${n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} ${n < 1.05 && n > 0.95 ? 'mês' : 'meses'}`);
    console.log(`  Faltam            ${escrito(meses)} para o teto; ${escrito(ate95)} para a API começar a recusar fotos (${FRACAO_DE_RECUSA * 100}%)`);
    if (dias < 30) console.log('                    (menos de 30 dias de dados: a previsão ainda oscila muito)');
  }

  // Egress: não há como medir daqui (o sistema não registra cada abertura de foto e o Supabase
  // não expõe o egress no banco). Sai a conta aproximada, com as hipóteses à vista.
  const e = egressEstimado(r);
  console.log('\n  Egress do mês (o que SAI do Supabase: cada vez que alguém abre uma foto). ESTIMATIVA, não medição:');
  console.log(
    `    ${inteiro(r.fotosDoMes.arquivos)} foto(s) entraram neste mês × (${ABERTURAS_DA_FOTO_INTEIRA} aberturas da foto inteira de ${kb(e.mediaDaFoto)} KB + ` +
      `${ABERTURAS_DA_MINIATURA} da miniatura de ${kb(e.mediaDaMiniatura)} KB)`,
  );
  console.log(`    = cerca de ${mb(e.bytes)} MB, ${(e.fracao * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% dos ${inteiro(e.limiteBytes / 1024 / 1024)} MB por mês do plano`);
  console.log('    Não entram na conta: fotos de meses anteriores reabertas e o tráfego do banco, que usa o mesmo limite.');
  console.log('    O número exato está no painel do Supabase, em Settings → Usage.');
  return true;
}

async function main() {
  if (process.argv.includes('--relatorio')) {
    if (!(await relatorio())) throw new ConferenciaInterrompida();
    return;
  }
  console.log('Conferência do Supabase Storage (fotos dos serviços)\n');
  const faltando = variaveisDoSupabaseFaltando();
  if (faltando.length) {
    console.error(`Faltam no ambiente (ou no .env): ${faltando.join(', ')}`);
    throw new ConferenciaInterrompida();
  }
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(process.env.SUPABASE_URL!.trim()) && !/^http:\/\/(localhost|127\.0\.0\.1)/.test(process.env.SUPABASE_URL!.trim())) {
    console.warn('  Atenção: SUPABASE_URL costuma ser https://<id-do-projeto>.supabase.co (sem /storage no fim).\n');
  }

  await passo(`bucket "${bucketDasFotos()}" existe e é PRIVADO`, () => conferirBucketPrivado(true));

  const caminho = `_conferencia/teste-${Date.now()}.jpg`;
  const original = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#1257A6' } }).jpeg().toBuffer();
  await passo('envio de um arquivo de teste', () => enviarAoSupabase(caminho, original, 'image/jpeg'));
  try {
    await passo('leitura do arquivo pela API (com a chave de serviço)', async () => {
      const lido = await baixarDoSupabase(caminho);
      if (!lido.equals(original)) throw new Error('o arquivo lido é diferente do enviado');
    });
    await passo('o arquivo NÃO abre sem login (link público recusado)', async () => {
      if (await abreSemLogin(caminho)) {
        throw new Error('o arquivo abriu pelo link público do Storage: o bucket está exposto. Desligue "Public bucket" no painel.');
      }
    });
    const uso = await passo('medição do espaço usado (tabela storage.objects do banco)', () => usoDoStorage(true));
    if (!uso) {
      console.log(
        '  ATENÇÃO: não deu para medir. A DATABASE_URL desta janela precisa ser a do MESMO projeto do Supabase onde está o bucket.\n' +
          '  Sem a medição, a API não avisa nem recusa quando o espaço acabar.',
      );
    }
  } finally {
    await passo('remoção do arquivo de teste', () => apagarDoSupabase([caminho]));
  }

  console.log('');
  await relatorio();
  console.log('\nTudo certo. Para usar: STORAGE_PROVIDER=supabase (com as três variáveis SUPABASE_*).');
  console.log('O app dos técnicos libera sozinho em produção com esse provedor configurado.');
}

main()
  .catch((erro) => {
    if (!(erro instanceof ConferenciaInterrompida)) console.error(`Erro: ${(erro as Error).message}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
