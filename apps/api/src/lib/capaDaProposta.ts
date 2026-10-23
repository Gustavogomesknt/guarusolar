import { existsSync } from 'node:fs';
import path from 'node:path';
import { CAPAS_DA_PROPOSTA } from '../conteudo/proposta';

/*
 * CAPA DA PROPOSTA (página 1 do modelo novo): imagem fixa, uma por TIPO DE SERVIÇO vendido.
 *
 * O arquivo tem o nome do tipo, sem acento, em minúsculas e com hífens, dentro de
 * apps/api/assets/proposta/capas/ (LEIA-ME de lá):
 *   "Instalação de carregador veicular" -> instalacao-de-carregador-veicular.jpg (ou .png)
 * Acrescentar uma capa = pôr o arquivo do outro tipo na pasta e publicar; nada de código.
 *
 * Tipo sem capa própria usa a capa PADRÃO (CAPAS_DA_PROPOSTA.padrao, a de carregador: hoje a
 * Guarusolar só vende carregador), e o gerador AVISA o vendedor antes de gerar ou enviar,
 * porque a capa impressa fala de outro serviço. Renomear o tipo na tela "Tipos de serviço" muda o
 * nome esperado do arquivo: renomeie o arquivo junto.
 */

const PASTA = path.resolve(__dirname, '../..', CAPAS_DA_PROPOSTA.pasta);
const EXTENSOES = ['.jpg', '.jpeg', '.png'];

/** "Instalação de carregador veicular" -> "instalacao-de-carregador-veicular" */
export function nomeDoArquivoDaCapa(tipo: string) {
  return tipo
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function arquivoExistente(nome: string): string | null {
  for (const ext of EXTENSOES) {
    const arquivo = path.join(PASTA, nome + ext);
    if (existsSync(arquivo)) return arquivo;
  }
  return null;
}

/**
 * O tipo tem capa própria? A do tipo padrão conta como própria mesmo antes de o arquivo chegar
 * (o PDF mostra o lugar reservado): o aviso é para capa de OUTRO serviço, não para arte faltando.
 */
export function tipoTemCapa(tipo: string | null | undefined) {
  if (!tipo) return false;
  const nome = nomeDoArquivoDaCapa(tipo);
  return nome === CAPAS_DA_PROPOSTA.padrao || arquivoExistente(nome) !== null;
}

/** A capa que sai no PDF: a do tipo, ou a padrão. `arquivo` nulo = ainda não chegou. */
export function capaDoOrcamento(tipo: string | null | undefined): { arquivo: string | null; esperado: string } {
  const proprio = tipo ? nomeDoArquivoDaCapa(tipo) : null;
  const arquivo = (proprio && arquivoExistente(proprio)) || arquivoExistente(CAPAS_DA_PROPOSTA.padrao);
  return { arquivo, esperado: `${CAPAS_DA_PROPOSTA.pasta}/${CAPAS_DA_PROPOSTA.padrao}.jpg` };
}
