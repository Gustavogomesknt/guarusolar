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
};
