import type { StatusAgendamento, TipoServico } from '@guarusolar/compartilhado';

/*
 * Formato das respostas da API usadas pelo técnico.
 * Datas do agendamento chegam como "2026-09-29T00:00:00.000Z" (só o dia importa: diaDaApi).
 */

export type ClienteDoServico = {
  nome: string;
  whatsapp: string;
  logradouro: string | null;
  numero: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
};

/** Serviço na agenda (GET /api/tecnico/agenda). */
export type ServicoNaAgenda = {
  id: string;
  tipo: TipoServico;
  status: StatusAgendamento;
  dataInicio: string;
  dataFim: string;
  motivoDevolucao: string | null;
  projeto: { codigo: string; cliente: ClienteDoServico };
  /** a linha da agenda e quem está escalado neste serviço (é a escala que dá acesso) */
  equipe?: { nome: string };
  escala?: { usuario: { id: string; nome: string } }[];
};

export type RevisaoFoto = 'PENDENTE' | 'OK' | 'REFAZER';

/** Foto já recebida pela API. */
export type FotoEnviada = {
  id: string;
  chave: string | null;
  rotulo: string | null;
  // a imagem sai por GET /api/fotos/:id (com login): urlDaFoto(id) + ImagemProtegida
  capturadaEm: string | null;
  revisao: RevisaoFoto;
  comentario: string | null;
  idLocal: string | null;
};

export type ItemChecklist = {
  id: string;
  chave: string;
  rotulo: string;
  obrigatoria: boolean;
  ordem: number;
  /** false também quando a foto foi marcada para refazer */
  enviada: boolean;
  foto: FotoEnviada | null;
};

/** Serviço aberto (GET /api/tecnico/servicos/:id). */
export type ServicoDetalhe = Omit<ServicoNaAgenda, 'projeto'> & {
  observacoesTecnico: string | null;
  sistemaTestado: boolean;
  enviadoEm: string | null;
  projeto: { codigo: string; cliente: ClienteDoServico };
  /** todas as fotos, inclusive extras (chave nula) e as marcadas para refazer */
  fotos: FotoEnviada[];
  checklist: ItemChecklist[];
  /** outro serviço do mesmo projeto está em execução ou em validação: este ainda não pode começar */
  aguardandoOutro?: string | null;
};
