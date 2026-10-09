import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Link, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Check, Loader2, LocateFixed, MapPin } from 'lucide-react';
import { diaDaApi, diaDeHoje, diaMes, nomeLongo, ROTEIRO_DO_SERVICO, somarDias } from '@guarusolar/compartilhado';
import { toast } from 'sonner';
import { api, ErroApi, SEM_CONEXAO } from '@guarusolar/web/api';
import { TIPOS_SERVICO_AGENDA } from '@guarusolar/web/tiposServico';
import type { ServicoDetalhe } from '@/lib/tipos';
import { enderecoEscrito } from '@/lib/contato';
import { cn } from '@/lib/utils';
import { Cabecalho } from '@/components/Cabecalho';
import { SituacaoServico } from '@guarusolar/web/SituacaoServico';
import { BlocoFoto, FotosExtras, type EstadoBloco } from '@/components/BlocoFoto';
import { useFotos } from '@/fotos/useFotos';
import type { Posicao } from '@/fotos/metadados';
import { useLocalizacao, type EstadoLocalizacao } from '@/fotos/useLocalizacao';

type Rascunho = { observacoes: string; testado: boolean };
const chaveRascunho = (id: string) => `guarusolar.tecnico.rascunho.${id}`;

function lerRascunho(id: string): Rascunho | null {
  try {
    const texto = localStorage.getItem(chaveRascunho(id));
    return texto ? (JSON.parse(texto) as Rascunho) : null;
  } catch {
    return null;
  }
}
function gravarRascunho(id: string, rascunho: Rascunho | null) {
  try {
    if (rascunho) localStorage.setItem(chaveRascunho(id), JSON.stringify(rascunho));
    else localStorage.removeItem(chaveRascunho(id));
  } catch {
    /* armazenamento bloqueado: o rascunho vive só enquanto a tela está aberta */
  }
}

/** "Hoje, 28/09", "Amanhã, 29/09" ou "quarta, 30/09"; período quando tem vários dias. */
const quando = (inicio: string, fim: string) => {
  const hoje = diaDeHoje();
  const nome = (d: string) =>
    d === hoje ? `Hoje, ${diaMes(d)}` : d === somarDias(hoje, 1) ? `Amanhã, ${diaMes(d)}` : nomeLongo(d);
  return inicio === fim ? nome(inicio) : `${nome(inicio)} a ${nome(fim)}`;
};

/**
 * Serviço aberto (protótipo "Técnico — concluir serviço"): checklist de fotos, extras,
 * observações, confirmação do teste e envio para validação. As fotos vão aparecendo na hora,
 * com o estado de cada uma; o botão do rodapé diz o que falta para enviar.
 */
