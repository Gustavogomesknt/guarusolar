import 'dotenv/config';
import './lib/zod-pt'; // mensagens de validação em português; antes de qualquer rota
import { artesQueFaltam, linhaDeCondicoesQuePassa } from './lib/pdf-proposta-nova';
import { conferirArmazenamentoAoIniciar } from './lib/armazenamento';
import { prisma } from './lib/prisma';
import { sincronizarRoteiroDeFotos } from './lib/roteiroDeFotos';
import { bancoDeProducao } from './lib/ambienteDoBanco';
import { criarApp } from './app';

// Armazenamento mal configurado NÃO impede a API de subir: ela sobe em modo degradado (não recebe
// fotos) e grita no log. Único motivo para não subir: faltar o JWT_SECRET (lib/auth.ts).
conferirArmazenamentoAoIniciar(() => bancoDeProducao(prisma));

const app = criarApp();

const porta = Number(process.env.PORT ?? 3333);
app.listen(porta, () => console.log(`API da Guarusolar rodando em http://localhost:${porta}`));
{
  // artes do modelo novo que faltam em apps/api/assets/proposta/: só avisa (nada é bloqueado)
  const faltando = artesQueFaltam();
  if (faltando.length > 0) {
    console.warn(`[proposta] Faltam ${faltando.length} arte(s) do modelo novo em apps/api/assets/proposta/: ${faltando.join(', ')}. O PDF sai sem elas (cartão sem foto, logo pulada, lugar reservado da arte).`);
  }
  // linha de condições da página 2 (conteudo/proposta.ts, PAGINA_2_NOVA.contempla): só avisa
  const longa = linhaDeCondicoesQuePassa();
  if (longa) {
    console.warn(`[proposta] A linha de condições da página 2 passa de uma linha: ${longa.larguraPt} pt de ${longa.limitePt} (${longa.passaPt} pt a mais), no caso mais largo: "${longa.texto}". O PDF sai certo, mas em duas linhas o arranjo da página 2 muda em parte dos orçamentos. Encurte em PAGINA_2_NOVA.contempla (condicoes e taxaRepassada).`);
  }
}

// O roteiro de fotos de cada tipo de serviço é editado no código (compartilhado/roteiroDoServico.ts):
// ao subir, a tabela ChecklistFoto é acertada por ele. Sem travar a subida.
sincronizarRoteiroDeFotos(prisma)
  .then((mudancas) => mudancas && console.log(`[roteiro] checklist de fotos atualizado pelo código: ${mudancas} item(ns).`))
  .catch((erro) => console.error(`[roteiro] não foi possível atualizar o checklist de fotos: ${(erro as Error).message.split('\n').pop()}`));

// Produção ligada num banco sem a marca de produção = string de conexão errada (ex.: a de
// desenvolvimento). Não derruba a API, mas grita no log; o /saude mostra producao: false.
if (process.env.NODE_ENV === 'production') {
  bancoDeProducao(prisma)
    .then((marcado) => {
      if (!marcado) console.error('[banco] ATENÇÃO: NODE_ENV=production, mas o banco NÃO tem a marca de produção. Confira DATABASE_URL.');
    })
    .catch(() => {});
}
