import { ROTULO_TIPO_SERVICO, type TipoServico } from '@guarusolar/compartilhado';

/**
 * Cores dos blocos da agenda (protótipo aprovado): fundo claro, borda forte e texto escuro.
 * O laranja da instalação nunca é fundo de texto branco.
 */
export const TIPOS_SERVICO_AGENDA: Record<TipoServico, { rotulo: string; fundo: string; borda: string; texto: string }> = {
  INSTALACAO: { rotulo: ROTULO_TIPO_SERVICO.INSTALACAO, fundo: 'bg-[#FDEBD6]', borda: 'border-[#EE7C12]', texto: 'text-[#8A4B07]' },
  VISITA_TECNICA: { rotulo: ROTULO_TIPO_SERVICO.VISITA_TECNICA, fundo: 'bg-[#E1EAF7]', borda: 'border-[#1257A6]', texto: 'text-[#0E3F7E]' },
  MANUTENCAO: { rotulo: ROTULO_TIPO_SERVICO.MANUTENCAO, fundo: 'bg-[#E7EBF2]', borda: 'border-[#6B7B90]', texto: 'text-[#3C4A5C]' },
  VISTORIA_CONCESSIONARIA: {
    rotulo: ROTULO_TIPO_SERVICO.VISTORIA_CONCESSIONARIA,
    fundo: 'bg-[#EDE4F5]',
    borda: 'border-[#7A52A8]',
    texto: 'text-[#4E2F75]',
  },
  RETRABALHO: { rotulo: ROTULO_TIPO_SERVICO.RETRABALHO, fundo: 'bg-[#FFF1C7]', borda: 'border-[#C99A00]', texto: 'text-[#6E4E00]' },
};
