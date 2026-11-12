import { compararPelaHora } from './dias.js';
import type { StatusAgendamento, TipoServico } from './enums.js';

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
   * - 'NAO_MEXE': laudo, vistoria, manutenção e retrabalho; a situação do projeto fica como está.
   * Os dois primeiros valem quando não sobra outro serviço pendente (visita ou instalação) no
   * projeto: enquanto sobrar, o projeto segue a situação deles (situacaoPelosServicos, na API).
   * NENHUM tipo conclui o projeto: isso é sempre uma ação do gestor.
   */
  aoValidar: 'A_AGENDAR' | 'AGUARDANDO_CONCLUSAO' | 'NAO_MEXE';
};

// roteiro enviado pelo cliente em 19/10/2026: todas com chave nova (nenhuma é a mesma foto de antes)
const FOTOS_DA_INSTALACAO: ItemDoRoteiro[] = [
  { chave: 'carregador_frontal', rotulo: 'Foto frontal do carregador instalado' },
  { chave: 'carregador_etiqueta', rotulo: 'Etiqueta de identificação do carregador' },
  { chave: 'carregador_bornes', rotulo: 'Bornes internos do carregador' },
  { chave: 'disjuntor_padrao_entrada', rotulo: 'Disjuntor do padrão de entrada' },
  { chave: 'quadro_disjuntores_casa', rotulo: 'Quadro de disjuntores da casa' },
  { chave: 'quadro_protecao_carregador', rotulo: 'Quadro de proteção exclusivo do carregador' },
  { chave: 'bitola_cabos', rotulo: 'Bitola dos cabos com identificação legível' },
  { chave: 'vista_ampla_local', rotulo: 'Foto ampla do local da instalação' },
];

const OBSERVACOES_LIVRES = { rotulo: 'Observações', obrigatorias: false, dica: 'O que o escritório precisa saber sobre este serviço.' };

// padrao_entrada é a mesma foto de antes (só o nome mudou); as outras têm chave nova. O laudo usa
// as MESMAS: a ChecklistFoto separa a chave por etapa (@@unique([tipoServico, chave])), não mistura
const FOTOS_DA_VISITA: ItemDoRoteiro[] = [
  { chave: 'vaga', rotulo: 'Foto da vaga' },
  { chave: 'padrao_entrada', rotulo: 'Foto do padrão de entrada' },
  { chave: 'local_infra', rotulo: 'Foto do local da infra que será instalada' },
];
const OBSERVACOES_DA_VISITA = {
  rotulo: 'Observações de medição',
  obrigatorias: true,
  dica: 'Medidas, distâncias, bitola dos cabos, disjuntor geral e o que mais o projeto precisar.',
};

export const ROTEIRO_DO_SERVICO: Record<TipoServico, RoteiroDoServico> = {
  VISITA_TECNICA: { fotos: FOTOS_DA_VISITA, observacoes: OBSERVACOES_DA_VISITA, exigeTesteDoSistema: false, aoValidar: 'A_AGENDAR' },
  // LAUDO (12/11/2026): uma visita técnica que NÃO vira orçamento e NÃO move o projeto. Mesmo
  // roteiro da visita; validar não mexe na situação (nem grava visitaTecnicaConcluidaEm). Pode ser
  // avulso (ETAPAS_DE_VISITA) ou de um projeto, a qualquer momento, também com a obra concluída
  LAUDO: { fotos: FOTOS_DA_VISITA, observacoes: OBSERVACOES_DA_VISITA, exigeTesteDoSistema: false, aoValidar: 'NAO_MEXE' },
  INSTALACAO: { fotos: FOTOS_DA_INSTALACAO, observacoes: OBSERVACOES_LIVRES, exigeTesteDoSistema: true, aoValidar: 'AGUARDANDO_CONCLUSAO' },
  MANUTENCAO: {
    // antes é a mesma foto de antes (só o nome mudou); "depois" virou duas fotos: chaves novas
    fotos: [
      { chave: 'antes', rotulo: 'Foto antes' },
      { chave: 'servico_realizado', rotulo: 'Foto do que foi realizado' },
      { chave: 'finalizada', rotulo: 'Foto finalizada' },
    ],
    observacoes: OBSERVACOES_LIVRES,
    exigeTesteDoSistema: true,
    aoValidar: 'NAO_MEXE',
  },
  // retrabalho refaz parte de uma instalação: mesmo roteiro dela
  RETRABALHO: { fotos: FOTOS_DA_INSTALACAO, observacoes: OBSERVACOES_LIVRES, exigeTesteDoSistema: true, aoValidar: 'NAO_MEXE' },
  // depois da instalação vem a homologação: a concessionária vistoria antes de trocar o medidor
  VISTORIA_CONCESSIONARIA: {
    fotos: [
      { chave: 'medidor_padrao_entrada', rotulo: 'Medidor / padrão de entrada' },
      { chave: 'placa_inversor', rotulo: 'Placa de identificação do inversor' },
      { chave: 'vista_geral_sistema', rotulo: 'Vista geral do sistema instalado' },
    ],
    observacoes: {
      rotulo: 'Observações da vistoria',
      obrigatorias: true,
      dica: 'O que a concessionária conferiu, pendências apontadas e o resultado da vistoria.',
    },
    exigeTesteDoSistema: false,
    aoValidar: 'NAO_MEXE',
  },
};

