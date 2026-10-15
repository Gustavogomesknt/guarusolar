/*
 * Versão do CONTRATO entre o app de campo (PWA dos técnicos) e a API.
 *
 * O app instalado na tela inicial roda a versão guardada pelo service worker até o técnico
 * atualizar: depois de uma publicação, um celular pode continuar com a versão antiga por dias.
 * O app manda a própria versão em todo pedido (cabeçalho X-App-Campo) e a API recusa a que for
 * mais antiga que a mínima com 426 e o código APP_DESATUALIZADO: o app mostra "Seu aplicativo
 * está desatualizado. Toque para atualizar", e a foto continua na fila até a atualização.
 *
 * QUANDO MEXER (os dois números saem na mesma publicação, porque API e app são do mesmo build):
 * - Mudou o que o app de campo manda ou espera da API (campo obrigatório novo no envio da foto,
 *   formato de resposta que a versão antiga não entende): some 1 em VERSAO_DO_APP_DE_CAMPO.
 * - A API nova NÃO aceita mais o que a versão anterior manda: suba VERSAO_MINIMA_DO_APP_DE_CAMPO
 *   para o mesmo número. Se a API continua aceitando a versão antiga (campo novo opcional),
 *   deixe a mínima como está: ninguém é barrado à toa.
 *
 * Sem o cabeçalho = versão 0: são os apps instalados ANTES desta conferência existir (até
 * 14/10/2026). Eles não conhecem o código APP_DESATUALIZADO e tratariam a recusa como erro
 * definitivo da foto. Por isso a mínima começa em 0; só suba depois de os celulares terem
 * aberto o app ao menos uma vez com esta versão (ela se atualiza sozinha quando está parada).
 */
export const VERSAO_DO_APP_DE_CAMPO = 2; // 2: vídeo nos serviços (rotas novas)
export const VERSAO_MINIMA_DO_APP_DE_CAMPO = 0;

/** Cabeçalho com a versão do app de campo, em todo pedido dele à API. */
export const CABECALHO_VERSAO_DO_APP = 'X-App-Campo';
/** Status da recusa por versão antiga (426 Upgrade Required) e o código no corpo da resposta. */
export const STATUS_APP_DESATUALIZADO = 426;
export const CODIGO_APP_DESATUALIZADO = 'APP_DESATUALIZADO';
export const AVISO_APP_DESATUALIZADO = 'Seu aplicativo está desatualizado. Toque para atualizar.';
