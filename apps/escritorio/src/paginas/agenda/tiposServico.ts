import type { TipoServico } from '@guarusolar/compartilhado';

/**
 * Cores dos blocos da agenda (protótipo aprovado): fundo claro, borda forte e texto escuro.
 * O laranja da instalação nunca é fundo de texto branco.
 */
export const TIPOS_SERVICO_AGENDA: Record<TipoServico, { rotulo: string; fundo: string; borda: string; texto: string }> = {
  INSTALACAO: { rotulo: 'Instalação', fundo: 'bg-[#FDEBD6]', borda: 'border-[#EE7C12]', texto: 'text-[#8A4B07]' },
  VISITA_TECNICA: { rotulo: 'Visita técnica', fundo: 'bg-[#E1EAF7]', borda: 'border-[#1257A6]', texto: 'text-[#0E3F7E]' },
  MANUTENCAO: { rotulo: 'Manutenção', fundo: 'bg-[#E7EBF2]', borda: 'border-[#6B7B90]', texto: 'text-[#3C4A5C]' },
  VISTORIA_CONCESSIONARIA: {
    rotulo: 'Vistoria da concessionária',
    fundo: 'bg-[#EDE4F5]',
    borda: 'border-[#7A52A8]',
    texto: 'text-[#4E2F75]',
  },
};
