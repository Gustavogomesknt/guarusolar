/*
 * CONFERÊNCIA DAS ROTAS (roda no `npm run build`, depois do tsc; o equivalente, para rotas, do
 * conferencia-enums.ts). Monta o app de verdade (criarApp, sem abrir porta e sem banco), lista
 * TODAS as rotas e, para cada uma, calcula pelo autenticar/autorizar se o REPRESENTANTE a alcança.
 * O build QUEBRA quando:
 * - uma rota não tem linha em ISOLAMENTO_DO_REPRESENTANTE (rota nova: alguém tem de decidir como
 *   ela se isola do representante);
 * - a tabela tem linha de rota que não existe mais;
 * - a tabela diz "não alcança" e o representante alcança (ou o contrário: diz que alcança e o
 *   autorizar não deixa);
 * - um roteador foi montado fora de MONTAGENS (não seria conferido).
 * Uso: node dist/lib/conferencia-rotas.js [--listar]
 */
import type { Router } from 'express';
import { ISOLAMENTO_DO_REPRESENTANTE } from './isolamentoDoRepresentante';

type Handler = ((...args: never[]) => unknown) & { papeisLiberados?: readonly string[] };
type Camada = {
  name: string;
  handle: Handler & { stack?: Camada[] };
  route?: { path: string; methods: Record<string, boolean>; stack: { handle: Handler }[] };
};

export type RotaListada = { chave: string; exigeLogin: boolean; papeis: string[] | 'todos'; representanteAlcanca: boolean };

const PAPEL = 'REPRESENTANTE';

function descrever(chave: string, handlers: Handler[], autenticar: Handler): RotaListada {
  const exigeLogin = handlers.includes(autenticar);
  const listas = handlers.filter((h) => Array.isArray(h.papeisLiberados)).map((h) => h.papeisLiberados as readonly string[]);
  // ADMIN passa em todo autorizar; os demais, só nos que os listam (todos os da rota)
  const papeis = listas.length === 0 ? ('todos' as const) : listas.reduce<string[]>((acc, l) => acc.filter((p) => l.includes(p)), [...listas[0]]);
  const representanteAlcanca = !exigeLogin || papeis === 'todos' || papeis.includes(PAPEL);
  return { chave, exigeLogin, papeis, representanteAlcanca };
}

function rotasDoRoteador(caminho: string, roteador: Router, autenticar: Handler, problemas: string[]): RotaListada[] {
  const rotas: RotaListada[] = [];
  const antes: Handler[] = []; // middlewares do router.use, valem para as rotas que vêm depois
  for (const camada of (roteador as unknown as { stack: Camada[] }).stack) {
    if (camada.route) {
      const handlers = [...antes, ...camada.route.stack.map((s) => s.handle)];
      for (const metodo of Object.keys(camada.route.methods)) {
        rotas.push(descrever(`${metodo.toUpperCase()} ${caminho}${camada.route.path}`, handlers, autenticar));
      }
    } else if (camada.name === 'router') {
      problemas.push(`roteador aninhado dentro de ${caminho}: a conferência não o percorre. Monte-o em MONTAGENS (app.ts).`);
    } else {
      antes.push(camada.handle);
    }
  }
  return rotas;
}

/** Todas as rotas do app, com quem as alcança (e os problemas de montagem). */
export async function listarRotas() {
  // o app só é montado, nunca sobe: um segredo qualquer basta para o lib/auth carregar
  process.env.JWT_SECRET ??= 'conferencia-das-rotas-sem-uso';
  const { criarApp, MONTAGENS } = await import('../app');
  const { autenticar } = await import('./auth');
  const app = criarApp() as unknown as { _router: { stack: Camada[] } };
  const problemas: string[] = [];
  const rotas: RotaListada[] = [];
  let roteadoresNoApp = 0;
  for (const camada of app._router.stack) {
    if (camada.route) {
      for (const metodo of Object.keys(camada.route.methods)) {
        rotas.push(descrever(`${metodo.toUpperCase()} ${camada.route.path}`, camada.route.stack.map((s) => s.handle), autenticar as Handler));
      }
    } else if (camada.name === 'router') {
      roteadoresNoApp++;
    }
  }
  if (roteadoresNoApp !== MONTAGENS.length) {
    problemas.push(`o app tem ${roteadoresNoApp} roteadores e MONTAGENS tem ${MONTAGENS.length}: todo roteador entra pela lista MONTAGENS (app.ts), senão escapa desta conferência.`);
  }
  for (const m of MONTAGENS) rotas.push(...rotasDoRoteador(m.caminho, m.roteador, autenticar as Handler, problemas));
  return { rotas, problemas };
}

