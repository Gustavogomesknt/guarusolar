/*
 * Confere o bucket compatível com S3 (Backblaze B2, Cloudflare R2...) antes de ligar em produção:
 *   npm run s3:conferir          (npm run r2:conferir é o nome antigo do mesmo comando)
 * Usa S3_ENDPOINT, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY e S3_BUCKET do ambiente (ou
 * do .env). Passos: a região bate com o endereço, as chaves e o bucket funcionam, envio de um
 * arquivo de teste, regravação no mesmo caminho (não duplica), leitura de volta, o
 * arquivo NÃO abre sem assinatura, um link assinado abre e deixa de abrir quando expira, mover
 * (como numa foto refeita), medição do espaço e remoção. Diz em qual passo parou e por quê.
 * Não grava nada no banco e não toca em foto nenhuma: tudo acontece na pasta "_conferencia/".
 *
 * O relatório do espaço é outro comando: npm run storage:relatorio (com STORAGE_PROVIDER=s3).
 */
import 'dotenv/config';
import sharp from 'sharp';
import {
  abreSemAssinatura,
  avisoDeRegiaoDoS3,
  apagarDoS3,
  baixarDoS3,
  bucketDoS3,
  conferirBucketDoS3,
  enviarAoS3,
  limiteDoS3Bytes,
  linkAssinadoDoS3,
  listarDoS3,
  moverNoS3,
  servicoDoS3,
  tamanhoNoS3,
  usoDoS3,
  variaveisDoS3Faltando,
} from '../src/lib/s3';

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
  console.log('Conferência do bucket das fotos dos serviços (API compatível com S3)\n');
  const faltando = variaveisDoS3Faltando();
  if (faltando.length) {
    console.error(`Faltam no ambiente (ou no .env): ${faltando.join(', ')}`);
    throw new ConferenciaInterrompida();
  }
  console.log(`Serviço: ${servicoDoS3()}\n`);

  // a região entra na assinatura: errada, nenhum pedido passa, mesmo com as chaves certas
  await passo('a região (S3_REGION) bate com o endereço (S3_ENDPOINT)', async () => {
    const aviso = avisoDeRegiaoDoS3();
    if (aviso) throw new Error(aviso);
  });
  await passo(`as chaves funcionam e o bucket "${bucketDoS3()}" existe`, () => conferirBucketDoS3());

  const caminho = `_conferencia/teste-${Date.now()}.jpg`;
  const movido = `_conferencia/substituidas/teste-${Date.now()}.jpg`;
  const original = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#1257A6' } }).jpeg().toBuffer();
  await passo('envio de um arquivo de teste', () => enviarAoS3(caminho, original, 'image/jpeg'));
  try {
    await passo('gravar de novo no mesmo caminho substitui, não duplica (a migração depende disso)', async () => {
      await enviarAoS3(caminho, original, 'image/jpeg');
      const iguais = (await listarDoS3(caminho)).filter((o) => o.caminho === caminho);
      if (iguais.length !== 1) throw new Error(`a listagem mostra ${iguais.length} arquivo(s) nesse caminho; era para ser 1`);
    });
    await passo('leitura do arquivo pela API (pedido assinado)', async () => {
      const lido = await baixarDoS3(caminho);
      if (!lido.equals(original)) throw new Error('o arquivo lido é diferente do enviado');
      if ((await tamanhoNoS3(caminho)) !== original.length) throw new Error('o tamanho informado pelo serviço é diferente do enviado');
    });
    await passo('o arquivo NÃO abre sem assinatura', async () => {
      if (await abreSemAssinatura(caminho)) throw new Error('o arquivo abriu sem assinatura: o bucket está exposto.');
    });
    await passo('link assinado abre, e deixa de abrir depois de expirar (2 segundos)', async () => {
      const link = linkAssinadoDoS3(caminho, 2);
      const agora = await fetch(link);
      if (!agora.ok) throw new Error(`o link assinado não abriu (${agora.status})`);
      if (!Buffer.from(await agora.arrayBuffer()).equals(original)) throw new Error('o link assinado devolveu outro arquivo');
      await new Promise((r) => setTimeout(r, 4000));
      const depois = await fetch(link);
      if (depois.ok) throw new Error('o link assinado continuou abrindo depois de expirar');
    });
    await passo('mover dentro do bucket (o que acontece com uma foto refeita)', async () => {
      await moverNoS3(caminho, movido);
      if ((await tamanhoNoS3(caminho)) !== null) throw new Error('o original continuou no lugar');
      if ((await tamanhoNoS3(movido)) !== original.length) throw new Error('a cópia movida não tem o tamanho do original');
    });
    const uso = await passo('medição do espaço usado (listagem do bucket)', () => usoDoS3(true));
    if (uso) {
      console.log(
        `  ${(uso.usadoBytes / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB em ${uso.arquivos.toLocaleString('pt-BR')} arquivo(s), ` +
          `${(uso.fracao * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% do teto de ${(limiteDoS3Bytes() / 1024 / 1024).toLocaleString('pt-BR')} MB ` +
          `(S3_STORAGE_LIMITE_MB${process.env.S3_STORAGE_LIMITE_MB || process.env.R2_STORAGE_LIMITE_MB ? '' : ' não definida: usando o padrão'})`,
      );
    } else {
      console.log('  ATENÇÃO: não deu para medir. Sem a medição, a API não avisa nem recusa quando o espaço acabar.');
    }
  } finally {
    await passo('remoção dos arquivos de teste', () => apagarDoS3([caminho, movido]));
  }

  console.log('\nTudo certo. Para usar: STORAGE_PROVIDER=s3 (com as cinco variáveis S3_*).');
  if (servicoDoS3() === 'Backblaze B2') {
    console.log('Confira no painel do Backblaze, no bucket: "Files in Bucket are: Private" e, em Lifecycle Settings,');
    console.log('"Keep only the last version of the file". Sem a segunda, arquivo regravado ou apagado continua');
    console.log('ocupando espaço como versão antiga, e o espaço ocupado fica acima do que a API mede.');
  } else {
    console.log('Confira no painel do serviço que o bucket é PRIVADO e sem endereço público (no R2: sem "Public');
    console.log('Development URL" e sem domínio): isso não aparece pela API e deixaria as fotos abertas.');
  }
}

main().catch((erro) => {
  if (!(erro instanceof ConferenciaInterrompida)) console.error(`Erro: ${(erro as Error).message}`);
  process.exitCode = 1;
});
