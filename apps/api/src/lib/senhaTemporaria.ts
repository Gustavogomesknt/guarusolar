import { randomInt } from 'node:crypto';

/**
 * Senha temporária para entregar à pessoa (tela de usuários e npm run usuario): "kx7m-p9qt-4hzr",
 * 12 caracteres sem letras que se confundem (0/o, 1/l/i). Trocada no primeiro acesso.
 */
export function gerarSenhaTemporaria() {
  const letras = 'abcdefghjkmnpqrstuvwxyz23456789';
  const grupo = () => Array.from({ length: 4 }, () => letras[randomInt(letras.length)]).join('');
  return `${grupo()}-${grupo()}-${grupo()}`;
}
