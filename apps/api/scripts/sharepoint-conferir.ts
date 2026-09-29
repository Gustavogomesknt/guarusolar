/*
 * Confere a configuração do SharePoint antes de ligar em produção:
 *   npm run sharepoint:conferir
 * Usa as variáveis MS_* do .env (ou do ambiente). Passos: token do aplicativo, site e biblioteca,
 * envio de um arquivo de teste, leitura de volta e remoção. Diz em qual passo parou e por quê.
 */
import 'dotenv/config';
import {
  apagarDoSharepoint,
  avisoDeValidadeDoSegredo,
  baixarDoSharepoint,
  bibliotecaDasFotos,
  enviarAoSharepoint,
  variaveisFaltando,
} from '../src/lib/sharepoint';

/** Falha já explicada na tela: encerra a conferência sem repetir a mensagem. */
class ConferenciaInterrompida extends Error {}

// Sai com process.exitCode, não process.exit(): encerrar à força com uma conexão ainda
// fechando derruba o Node no Windows ("Assertion failed ... UV_HANDLE_CLOSING").
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
  console.log('Conferência do SharePoint (fotos dos serviços)\n');
  const faltando = variaveisFaltando();
  if (faltando.length) {
    console.error(`Faltam no .env: ${faltando.join(', ')}`);
    throw new ConferenciaInterrompida();
  }
  const aviso = avisoDeValidadeDoSegredo();
  if (aviso) console.warn(`Atenção: ${aviso}\n`);

  const { siteId, driveId } = await passo('site e biblioteca (credencial do aplicativo e permissão no site)', bibliotecaDasFotos);
  const conteudo = Buffer.from(`Teste do sistema Guarusolar em ${new Date().toISOString()}\n`);
  const id = await passo('envio de um arquivo de teste', () =>
    enviarAoSharepoint(['_Conferência do sistema', `teste ${Date.now()}.txt`], conteudo, 'text/plain'),
  );
  await passo('leitura de volta', async () => {
    const lido = await baixarDoSharepoint(id);
    if (!lido.equals(conteudo)) throw new Error('O arquivo lido não é igual ao enviado.');
  });
  await passo('remoção do arquivo de teste', () => apagarDoSharepoint(id));

  console.log(`\nTudo certo. Site ${siteId}, biblioteca ${driveId}.`);
  console.log('Para gravar as fotos novas no SharePoint: STORAGE_PROVIDER=sharepoint.');
}

main().catch((erro) => {
  if (!(erro instanceof ConferenciaInterrompida)) console.error(erro);
  process.exitCode = 1;
});