export function Servico() {
  const { id = '' } = useParams();
  const clienteConsultas = useQueryClient();
  const servico = useQuery({
    queryKey: ['servico', id],
    queryFn: ({ signal }) => api.get<ServicoDetalhe>(`/api/tecnico/servicos/${id}`, { signal }),
  });
  const fotos = useFotos(id);
  const localizacao = useLocalizacao();

  const [rascunho, setRascunho] = useState<Rascunho | null>(() => lerRascunho(id));
  const [enviadoAgora, setEnviadoAgora] = useState(false);
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);

  // sem rascunho no aparelho, começa pelo que o servidor já tem (ex.: serviço devolvido)
  useEffect(() => {
    if (rascunho || !servico.data) return;
    setRascunho({ observacoes: servico.data.observacoesTecnico ?? '', testado: servico.data.sistemaTestado });
  }, [rascunho, servico.data]);

  const mudarRascunho = (mudanca: Partial<Rascunho>) =>
    setRascunho((atual) => {
      const novo = { observacoes: '', testado: false, ...atual, ...mudanca };
      gravarRascunho(id, novo);
      return novo;
    });

  // Câmera (principal) e galeria (secundária): dois <input type="file"> escondidos só visualmente
  // (com display:none, algumas versões do Safari ignoram o clique programático).
  const camera = useRef<HTMLInputElement>(null);
  const galeria = useRef<HTMLInputElement>(null);
  const alvo = useRef<{ chave: string | null; posicao: Promise<Posicao | null> }>({ chave: null, posicao: Promise.resolve(null) });
  const escolherFoto = (chave: string | null, origem: 'camera' | 'galeria') => {
    // com a localização já liberada, a posição é buscada enquanto a câmera abre
    alvo.current = { chave, posicao: localizacao.paraFoto() };
    (origem === 'camera' ? camera : galeria).current?.click();
  };
  const aoEscolher = (e: ChangeEvent<HTMLInputElement>) => {
    const arquivo = e.target.files?.[0];
    e.target.value = ''; // permite escolher o mesmo arquivo de novo
    if (!arquivo) return;
    fotos.adicionar(arquivo, alvo.current.chave, alvo.current.posicao).catch((erro: unknown) =>
      toast.error(erro instanceof Error ? erro.message : 'Não foi possível guardar a foto.'),
    );
  };

  const concluir = useMutation({
    mutationFn: () =>
      api.post(`/api/tecnico/servicos/${id}/concluir`, {
        observacoesTecnico: rascunho?.observacoes.trim() || undefined,
        // só vale para os tipos que pedem o teste (visita técnica não tem sistema para testar)
        sistemaTestado: servico.data && ROTEIRO_DO_SERVICO[servico.data.tipo].exigeTesteDoSistema ? (rascunho?.testado ?? false) : false,
      }),
    meta: { erroTratadoNaTela: true },
    // sem sinal, falha na hora com a mensagem (não fica pausado esperando): nesta versão o
    // envio para validação exige conexão; fotos e rascunho continuam guardados no aparelho
    networkMode: 'always',
    onSuccess: () => {
      gravarRascunho(id, null);
      setEnviadoAgora(true);
      void clienteConsultas.invalidateQueries({ queryKey: ['agenda'] });
      void clienteConsultas.invalidateQueries({ queryKey: ['servico', id] });
    },
    onError: (erro) =>
      setErroEnvio(
        erro instanceof ErroApi && erro.status === SEM_CONEXAO
          ? // a mensagem já diz se é o celular sem internet ou o servidor que não respondeu
            `${erro.message} As fotos e as observações estão guardadas no celular: é só enviar de novo depois.`
          : erro instanceof ErroApi
            ? erro.message
            : 'Não foi possível enviar. Tente de novo.',
      ),
  });

  const primeiroQueFalta = useRef<HTMLDivElement>(null);
  const caixaTeste = useRef<HTMLInputElement>(null);
  const campoObservacoes = useRef<HTMLTextAreaElement>(null);

  if (servico.isPending) {
    return (
      <div className="min-h-svh bg-background">
        <Cabecalho titulo="Serviço" voltarPara="/agenda" />
        <p role="status" className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" aria-hidden /> Carregando serviço…
        </p>
      </div>
    );
  }
  if (!servico.data) {
    return (
      <div className="min-h-svh bg-background">
        <Cabecalho titulo="Serviço" voltarPara="/agenda" />
        <div className="flex flex-col items-center gap-4 px-6 py-16 text-center">
          <p className="text-muted-foreground">
            {servico.error instanceof ErroApi ? servico.error.message : 'Não foi possível abrir o serviço.'}
          </p>
          <button type="button" onClick={() => servico.refetch()} className="h-12 rounded-xl px-5 font-semibold text-primary">
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  const s = servico.data;
  const { cliente } = s.projeto;
  const tipo = TIPOS_SERVICO_AGENDA[s.tipo];
  const endereco = enderecoEscrito(cliente);

  if (enviadoAgora || s.status === 'AGUARDANDO_VALIDACAO' || s.status === 'APROVADO') {
    const obrigatorias = s.checklist.filter((i) => i.obrigatoria).length;
    return (
      <div className="flex min-h-svh flex-col bg-background">
        <Cabecalho titulo={cliente.nome} subtitulo={<span className="font-mono">{s.projeto.codigo}</span>} voltarPara="/agenda" />
        <main className="flex flex-1 flex-col items-center gap-4 px-7 py-12 text-center">
          <span className="flex size-[72px] items-center justify-center rounded-full bg-[#DCF0E3] text-[#17653E]">
            <Check className="size-9" strokeWidth={2.5} aria-hidden />
          </span>
          <h2 role="status" className="text-2xl font-bold">
            {s.status === 'APROVADO' ? 'Serviço concluído' : 'Enviado para validação'}
          </h2>
          <p className="leading-relaxed text-[#3A4A5E]">
            {s.status === 'APROVADO'
              ? 'O gestor validou as fotos deste serviço.'
              : `As ${obrigatorias} fotos obrigatórias foram enviadas. Você será avisado se o gestor pedir alguma foto novamente.`}
          </p>
          <Link to="/agenda" className="flex h-12 items-center rounded-xl border bg-card px-5 font-medium">
            Voltar para a agenda
          </Link>
        </main>
      </div>
    );
  }

  // Estado de cada item do checklist: foto local (preparando/enviando/erro) vence a do servidor.
  const blocos = s.checklist.map((item) => {
    const local = [...fotos.locais].reverse().find((f) => f.chave === item.chave);
    const paraRefazer = !item.enviada ? s.fotos.find((f) => f.chave === item.chave && f.revisao === 'REFAZER') : undefined;
    let estado: EstadoBloco = item.enviada ? 'enviada' : paraRefazer ? 'refazer' : 'falta';
    if (local) estado = local.estado;
    return {
      item,
      local,
      estado,
      // a foto nova falhou, mas a anterior continua valendo no servidor
      anteriorValendo: item.enviada && local?.estado === 'erro',
      url: local?.url ?? (item.foto ? fotos.miniaturas[item.foto.id] : undefined),
      // sem cópia local, a miniatura vem do servidor (a enviada ou a que o gestor mandou refazer)
      fotoId: item.foto?.id ?? paraRefazer?.id,
      capturadaEm: item.foto?.capturadaEm ?? null,
      comentario: paraRefazer?.comentario ?? null,
    };
  });
  const obrigatorios = blocos.filter((b) => b.item.obrigatoria);
  // o que vale para enviar é o que o servidor já tem (não o estado da foto nova na tela)
  const prontas = obrigatorios.filter((b) => b.item.enviada).length;
  const faltam = obrigatorios.length - prontas;
  const emAndamento = fotos.locais.filter((f) => f.estado !== 'erro').length;
  // o que este tipo de serviço exige (compartilhado/roteiroDoServico.ts); a API confere de novo
  const roteiro = ROTEIRO_DO_SERVICO[s.tipo];
  const precisaTestar = roteiro.exigeTesteDoSistema;
  const testado = rascunho?.testado ?? false;
  const faltaTeste = precisaTestar && !testado;
  const faltaObservacao = roteiro.observacoes.obrigatorias && (rascunho?.observacoes ?? '').trim().length < 10;
  const bloqueado = faltam > 0 || faltaObservacao || faltaTeste || emAndamento > 0 || concluir.isPending;

  let rotuloBotao = 'Enviar para validação';
  const fotosEscritas = emAndamento === 1 ? '1 foto' : `${emAndamento} fotos`;
  const parado = fotos.semConexao || fotos.aguardandoServidor;
  if (emAndamento > 0) {
    rotuloBotao = fotos.semConexao
      ? `Sem sinal: ${fotosEscritas} na fila`
      : fotos.aguardandoServidor
        ? `Aguardando o servidor: ${fotosEscritas} na fila`
        : fotos.conexaoLenta
          ? 'Conexão lenta: tentando de novo'
          : `Enviando ${fotosEscritas}…`;
  }
  else if (faltam > 0) rotuloBotao = faltam === 1 ? 'Falta 1 foto obrigatória' : `Faltam ${faltam} fotos obrigatórias`;
  else if (faltaObservacao) rotuloBotao = `Preencha: ${roteiro.observacoes.rotulo.toLowerCase()}`;
  else if (faltaTeste) rotuloBotao = 'Confirme o teste do sistema';

  const extrasEnviadas = s.fotos.filter((f) => f.chave === null);
  const extrasLocais = fotos.locais.filter((f) => f.chave === null);
  const primeiraQueFalta = obrigatorios.find((b) => !b.item.enviada)?.item.chave;

  return (
    <div className="min-h-svh bg-background">
      <Cabecalho titulo="Concluir serviço" subtitulo={<span className="font-mono">{s.projeto.codigo}</span>} voltarPara="/agenda" />

      <input
        ref={camera}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={aoEscolher}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
      />
      <input ref={galeria} type="file" accept="image/*" onChange={aoEscolher} className="sr-only" tabIndex={-1} aria-hidden />

      <main className="flex flex-col gap-3.5 px-4 pt-4 pb-44">
        {/* o tipo em destaque: é ele que define as fotos pedidas e o que o técnico veio fazer */}
        <p className={cn('flex flex-col rounded-2xl border-l-[6px] px-4 py-3', tipo.fundo, tipo.borda, tipo.texto)}>
          <span className="text-[11px] font-semibold tracking-[0.08em] uppercase">Serviço agendado</span>
          <span className="font-titulo text-2xl leading-tight font-bold">{tipo.rotulo}</span>
        </p>

        <section className="flex flex-col gap-1 rounded-2xl border bg-card p-4">
          <h2 className="font-sans text-base font-semibold tracking-normal">{cliente.nome}</h2>
          {endereco && (
            <p className="flex items-start gap-1.5 text-[13px] text-[#3A4A5E]">
              <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              {endereco}
            </p>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <SituacaoServico status={s.status} />
            <span className="rounded-full bg-[#EDF1F6] px-2.5 py-1 text-xs text-[#3A4A5E]">
              {quando(diaDaApi(s.dataInicio), diaDaApi(s.dataFim))}
            </span>
          </div>
        </section>

        {s.status === 'DEVOLVIDO' && (
          <section className="flex gap-2.5 rounded-2xl border border-destaque bg-destaque-suave p-4 text-destaque-texto">
            <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden />
            <div className="flex flex-col gap-1">
              <p className="font-semibold">O gestor pediu fotos novamente</p>
              {s.motivoDevolucao && <p className="text-sm">{s.motivoDevolucao}</p>}
            </div>
          </section>
        )}

        {/* o servidor não tem onde guardar as fotos (configuração da hospedagem): avisa antes */}
        {s.fotosBloqueadas && (
          <section role="status" className="flex gap-2.5 rounded-2xl border border-destaque bg-destaque-suave p-4 text-destaque-texto">
            <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden />
            <div className="flex flex-col gap-1">
              <p className="font-semibold">As fotos ainda não estão sendo recebidas</p>
              <p className="text-sm">{s.fotosBloqueadas}</p>
            </div>
          </section>
        )}

        {/* só um serviço do projeto anda por vez: a API recusa a primeira foto enquanto isso */}
        {s.status === 'AGENDADO' && s.aguardandoOutro && (
          <section role="status" className="flex gap-2.5 rounded-2xl border border-destaque bg-destaque-suave p-4 text-destaque-texto">
            <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden />
            <div className="flex flex-col gap-1">
              <p className="font-semibold">Este serviço ainda não pode começar</p>
              <p className="text-sm">{s.aguardandoOutro}</p>
            </div>
          </section>
        )}

        <AvisoLocalizacao estado={localizacao.estado} onPermitir={localizacao.pedir} />

        {obrigatorios.length > 0 && (
          <section aria-label="Progresso das fotos" className="flex flex-col gap-2.5 rounded-2xl border bg-card p-4">
            <div className="flex items-baseline justify-between">
              <span className="text-[15px] font-semibold">Fotos obrigatórias</span>
              <span className="font-mono text-sm">
                {prontas} de {obrigatorios.length}
              </span>
            </div>
            <div
              role="progressbar"
              aria-label="Fotos obrigatórias enviadas"
              aria-valuemin={0}
              aria-valuemax={obrigatorios.length}
              aria-valuenow={prontas}
              className="h-2 overflow-hidden rounded-full bg-[#EDF1F6]"
            >
              <div className="h-2 rounded-full bg-primary transition-[width]" style={{ width: `${(prontas / obrigatorios.length) * 100}%` }} />
            </div>
            <p className="text-xs text-muted-foreground">Toque em cada item para tirar a foto.</p>
          </section>
        )}

        <div className="grid grid-cols-2 gap-3">
          {blocos.map((b) => (
            <div key={b.item.chave} ref={b.item.chave === primeiraQueFalta ? primeiroQueFalta : undefined} className="scroll-mt-24">
              <BlocoFoto
                rotulo={b.item.rotulo}
                opcional={!b.item.obrigatoria}
                estado={b.estado}
                url={b.url}
                fotoId={b.fotoId}
                capturadaEm={b.capturadaEm}
                comentario={b.comentario}
                erro={b.local?.erro}
                anteriorValendo={b.anteriorValendo}
                onCamera={() => escolherFoto(b.item.chave, 'camera')}
                onGaleria={() => escolherFoto(b.item.chave, 'galeria')}
                onTentarDeNovo={b.local?.preparada ? () => fotos.tentarDeNovo(b.local!.idLocal) : undefined}
              />
            </div>
          ))}
        </div>

        <FotosExtras
          enviadas={extrasEnviadas.map((f) => ({ id: f.id, url: fotos.miniaturas[f.id], refazer: f.revisao === 'REFAZER' }))}
          locais={extrasLocais}
          onCamera={() => escolherFoto(null, 'camera')}
          onGaleria={() => escolherFoto(null, 'galeria')}
          onTentarDeNovo={fotos.tentarDeNovo}
          onDescartar={fotos.descartar}
        />

        <label className="flex flex-col gap-1.5 text-sm font-medium text-[#3A4A5E]">
          <span>
            {roteiro.observacoes.rotulo}
            {roteiro.observacoes.obrigatorias && <span className="font-normal text-destaque-texto"> (obrigatório)</span>}
          </span>
          <textarea
            ref={campoObservacoes}
            rows={roteiro.observacoes.obrigatorias ? 5 : 3}
            value={rascunho?.observacoes ?? ''}
            onChange={(e) => mudarRascunho({ observacoes: e.target.value })}
            placeholder={roteiro.observacoes.obrigatorias ? roteiro.observacoes.dica : 'Ex.: ajuste no telhado, cabo extra usado, orientação ao cliente…'}
            aria-required={roteiro.observacoes.obrigatorias}
            className="resize-y rounded-xl border border-input bg-card p-3 leading-snug text-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30"
          />
        </label>

        {precisaTestar && (
        <label className="flex min-h-12 cursor-pointer items-start gap-3 py-1 text-sm leading-snug">
          <input
            ref={caixaTeste}
            type="checkbox"
            checked={testado}
            onChange={(e) => mudarRascunho({ testado: e.target.checked })}
            className="mt-px size-6 shrink-0 accent-primary"
          />
          {s.tipo === 'INSTALACAO'
            ? 'Sistema testado, inversor gerando e cliente orientado'
            : 'Serviço conferido e cliente orientado'}
        </label>
        )}
      </main>

      <footer className="fixed inset-x-0 bottom-0 z-20 flex flex-col gap-2 border-t bg-card px-4 pt-3.5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        {erroEnvio && (
          <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {erroEnvio}
          </p>
        )}
        <button
          type="button"
          aria-disabled={bloqueado}
          onClick={() => {
            setErroEnvio(null);
            if (!bloqueado) return concluir.mutate();
            // bloqueado: leva o técnico direto ao que falta, em vez de só não fazer nada
            if (emAndamento > 0 || concluir.isPending) return;
            const suave = !matchMedia('(prefers-reduced-motion: reduce)').matches;
            const alvo = faltam > 0 ? primeiroQueFalta.current : faltaObservacao ? campoObservacoes.current : caixaTeste.current;
            alvo?.scrollIntoView({ behavior: suave ? 'smooth' : 'auto', block: 'center' });
            // o foco vai junto, para quem usa leitor de tela ou teclado
            (faltam > 0 ? alvo?.querySelector('button') : alvo)?.focus({ preventScroll: true });
          }}
          className={cn(
            'flex h-14 items-center justify-center gap-2 rounded-2xl text-base font-semibold transition-colors',
            bloqueado ? 'bg-[#D9E0EA] text-[#414F60]' : 'bg-primary text-primary-foreground active:bg-primary/90',
          )}
        >
          {(concluir.isPending || (emAndamento > 0 && !parado)) && (
            <Loader2 className="size-5 animate-spin" aria-hidden />
          )}
          {concluir.isPending ? 'Enviando…' : rotuloBotao}
        </button>
        <p className="text-center text-xs text-muted-foreground">
          {emAndamento > 0 && (parado || fotos.conexaoLenta)
            ? `As fotos estão guardadas no celular e sobem sozinhas quando ${fotos.semConexao ? 'o sinal voltar' : fotos.aguardandoServidor ? 'o servidor responder' : 'a conexão melhorar'}.`
            : 'O gestor recebe as fotos para validar antes de concluir o serviço.'}
        </p>
      </footer>
    </div>
  );
}

/**
 * Pede a localização num toque próprio (nunca junto com a câmera). Com a permissão já dada,
 * não aparece nada; recusada, explica que as fotos seguem sem o local.
 */
function AvisoLocalizacao({
  estado,
  onPermitir,
}: {
  estado: EstadoLocalizacao;
  onPermitir: () => Promise<Posicao | null>;
}) {
  const [pedindo, setPedindo] = useState(false);
  if (estado === 'perguntar') {
    return (
      <section className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
        <p className="flex gap-2.5 text-sm">
          <LocateFixed className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
          Registre onde cada foto foi tirada: o gestor confere se o serviço foi feito no endereço.
        </p>
        <button
          type="button"
          disabled={pedindo}
          onClick={async () => {
            setPedindo(true);
            await onPermitir();
            setPedindo(false);
          }}
          className="flex h-12 items-center justify-center gap-2 rounded-xl border border-primary/40 font-semibold text-primary disabled:opacity-60"
        >
          {pedindo && <Loader2 className="size-4 animate-spin" aria-hidden />}
          Permitir localização
        </button>
      </section>
    );
  }
  if (estado === 'negada') {
    return (
      <p className="flex gap-2 rounded-2xl border bg-card px-4 py-3 text-xs text-muted-foreground">
        <LocateFixed className="size-4 shrink-0" aria-hidden />
        Localização bloqueada: as fotos seguem sem o local. Para registrar, libere a localização
        deste site nas configurações do navegador.
      </p>
    );
  }
  return null;
}
