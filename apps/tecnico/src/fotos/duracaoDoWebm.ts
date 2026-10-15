/*
 * O WebM gravado pelo MediaRecorder sai SEM a duração no cabeçalho (é gravado "ao vivo"): o player
 * do gestor mostra a duração como infinita e não deixa avançar. Aqui a duração é escrita no bloco
 * Info do arquivo, antes de ele entrar na fila. Só o começo do arquivo é lido e reescrito.
 *
 * Formato (EBML/Matroska): Segment (0x18538067) > Info (0x1549A966) > TimecodeScale (0x2AD7B1),
 * Duration (0x4489, float de 8 bytes, na unidade do TimecodeScale; padrão 1 ms). O Segment do
 * MediaRecorder tem tamanho "desconhecido", e não há SeekHead nem Cues: inserir bytes no Info não
 * desloca nenhuma referência. Com qualquer coisa fora disso, devolve o arquivo como veio (o vídeo
 * continua tocando; só sem a duração).
 */

const SEGMENT = 0x18538067;
const INFO = 0x1549a966;
const SEEKHEAD = 0x114d9b74;
const TIMECODE_SCALE = 0x2ad7b1;
const DURATION = 0x4489;

type Lido = { valor: number; tamanho: number; desconhecido: boolean };

/** Número de tamanho variável (EBML): `manterMarcador` para IDs. */
function lerVint(dados: Uint8Array, pos: number, manterMarcador: boolean): Lido | null {
  const primeiro = dados[pos];
  if (primeiro === undefined || primeiro === 0) return null;
  let tamanho = 1;
  while (tamanho <= 8 && !(primeiro & (0x80 >> (tamanho - 1)))) tamanho++;
  if (tamanho > 8 || pos + tamanho > dados.length) return null;
  let valor = manterMarcador ? primeiro : primeiro & (0xff >> tamanho);
  let todosUm = valor === 0xff >> tamanho;
  for (let i = 1; i < tamanho; i++) {
    valor = valor * 256 + dados[pos + i];
    if (dados[pos + i] !== 0xff) todosUm = false;
  }
  return { valor, tamanho, desconhecido: !manterMarcador && todosUm };
}

/** Tamanho de 8 bytes (cabe qualquer valor e evita recalcular o comprimento). */
function tamanhoDe8Bytes(valor: number) {
  const b = new Uint8Array(8);
  b[0] = 0x01;
  let v = valor;
  for (let i = 7; i >= 1; i--) {
    b[i] = v % 256;
    v = Math.floor(v / 256);
  }
  return b;
}

export async function corrigirDuracaoDoWebm(arquivo: Blob, duracaoMs: number): Promise<Blob> {
  try {
    const cabeca = new Uint8Array(await arquivo.slice(0, 64 * 1024).arrayBuffer());
    // EBML header
    const idEbml = lerVint(cabeca, 0, true);
    const tamEbml = idEbml && lerVint(cabeca, idEbml.tamanho, false);
    if (!idEbml || !tamEbml || idEbml.valor !== 0x1a45dfa3) return arquivo;
    let pos = idEbml.tamanho + tamEbml.tamanho + tamEbml.valor;
    // Segment, de tamanho desconhecido (gravação ao vivo)
    const idSeg = lerVint(cabeca, pos, true);
    const tamSeg = idSeg && lerVint(cabeca, pos + idSeg.tamanho, false);
    if (!idSeg || !tamSeg || idSeg.valor !== SEGMENT || !tamSeg.desconhecido) return arquivo;
    pos += idSeg.tamanho + tamSeg.tamanho;
    // procura o Info entre os filhos do Segment (antes dos Clusters)
    for (let filhos = 0; filhos < 8 && pos < cabeca.length; filhos++) {
      const id = lerVint(cabeca, pos, true);
      const tam = id && lerVint(cabeca, pos + id.tamanho, false);
      if (!id || !tam || tam.desconhecido) return arquivo;
      if (id.valor === SEEKHEAD) return arquivo; // há posições gravadas: não mexe
      const inicioConteudo = pos + id.tamanho + tam.tamanho;
      const fimInfo = inicioConteudo + tam.valor;
      if (id.valor !== INFO) {
        pos = fimInfo;
        continue;
      }
      if (fimInfo > cabeca.length) return arquivo;
      // TimecodeScale (padrão 1.000.000 ns = 1 ms) e se já existe Duration
      let escala = 1_000_000;
      for (let q = inicioConteudo; q < fimInfo; ) {
        const sid = lerVint(cabeca, q, true);
        const stam = sid && lerVint(cabeca, q + sid.tamanho, false);
        if (!sid || !stam) return arquivo;
        const valorEm = q + sid.tamanho + stam.tamanho;
        if (sid.valor === DURATION) return arquivo; // já tem
        if (sid.valor === TIMECODE_SCALE) {
          escala = 0;
          for (let i = 0; i < stam.valor; i++) escala = escala * 256 + cabeca[valorEm + i];
        }
        q = valorEm + stam.valor;
      }
      const duracao = new Uint8Array(11);
      duracao[0] = 0x44;
      duracao[1] = 0x89;
      duracao[2] = 0x88; // tamanho 8
      new DataView(duracao.buffer).setFloat64(3, (duracaoMs * 1_000_000) / (escala || 1_000_000));
      const conteudoInfo = cabeca.slice(inicioConteudo, fimInfo);
      const novoInfo = new Uint8Array([...cabeca.slice(pos, pos + id.tamanho), ...tamanhoDe8Bytes(tam.valor + duracao.length), ...conteudoInfo, ...duracao]);
      return new Blob([cabeca.slice(0, pos), novoInfo, arquivo.slice(fimInfo)], { type: arquivo.type });
    }
    return arquivo;
  } catch {
    return arquivo;
  }
}