/** Tipos que o gestor pode escolher ao agendar, na ordem do seletor (instalação é o padrão). */
export const TIPOS_SERVICO_AGENDAVEIS = ['INSTALACAO', 'VISITA_TECNICA', 'LAUDO', 'VISTORIA_CONCESSIONARIA', 'MANUTENCAO', 'RETRABALHO'] as const satisfies readonly TipoServico[];

/**
 * As VISITAS AO LOCAL: visita técnica e laudo (12/11/2026). Só elas podem ser AVULSAS (sem projeto,
 * direto no cliente: a API, a restrição Agendamento_projeto_ou_cliente do banco e o botão da
 * agenda), e o comercial vê as fotos delas (lib/acesso.ts). "Visitas a orçar" continua SÓ com a
 * visita técnica: o laudo não vira orçamento (rotas/visitas.ts).
 */
export const ETAPAS_DE_VISITA = ['VISITA_TECNICA', 'LAUDO'] as const satisfies readonly TipoServico[];
export const ehEtapaDeVisita = (tipo: TipoServico) => (ETAPAS_DE_VISITA as readonly TipoServico[]).includes(tipo);

/**
 * O serviço move a situação do projeto ao longo da execução (agendado, em execução, em
 * validação)? Só visita técnica e instalação. Laudo, vistoria, manutenção e retrabalho correm "por
 * fora": um projeto concluído continua concluído enquanto a manutenção é agendada, feita e validada.
 */
export const moveOProjeto = (tipo: TipoServico) => ROTEIRO_DO_SERVICO[tipo].aoValidar !== 'NAO_MEXE';

/** Com o técnico ou com o gestor: no máximo UM serviço por projeto fica assim de cada vez. */
export const SERVICO_ANDANDO = ['EM_EXECUCAO', 'DEVOLVIDO', 'AGUARDANDO_VALIDACAO'] as const satisfies readonly StatusAgendamento[];
/** Ainda não validado nem cancelado. Um projeto pode ter vários "Agendado" ao mesmo tempo. */
export const SERVICO_PENDENTE = ['AGENDADO', ...SERVICO_ANDANDO] as const satisfies readonly StatusAgendamento[];

const dia = (d: string | Date) => (typeof d === 'string' ? d : d.toISOString()).slice(0, 10);

/**
 * O serviço "da vez" de um projeto com vários: o que está andando; senão o próximo agendado
 * (a data mais próxima); senão o último validado. Cancelados não contam.
 */
export function servicoDaVez<T extends { status: StatusAgendamento; dataInicio: string | Date; horaInicio?: string | null }>(
  servicos: readonly T[],
): T | null {
  // mesmo dia: pela hora de início, os sem hora por último
  const porData = [...servicos].sort((a, b) => dia(a.dataInicio).localeCompare(dia(b.dataInicio)) || compararPelaHora(a, b));
  const andando: readonly StatusAgendamento[] = SERVICO_ANDANDO;
  return (
    porData.find((s) => andando.includes(s.status)) ??
    porData.find((s) => s.status === 'AGENDADO') ??
    porData.reverse().find((s) => s.status === 'APROVADO') ??
    null
  );
}
