/*
 * Confere o Supabase Storage antes de ligar em produção:
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

async function main() {
  console.log('Conferência do Supabase Storage (fotos dos serviços, provisório)\n');
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
    if (uso) {
      const mb = (b: number) => (b / 1024 / 1024).toFixed(1);
      console.log(
        `  ${mb(uso.usadoBytes)} MB de ${mb(uso.limiteBytes)} MB (${(uso.fracao * 100).toFixed(1)}%), ${uso.arquivos} arquivo(s). ` +
          `A API avisa em ${FRACAO_DE_AVISO * 100}% e recusa fotos novas em ${FRACAO_DE_RECUSA * 100}%.`,
      );
    } else {
      console.log(
        '  ATENÇÃO: não deu para medir. A DATABASE_URL desta janela precisa ser a do MESMO projeto do Supabase onde está o bucket.\n' +
          '  Sem a medição, a API não avisa nem recusa quando o espaço acabar.',
      );
    }
  } finally {
    await passo('remoção do arquivo de teste', () => apagarDoSupabase([caminho]));
  }

  console.log('\nTudo certo. Para usar: STORAGE_PROVIDER=supabase (com as três variáveis SUPABASE_*).');
  console.log('O app dos técnicos libera sozinho em produção com esse provedor configurado.');
}

main()
  .catch((erro) => {
    if (!(erro instanceof ConferenciaInterrompida)) console.error(`Erro: ${(erro as Error).message}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
