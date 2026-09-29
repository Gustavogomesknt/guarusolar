/*
 * Regras da senha nova (escolhida pela própria pessoa). Seguem a orientação atual de segurança
 * (NIST 800-63B): tamanho mínimo e bloqueio de senhas óbvias, sem exigir "maiúscula, número e
 * símbolo" — que só leva a senhas previsíveis como "Senha@123".
 */

const MINIMO = 8;
/** O bcrypt só considera os primeiros 72 bytes: acima disso o resto seria ignorado sem aviso. */
const MAXIMO_BYTES = 72;

const OBVIAS = new Set([
  '12345678', '123456789', '1234567890', '87654321', '11111111', '00000000', 'senha123', 'senha1234',
  'senha12345', 'password', 'password1', 'qwerty123', 'abc12345', 'mudar123', 'trocar123', 'admin123',
  'guarusolar', 'guarusolar1', 'guarusolar12', 'guarusolar123', 'guarusolar2026', 'solar123', 'energia123',
]);

const semAcento = (texto: string) => texto.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** Explica o problema da senha nova, para mostrar à pessoa; null se estiver boa. */
export function problemaNaSenhaNova(
  nova: string,
  contexto: { senhaAtual: string; email: string; nome: string },
): string | null {
  if (nova.length < MINIMO) return `A senha nova precisa ter pelo menos ${MINIMO} caracteres.`;
  if (Buffer.byteLength(nova, 'utf8') > MAXIMO_BYTES) return 'A senha nova é longa demais (até 72 caracteres).';
  if (nova === contexto.senhaAtual) return 'A senha nova precisa ser diferente da atual.';
  const normalizada = semAcento(nova);
  if (OBVIAS.has(normalizada) || /^(.)\1+$/.test(nova)) return 'Essa senha é fácil de adivinhar. Escolha outra.';
  const usuarioDoEmail = semAcento(contexto.email.split('@')[0]);
  if (usuarioDoEmail.length >= 4 && normalizada.includes(usuarioDoEmail)) return 'A senha não pode conter o seu e-mail.';
  const partesDoNome = semAcento(contexto.nome).split(/\s+/).filter((p) => p.length >= 4);
  if (partesDoNome.some((p) => normalizada === p || normalizada === `${p}123` || normalizada === `${p}1234`)) {
    return 'A senha não pode ser o seu nome. Escolha outra.';
  }
  return null;
}
