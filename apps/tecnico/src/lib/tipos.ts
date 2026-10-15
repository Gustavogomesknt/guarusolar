import type { StatusAgendamento, TipoServico } from '@guarusolar/compartilhado';

/*
 * Formato das respostas da API usadas pelo técnico.
 * Datas do agendamento chegam como "2026-09-29T00:00:00.000Z" (só o dia importa: diaDaApi).
 */

/**
 * O técnico recebe do cliente só o nome e o endereço da instalação. Telefone, WhatsApp, e-mail e
 * dado comercial NÃO vêm da API (decisão da Guarusolar): não acrescente aqui.
 */
export type ClienteDoServico = {
  nome: string;
  logradouro: string | null;
  numero: string | null;
  complemento?: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
};

/**
 * Serviço na agenda (GET /api/tecnico/agenda). `projeto` é null na visita técnica AVULSA (pré-venda,
 * sem projeto nem código PRJ): o cliente vem no topo. Use clienteDoServico(s), que também lê o
 * formato antigo (projeto.cliente) guardado no aparelho antes da atualização.
 */
export type ServicoNaAgenda = {
  id: string;
  tipo: TipoServico;
  status: StatusAgendamento;
  dataInicio: string;
  dataFim: string;
  motivoDevolucao: string | null;
  projeto: { codigo: string; cliente?: ClienteDoServico } | null;
  cliente?: ClienteDoServico;
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
/** Vídeo já recebido pela API (a capa sai por GET /api/videos/:id/capa, com login). */
export type VideoEnviado = {
  id: string;
  idLocal: string;
  duracaoSegundos: number | null;
  tamanhoBytes: number;
  gravadoEm: string | null;
  temCapa: boolean;
};

export type ServicoDetalhe = ServicoNaAgenda & {
  observacoesTecnico: string | null;
  sistemaTestado: boolean;
  enviadoEm: string | null;
  /** todas as fotos, inclusive extras (chave nula) e as marcadas para refazer */
  fotos: FotoEnviada[];
  /** vídeos opcionais já recebidos; ausente em resposta da versão anterior da API */
  videos?: VideoEnviado[];
  checklist: ItemChecklist[];
  /** outro serviço do mesmo projeto está em execução ou em validação: este ainda não pode começar */
  aguardandoOutro?: string | null;
  /** o servidor não está recebendo fotos (armazenamento não configurado): o motivo, para avisar antes */
  fotosBloqueadas?: string | null;
  /** na INSTALAÇÃO: as visitas técnicas do mesmo cliente, só para consulta (ausente na API anterior) */
  visitasDoCliente?: VisitaDoCliente[];
};

/** O que um colega registrou na visita técnica do cliente (só leitura; fotos por /api/fotos/:id). */
export type VisitaDoCliente = {
  id: string;
  status: StatusAgendamento;
  dataInicio: string;
  dataFim: string;
  enviadoEm: string | null;
  observacoesTecnico: string | null;
  enviadoPor: { nome: string } | null;
  fotos: { id: string; rotulo: string | null; chave: string | null }[];
};

/** O cliente do serviço: no topo (API atual) ou, no formato antigo guardado no aparelho, pelo projeto. */
export const clienteDoServico = (s: Pick<ServicoNaAgenda, 'cliente' | 'projeto'>): ClienteDoServico => (s.cliente ?? s.projeto?.cliente)!;

/** O que vai no lugar do código do projeto: a visita avulsa não tem projeto. */
export const identificacaoDoServico = (s: Pick<ServicoNaAgenda, 'projeto'>) => s.projeto?.codigo ?? 'Visita avulsa';
