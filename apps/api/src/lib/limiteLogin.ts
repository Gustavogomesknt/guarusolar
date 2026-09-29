/*
 * Limite de tentativas de login (contra adivinhação de senha).
 *
 * POR E-MAIL — protege uma conta: a cada 5 falhas seguidas, bloqueio de 1 min, depois 5, 15 e
 * 60 min (e fica em 60). Login certo zera; o histórico some 24 h depois da última falha.
 * Vale igual para e-mail que existe e que não existe: o bloqueio não revela quem tem conta.
 *
 * POR ORIGEM (IP) — protege contra quem testa muitas contas: 30 falhas em 15 min bloqueiam o
 * IP por 5, depois 15 e 60 min. A folga é grande de propósito: técnicos na mesma rede (Wi-Fi
 * do escritório, rede do celular, que põe muitos aparelhos atrás do mesmo IP) erram a senha
 * de vez em quando e não podem travar uns aos outros.
 *
 * Em memória: um reinício da API zera os contadores (aceitável: o bloqueio só precisa valer
 * durante o ataque). Com mais de uma instância da API, mover para o banco ou um Redis.
 * O IP vem de req.ip: atrás de proxy, configure TRUST_PROXY (senão todos chegam com o IP do
 * proxy e o limite por origem valeria para a empresa inteira).
 */

const MINUTO = 60_000;

export const REGRAS = {
  email: { falhasPorBloqueio: 5, bloqueios: [1, 5, 15, 60].map((m) => m * MINUTO), esquecerApos: 24 * 60 * MINUTO },
  origem: { janela: 15 * MINUTO, falhasNaJanela: 30, bloqueios: [5, 15, 60].map((m) => m * MINUTO), esquecerApos: 24 * 60 * MINUTO },
} as const;

/** Teto de registros guardados (e-mails inventados por um atacante não enchem a memória). */
const MAXIMO_DE_REGISTROS = 50_000;

type RegistroEmail = { falhas: number; bloqueios: number; bloqueadoAte: number; ultimaFalha: number };
type RegistroOrigem = { falhas: number; inicioJanela: number; bloqueios: number; bloqueadoAte: number; ultimaFalha: number };

const porEmail = new Map<string, RegistroEmail>();
const porOrigem = new Map<string, RegistroOrigem>();

const normalizar = (email: string) => email.trim().toLowerCase().slice(0, 254);
const duracao = (lista: readonly number[], nivel: number) => lista[Math.min(nivel, lista.length) - 1];

function guardar<T>(mapa: Map<string, T>, chave: string, valor: T) {
  mapa.delete(chave); // reinsere no fim: o Map fica em ordem de uso
  mapa.set(chave, valor);
  if (mapa.size > MAXIMO_DE_REGISTROS) mapa.delete(mapa.keys().next().value!);
}

export type Bloqueio = { motivo: 'email' | 'origem'; segundos: number };

/** Está bloqueado agora? (Conferido antes da senha: um ataque não gasta bcrypt.) */
export function bloqueioAtual(email: string, origem: string, agora = Date.now()): Bloqueio | null {
  const e = porEmail.get(normalizar(email));
  if (e && e.bloqueadoAte > agora) return { motivo: 'email', segundos: Math.ceil((e.bloqueadoAte - agora) / 1000) };
  const o = porOrigem.get(origem);
  if (o && o.bloqueadoAte > agora) return { motivo: 'origem', segundos: Math.ceil((o.bloqueadoAte - agora) / 1000) };
  return null;
}

export type ResultadoDaFalha = { falhasDoEmail: number; falhasDaOrigem: number; bloqueou: Bloqueio | null };

export function registrarFalha(email: string, origem: string, agora = Date.now()): ResultadoDaFalha {
  let bloqueou: Bloqueio | null = null;
  const chave = normalizar(email);

  // e-mail: histórico antigo é esquecido
  let e = porEmail.get(chave);
  if (!e || agora - e.ultimaFalha > REGRAS.email.esquecerApos) e = { falhas: 0, bloqueios: 0, bloqueadoAte: 0, ultimaFalha: 0 };
  e = { ...e, falhas: e.falhas + 1, ultimaFalha: agora };
  if (e.falhas % REGRAS.email.falhasPorBloqueio === 0) {
    e.bloqueios += 1;
    const ms = duracao(REGRAS.email.bloqueios, e.bloqueios);
    e.bloqueadoAte = agora + ms;
    bloqueou = { motivo: 'email', segundos: ms / 1000 };
  }
  guardar(porEmail, chave, e);

  // origem: conta falhas numa janela de 15 min; o nível do bloqueio sobe se o ataque continua
  let o = porOrigem.get(origem);
  if (!o || agora - o.ultimaFalha > REGRAS.origem.esquecerApos) o = { falhas: 0, inicioJanela: agora, bloqueios: 0, bloqueadoAte: 0, ultimaFalha: 0 };
  if (agora - o.inicioJanela > REGRAS.origem.janela) o = { ...o, falhas: 0, inicioJanela: agora };
  o = { ...o, falhas: o.falhas + 1, ultimaFalha: agora };
  if (o.falhas >= REGRAS.origem.falhasNaJanela) {
    o.bloqueios += 1;
    const ms = duracao(REGRAS.origem.bloqueios, o.bloqueios);
    o.bloqueadoAte = agora + ms;
    o.falhas = 0;
    o.inicioJanela = agora;
    bloqueou ??= { motivo: 'origem', segundos: ms / 1000 };
  }
  guardar(porOrigem, origem, o);

  return { falhasDoEmail: e.falhas, falhasDaOrigem: o.falhas, bloqueou };
}

/** Login certo: a conta volta ao zero (a origem não: um atacante com uma conta válida não limpa o IP). */
export function registrarSucesso(email: string) {
  porEmail.delete(normalizar(email));
}

/** Tira da memória o que já expirou (roda de tempos em tempos). */
export function limparExpirados(agora = Date.now()) {
  for (const [chave, e] of porEmail) {
    if (e.bloqueadoAte < agora && agora - e.ultimaFalha > REGRAS.email.esquecerApos) porEmail.delete(chave);
  }
  for (const [chave, o] of porOrigem) {
    if (o.bloqueadoAte < agora && agora - o.ultimaFalha > REGRAS.origem.esquecerApos) porOrigem.delete(chave);
  }
}
setInterval(() => limparExpirados(), 10 * MINUTO).unref();

/** Só para testes: começa do zero. */
export function zerarLimites() {
  porEmail.clear();
  porOrigem.clear();
}
