import { randomBytes } from 'node:crypto';

/*
 * "Sinal de mudança" da operação, para o escritório se atualizar quase em tempo real com um
 * pedido minúsculo (GET /api/validacao/versao a cada 20 s) em vez de baixar a fila inteira.
 *
 * Fica em MEMÓRIA, sem ir ao banco: cada rota que muda a fila de validação, a agenda ou a
 * situação de um serviço chama operacaoMudou() depois de gravar. Reinício da API (publicação,
 * sono da Render) troca o prefixo: a tela vê uma versão diferente e recarrega uma vez, o que é
 * inofensivo. Com mais de uma instância da API, mudar para uma consulta ao banco (uma instância
 * não vê o contador da outra).
 *
 * Rota nova que mude agendamento ou validação: chame operacaoMudou() depois de gravar.
 */
const inicio = randomBytes(3).toString('hex');
let contador = 0;

export const versaoDaOperacao = () => `${inicio}:${contador}`;

export function operacaoMudou() {
  contador += 1;
}
