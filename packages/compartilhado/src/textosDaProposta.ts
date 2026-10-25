/*
 * PRAZO E GARANTIA DA PROPOSTA — edite aqui o texto padrão da garantia e as sugestões de prazo.
 *
 * Os dois são SÓ A DURAÇÃO ("15 dias úteis", "12 meses"; 25/10/2026), gravados em cada orçamento
 * (Orcamento.prazoExecucao e Orcamento.garantia) e impressos no PDF: no modelo novo, num selo da
 * arte da página 3. A qualificação (a partir de quando conta, sobre o quê) é texto fixo da
 * proposta, em apps/api/src/conteudo/proposta.ts. Mudar este arquivo NÃO altera proposta já salva: vale
 * para os orçamentos novos. Depois de editar: `npm run build` (confere) e publicar.
 */

/**
 * Garantia que todo orçamento NOVO já traz preenchida; o comercial pode mudar em cada orçamento.
 * Orçamento sem garantia gravada (anterior ao campo, ou com o campo apagado) sai com este texto.
 */
export const GARANTIA_PADRAO = '12 meses';

/**
 * Sugestões rápidas do campo "Prazo de execução" (um toque preenche; o comercial ajusta o texto).
 * Ao trocar alguma, confira que cabe no selo (cabeNoSelo, a API recusa o que não cabe).
 * O prazo NÃO tem padrão: depende do escopo, e sem ele a proposta não é gerada nem enviada.
 */
export const SUGESTOES_DE_PRAZO = [
  '1 dia útil',
  '5 dias úteis',
  '15 dias úteis',
  '30 dias úteis',
];

/**
 * Limite dos dois campos: é o selo da arte (duas ou três palavras). Orçamento salvo antes, com
 * texto maior, abre e salva sem mudar o texto (a API só recusa quem o altera para maior que isto);
 * `npm run orcamentos:prazo-garantia` converte os conhecidos e lista o resto para revisão.
 */
export const PRAZO_MAXIMO_DE_CARACTERES = 24;
export const GARANTIA_MAXIMO_DE_CARACTERES = 24;

/** Mesma mensagem na tela e na API. */
export const AVISO_SEM_PRAZO =
  'Preencha o prazo de execução e salve o orçamento: sem o prazo, a proposta não é gerada nem enviada ao cliente.';
