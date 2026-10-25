/*
 * PRAZO E GARANTIA DA PROPOSTA — edite aqui o texto padrão da garantia e as sugestões de prazo.
 *
 * Os dois são texto livre, gravados em cada orçamento (Orcamento.prazoExecucao e
 * Orcamento.garantia) e impressos no PDF. Mudar este arquivo NÃO altera proposta já salva: vale
 * para os orçamentos novos. Depois de editar: `npm run build` (confere) e publicar.
 */

/**
 * Garantia que todo orçamento NOVO já traz preenchida; o comercial pode mudar em cada orçamento.
 * Orçamento sem garantia gravada (anterior ao campo, ou com o campo apagado) sai com este texto.
 */
export const GARANTIA_PADRAO =
  'Garantia de 12 meses sobre os serviços de instalação, a contar da data de conclusão.';

/**
 * Sugestões rápidas do campo "Prazo de execução" (um toque preenche; o comercial ajusta o texto).
 * O prazo NÃO tem padrão: depende do escopo, e sem ele a proposta não é gerada nem enviada.
 */
export const SUGESTOES_DE_PRAZO = [
  '5 dias úteis após a aprovação',
  '15 dias úteis após a aprovação da proposta',
  '25 dias úteis após a aprovação e liberação do acesso ao local',
  '45 dias após a aprovação, conforme a homologação na concessionária',
];

/** Limites dos dois textos: cabem nas caixas da página 1 do PDF. */
export const PRAZO_MAXIMO_DE_CARACTERES = 160;
export const GARANTIA_MAXIMO_DE_CARACTERES = 300;

/** Mesma mensagem na tela e na API. */
export const AVISO_SEM_PRAZO =
  'Preencha o prazo de execução e salve o orçamento: sem o prazo, a proposta não é gerada nem enviada ao cliente.';
