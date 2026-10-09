import type { TipoServico } from './enums.js';

/*
 * ROTEIRO DE CADA TIPO DE SERVIÇO — edite aqui. É o ÚNICO lugar: os nomes das fotos, se as
 * observações são obrigatórias, se o técnico confirma o teste do sistema e o que a validação do
 * gestor faz com o projeto.
 *
 * As fotos vão para a tabela ChecklistFoto sozinhas: a API sincroniza ao subir (e o db:seed:base
 * também). Para mudar um nome, mude o `rotulo` e publique. NÃO mude a `chave` de um item que já
 * tem fotos: é por ela que cada foto enviada sabe a que item pertence (para trocar um item, crie
 * outro com chave nova; o antigo é desativado sozinho e as fotos antigas continuam aparecendo).
 */

export type ItemDoRoteiro = { chave: string; rotulo: string; obrigatoria?: boolean };

export type RoteiroDoServico = {
  /** fotos pedidas ao técnico, na ordem */
  fotos: ItemDoRoteiro[];
  /** nome do campo de texto do técnico e se ele é obrigatório para enviar */
  observacoes: { rotulo: string; obrigatorias: boolean; dica: string };
  /** o técnico confirma "o sistema foi testado" antes de enviar (não faz sentido numa visita) */
  exigeTesteDoSistema: boolean;
  /**
   * O que a APROVAÇÃO do gestor faz com o projeto (regra em apps/api/src/lib/situacaoDoProjeto.ts):
   * - 'A_AGENDAR': visita técnica; o projeto volta para "A agendar" (falta a instalação);
   * - 'AGUARDANDO_CONCLUSAO': instalação; fica esperando o gestor concluir o projeto;
   * - 'NAO_MEXE': manutenção e retrabalho; a situação do projeto fica como está.
   * NENHUM tipo conclui o projeto: isso é sempre uma ação do gestor.
   */
  aoValidar: 'A_AGENDAR' | 'AGUARDANDO_CONCLUSAO' | 'NAO_MEXE';
};

const FOTOS_DA_INSTALACAO: ItemDoRoteiro[] = [
  { chave: 'paineis_instalados', rotulo: 'Painéis instalados (visão geral)' },
  { chave: 'estrutura_fixacao', rotulo: 'Estrutura e fixação' },
  { chave: 'inversor', rotulo: 'Inversor instalado' },
  { chave: 'string_box', rotulo: 'String box / quadro CC' },
  { chave: 'aterramento', rotulo: 'Aterramento' },
  { chave: 'padrao_entrada', rotulo: 'Padrão de entrada / medidor' },
];

const OBSERVACOES_LIVRES = { rotulo: 'Observações', obrigatorias: false, dica: 'O que o escritório precisa saber sobre este serviço.' };

export const ROTEIRO_DO_SERVICO: Record<TipoServico, RoteiroDoServico> = {
  VISITA_TECNICA: {
    fotos: [
      { chave: 'padrao_entrada', rotulo: 'Padrão de entrada' },
      { chave: 'quadro_distribuicao', rotulo: 'Quadro de distribuição' },
      { chave: 'local_instalacao', rotulo: 'Local da instalação' },
      { chave: 'vista_geral', rotulo: 'Vista geral' },
    ],
    observacoes: {
      rotulo: 'Observações de medição',
      obrigatorias: true,
      dica: 'Medidas, distâncias, bitola dos cabos, disjuntor geral e o que mais o projeto precisar.',
    },
    exigeTesteDoSistema: false,
    aoValidar: 'A_AGENDAR',
  },
  INSTALACAO: { fotos: FOTOS_DA_INSTALACAO, observacoes: OBSERVACOES_LIVRES, exigeTesteDoSistema: true, aoValidar: 'AGUARDANDO_CONCLUSAO' },
  MANUTENCAO: {
    fotos: [
      { chave: 'antes', rotulo: 'Antes do serviço' },
      { chave: 'depois', rotulo: 'Depois do serviço' },
      { chave: 'leitura_inversor', rotulo: 'Leitura do inversor' },
    ],
    observacoes: OBSERVACOES_LIVRES,
    exigeTesteDoSistema: true,
    aoValidar: 'NAO_MEXE',
  },
  // retrabalho refaz parte de uma instalação: mesmo roteiro dela
  RETRABALHO: { fotos: FOTOS_DA_INSTALACAO, observacoes: OBSERVACOES_LIVRES, exigeTesteDoSistema: true, aoValidar: 'NAO_MEXE' },
  // não é mais oferecida na agenda; fica para registros antigos
  VISTORIA_CONCESSIONARIA: { fotos: [], observacoes: OBSERVACOES_LIVRES, exigeTesteDoSistema: false, aoValidar: 'NAO_MEXE' },
};

/** Tipos que o gestor pode escolher ao agendar, na ordem do seletor (instalação é o padrão). */
export const TIPOS_SERVICO_AGENDAVEIS = ['INSTALACAO', 'VISITA_TECNICA', 'MANUTENCAO', 'RETRABALHO'] as const satisfies readonly TipoServico[];

/**
 * O serviço move a situação do projeto ao longo da execução (agendado, em execução, em
 * validação)? Só visita técnica e instalação. Manutenção e retrabalho correm "por fora": um
 * projeto concluído continua concluído enquanto a manutenção é agendada, feita e validada.
 */
export const moveOProjeto = (tipo: TipoServico) => ROTEIRO_DO_SERVICO[tipo].aoValidar !== 'NAO_MEXE';
