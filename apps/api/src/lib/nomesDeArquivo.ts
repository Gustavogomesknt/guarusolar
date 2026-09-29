import { FUSO_EMPRESA, ROTULO_TIPO_SERVICO, type TipoServico } from '@guarusolar/compartilhado';

/*
 * Nomes de pastas e arquivos das fotos no SharePoint, legíveis para quem navega pela biblioteca:
 *
 *   Casas Bahia – Guarulhos / PRJ-2026-0015 / 2026-09-29 Instalação / 01 Painéis instalados (visão geral) 14-02-07.jpg
 *                                                                     Extra 14-35-02.jpg
 *                                                                     Substituídas/…  (fotos refeitas)
 *
 * O horário vai até os segundos: reenviar a mesma foto gera o mesmo nome e substitui o arquivo
 * em vez de duplicar. O banco guarda o id do arquivo no SharePoint, não o caminho: renomear ou
 * mover pastas lá não quebra nada.
 */

export type DestinoDaFoto = {
  cliente: { nome: string; cidade: string | null };
  projetoCodigo: string;
  servico: { id: string; dataInicio: Date; tipo: TipoServico };
  /** item do checklist (ordem começa em 0); null = foto extra */
  item: { ordem: number; rotulo: string } | null;
  capturadaEm: Date;
  /** ".jpg", ".png"… */
  extensao: string;
};

export const PASTA_DAS_SUBSTITUIDAS = 'Substituídas';

// SharePoint não aceita estes caracteres em nomes (nem controle), e # e % confundem links.
const PROIBIDOS = /["*:<>?/\\|#%\u0000-\u001f]/g;

/** Nome aceito pelo SharePoint: troca caracteres proibidos, sem espaço/ponto nas pontas, com limite. */
export function nomeSeguro(texto: string, maximo = 80) {
  const limpo = texto
    .replace(PROIBIDOS, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[.~\s]+|[.\s]+$/g, '')
    .slice(0, maximo)
    .trim();
  return limpo || 'sem nome';
}

/** 14-02-07 (hora da captura no fuso da empresa; ":" não pode em nome de arquivo). */
function horaDoArquivo(instante: Date) {
  const partes = new Intl.DateTimeFormat('en-GB', {
    timeZone: FUSO_EMPRESA,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instante);
  const parte = (tipo: string) => partes.find((p) => p.type === tipo)!.value;
  return `${parte('hour')}-${parte('minute')}-${parte('second')}`;
}

/** Pastas e nome do arquivo, do mais externo para o arquivo. */
export function caminhoDaFoto(destino: DestinoDaFoto): string[] {
  const { cliente, servico, item } = destino;
  const pastaCliente = nomeSeguro(cliente.cidade ? `${cliente.nome} – ${cliente.cidade}` : cliente.nome);
  // dataInicio é coluna só de data (meia-noite UTC): o dia está na parte ISO
  const pastaServico = `${servico.dataInicio.toISOString().slice(0, 10)} ${ROTULO_TIPO_SERVICO[servico.tipo]}`;
  const hora = horaDoArquivo(destino.capturadaEm);
  const extensao = /^\.[a-z0-9]{1,5}$/i.test(destino.extensao) ? destino.extensao.toLowerCase() : '.jpg';
  const arquivo = item
    ? `${String(item.ordem + 1).padStart(2, '0')} ${nomeSeguro(item.rotulo, 60)} ${hora}${extensao}`
    : `Extra ${hora}${extensao}`;
  return [pastaCliente, nomeSeguro(destino.projetoCodigo), nomeSeguro(pastaServico), arquivo];
}