/** Confere as rotas contra a tabela. Vazio = tudo certo. */
export async function conferirRotas() {
  const { rotas, problemas } = await listarRotas();
  const vistas = new Set<string>();
  for (const r of rotas) {
    if (vistas.has(r.chave)) problemas.push(`${r.chave}: aparece duas vezes (a segunda nunca responde).`);
    vistas.add(r.chave);
    const linha = ISOLAMENTO_DO_REPRESENTANTE[r.chave];
    if (!linha) {
      problemas.push(`${r.chave}: rota SEM LINHA em ISOLAMENTO_DO_REPRESENTANTE (lib/isolamentoDoRepresentante.ts). Diga como ela se isola do representante.`);
      continue;
    }
    // com login e sem autorizar = qualquer papel passa, até o técnico: só serve para dado próprio
    // (com os roteadores só com autenticar, esquecer o autorizar numa rota nova cai aqui)
    if (r.exigeLogin && r.papeis === 'todos' && linha.isolamento !== 'dado próprio') {
      problemas.push(`${r.chave}: rota com login e SEM autorizar (qualquer papel passa, até o técnico); só "dado próprio" pode ficar assim. Ponha o autorizar com os papéis.`);
    }
    const tabelaDizQueAlcanca = linha.isolamento !== 'não alcança';
    if (tabelaDizQueAlcanca !== r.representanteAlcanca) {
      problemas.push(
        r.representanteAlcanca
          ? `${r.chave}: a tabela diz "não alcança", mas o REPRESENTANTE passa (${r.exigeLogin ? `papéis: ${r.papeis === 'todos' ? 'qualquer logado' : r.papeis.join(', ')}` : 'rota sem login'}).`
          : `${r.chave}: a tabela diz "${linha.isolamento}", mas o autorizar não deixa o REPRESENTANTE passar.`,
      );
    }
  }
  for (const chave of Object.keys(ISOLAMENTO_DO_REPRESENTANTE)) {
    if (!vistas.has(chave)) problemas.push(`${chave}: linha na tabela de uma rota que não existe (apague a linha).`);
  }
  return { rotas, problemas };
}

// executado direto (build): falha com a lista do que falta
if (require.main === module) {
  conferirRotas()
    .then(({ rotas, problemas }) => {
      if (process.argv.includes('--listar')) {
        for (const r of rotas) {
          const quem = !r.exigeLogin ? 'sem login' : r.papeis === 'todos' ? 'qualquer logado' : `ADMIN, ${r.papeis.join(', ')}`;
          console.log(`${r.chave.padEnd(55)} ${(ISOLAMENTO_DO_REPRESENTANTE[r.chave]?.isolamento ?? '—').padEnd(22)} ${quem}`);
        }
      }
      const alcanca = rotas.filter((r) => r.representanteAlcanca).length;
      if (problemas.length > 0) {
        console.error(`\nConferência das rotas: ${problemas.length} problema(s) em ${rotas.length} rotas.\n- ${problemas.join('\n- ')}\n`);
        process.exit(1);
      }
      console.log(`Conferência das rotas: ${rotas.length} rotas, todas na tabela; o REPRESENTANTE alcança ${alcanca}.`);
      process.exit(0);
    })
    .catch((erro) => {
      console.error(`Conferência das rotas não rodou: ${(erro as Error).stack}`);
      process.exit(1);
    });
}
