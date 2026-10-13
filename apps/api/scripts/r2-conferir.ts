/*
 * Confere o Cloudflare R2 antes de ligar em produção:
 *   npm run r2:conferir
 * Usa R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY e R2_BUCKET do ambiente (ou do .env).
 * Passos: as chaves e o bucket funcionam, envio de um arquivo de teste, leitura de volta, o
 * arquivo NÃO abre sem assinatura, um link assinado abre e deixa de abrir quando expira, mover
 * (como numa foto refeita), medição do espaço e remoção. Diz em qual passo parou e por quê.
 * Não grava nada no banco e não toca em foto nenhuma: tudo acontece na pasta "_conferencia/".
 *
 * O relatório do espaço é outro comando: npm run storage:relatorio (com STORAGE_PROVIDER=r2).
 */
import 'dotenv/config';
import sharp from 'sharp';
import {
  abreSemAssinatura,
  apagarDoR2,
  baixarDoR2,
  bucketDoR2,
  conferirBucketDoR2,
  enviarAoR2,
  limiteDoR2Bytes,
  linkAssinadoDoR2,
  moverNoR2,
  tamanhoNoR2,
  usoDoR2,
  variaveisDoR2Faltando,
} from '../src/lib/r2';

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
  console.log('Conferência do Cloudflare R2 (fotos dos serviços)\n');
  const faltando = variaveisDoR2Faltando();
  if (faltando.length) {
    console.error(`Faltam no ambiente (ou no .env): ${faltando.join(', ')}`);
    throw new ConferenciaInterrompida();
  }
  if (!process.env.R2_ENDPOINT && !/^[0-9a-f]{32}$/i.test(process.env.R2_ACCOUNT_ID!.trim())) {
    console.warn('  Atenção: R2_ACCOUNT_ID costuma ter 32 letras e números (só o ID da conta, não o endereço inteiro).\n');
  }

  await passo(`as chaves funcionam e o bucket "${bucketDoR2()}" existe`, () => conferirBucketDoR2());

  const caminho = `_conferencia/teste-${Date.now()}.jpg`;
  const movido = `_conferencia/substituidas/teste-${Date.now()}.jpg`;
  const original = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#1257A6' } }).jpeg().toBuffer();
  await passo('envio de um arquivo de teste', () => enviarAoR2(caminho, original, 'image/jpeg'));
  try {
    await passo('leitura do arquivo pela API (pedido assinado)', async () => {
      const lido = await baixarDoR2(caminho);
      if (!lido.equals(original)) throw new Error('o arquivo lido é diferente do enviado');
      if ((await tamanhoNoR2(caminho)) !== original.length) throw new Error('o tamanho informado pelo R2 é diferente do enviado');
    });
    await passo('o arquivo NÃO abre sem assinatura', async () => {
      if (await abreSemAssinatura(caminho)) throw new Error('o arquivo abriu sem assinatura: o bucket está exposto.');
    });
    await passo('link assinado abre, e deixa de abrir depois de expirar (2 segundos)', async () => {
      const link = linkAssinadoDoR2(caminho, 2);
      const agora = await fetch(link);
      if (!agora.ok) throw new Error(`o link assinado não abriu (${agora.status})`);
      if (!Buffer.from(await agora.arrayBuffer()).equals(original)) throw new Error('o link assinado devolveu outro arquivo');
      await new Promise((r) => setTimeout(r, 4000));
      const depois = await fetch(link);
      if (depois.ok) throw new Error('o link assinado continuou abrindo depois de expirar');
    });
    await passo('mover dentro do bucket (o que acontece com uma foto refeita)', async () => {
      await moverNoR2(caminho, movido);
      if ((await tamanhoNoR2(caminho)) !== null) throw new Error('o original continuou no lugar');
      if ((await tamanhoNoR2(movido)) !== original.length) throw new Error('a cópia movida não tem o tamanho do original');
    });
    const uso = await passo('medição do espaço usado (listagem do bucket)', () => usoDoR2(true));
    if (uso) {
      console.log(
        `  ${(uso.usadoBytes / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB em ${uso.arquivos.toLocaleString('pt-BR')} arquivo(s), ` +
          `${(uso.fracao * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% do teto de ${(limiteDoR2Bytes() / 1024 / 1024).toLocaleString('pt-BR')} MB ` +
          `(R2_STORAGE_LIMITE_MB${process.env.R2_STORAGE_LIMITE_MB ? '' : ' não definida: usando o padrão'})`,
      );
    } else {
      console.log('  ATENÇÃO: não deu para medir. Sem a medição, a API não avisa nem recusa quando o espaço acabar.');
    }
  } finally {
    await passo('remoção dos arquivos de teste', () => apagarDoR2([caminho, movido]));
  }

  console.log('\nTudo certo. Para usar: STORAGE_PROVIDER=r2 (com as quatro variáveis R2_*).');
  console.log('Confira no painel da Cloudflare que o bucket está SEM "Public Development URL" e sem domínio público:');
  console.log('isso não aparece pela API e deixaria as fotos abertas a quem tivesse o endereço.');
}

main().catch((erro) => {
  if (!(erro instanceof ConferenciaInterrompida)) console.error(`Erro: ${(erro as Error).message}`);
  process.exitCode = 1;
});
