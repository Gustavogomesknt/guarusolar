import { useRef, useState } from 'react';
import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ImageOff, Loader2, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import { formatarDataHora, formatarHora, ROTULO_UNIDADE } from '@guarusolar/compartilhado';
import { api, ErroApi, urlDaFoto } from '@guarusolar/web/api';
import { ImagemProtegida } from '@guarusolar/web/ImagemProtegida';
import { TIPOS_SERVICO_AGENDA } from '@guarusolar/web/tiposServico';
import type { FotoEmValidacao, ServicoEmValidacao, ServicoNaFila } from '@/lib/tipos';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FotoAmpliada } from './FotoAmpliada';
import { CHAVE_FILA } from './fila';
import { BotoesMarcacao, marcacaoInicial, rotuloDaFoto, type Marcacao } from './marcacao';

const linkDoMapa = (f: FotoEmValidacao) =>
  f.latitude && f.longitude ? `https://www.google.com/maps/search/?api=1&query=${f.latitude},${f.longitude}` : null;

/**
 * Serviço aberto na validação (protótipo "Gestor — validação do serviço"). O gestor marca
 * cada foto como OK ou Refazer; com alguma para refazer, o botão principal vira "Devolver ao
 * técnico (N)" e pede o motivo. Sem nenhuma, "Aprovar e concluir serviço" (com confirmação:
 * conclui o projeto). O componente é recriado a cada serviço (key), zerando as marcações.
 */
export function DetalheValidacao({ id, onResolvido }: { id: string; onResolvido: (id: string) => void }) {
  const clienteConsultas = useQueryClient();
  const servico = useQuery({
    queryKey: ['validacao', 'servico', id],
    queryFn: ({ signal }) => api.get<ServicoEmValidacao>(`/api/validacao/${id}`, { signal }),
  });

  const [marcacoes, setMarcacoes] = useState<Record<string, Marcacao> | null>(null);
  const [motivo, setMotivo] = useState<string | null>(null);
  const [ampliada, setAmpliada] = useState<number | null>(null);
  const [confirmarAprovacao, setConfirmarAprovacao] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const campoMotivo = useRef<HTMLTextAreaElement>(null);

  const dados = servico.data;
  // marcações e motivo começam pelo que está no banco (serviço devolvido já vem marcado)
  const marcas = marcacoes ?? Object.fromEntries((dados?.fotos ?? []).map((f) => [f.id, marcacaoInicial(f)]));
  const textoMotivo = motivo ?? (dados?.status === 'DEVOLVIDO' ? (dados.motivoDevolucao ?? '') : '');
  const marcar = (fotoId: string, marcacao: Marcacao) => {
    setMarcacoes({ ...marcas, [fotoId]: marcacao });
    setErro(null);
  };

  const resolvido = (mensagem: string, novoStatus: 'APROVADO' | 'DEVOLVIDO') => {
    toast.success(mensagem);
    // A fila muda na hora (aprovado sai, devolvido desce para "Devolvidos") e só depois é
    // recarregada. Sem isso, até a recarga chegar, a página ainda veria o serviço como
    // aguardando e o reabriria como "próximo".
    clienteConsultas.setQueryData<ServicoNaFila[]>(CHAVE_FILA, (fila) =>
      novoStatus === 'APROVADO'
        ? fila?.filter((s) => s.id !== id)
        : fila?.map((s) => (s.id === id ? { ...s, status: 'DEVOLVIDO', reenviado: false } : s)),
    );
    void clienteConsultas.invalidateQueries({ queryKey: ['validacao'] });
    void clienteConsultas.invalidateQueries({ queryKey: ['agenda'] });
    onResolvido(id);
  };
  const avisarErro = (e: unknown) =>
    setErro(e instanceof ErroApi ? e.message : 'Não foi possível concluir. Tente de novo.');

  const aprovar = useMutation({
    mutationFn: (confirmarFotosMarcadas: boolean) =>
      api.post(`/api/validacao/${id}/aprovar`, { confirmarFotosMarcadas }),
    meta: { erroTratadoNoFormulario: true },
    onSuccess: () => {
      setConfirmarAprovacao(false);
      resolvido(`Serviço de ${dados?.projeto.cliente.nome} aprovado. Projeto ${dados?.projeto.codigo} concluído.`, 'APROVADO');
    },
    onError: (e) => {
      setConfirmarAprovacao(false);
      avisarErro(e);
    },
  });
  const devolver = useMutation({
    mutationFn: (corpo: { motivo: string; fotosParaRefazer: string[] }) => api.post(`/api/validacao/${id}/devolver`, corpo),
    meta: { erroTratadoNoFormulario: true },
    onSuccess: (_r, corpo) =>
      resolvido(
        `Devolvido ao técnico: ${corpo.fotosParaRefazer.length === 1 ? '1 foto' : `${corpo.fotosParaRefazer.length} fotos`} para refazer.`,
        'DEVOLVIDO',
      ),
    onError: avisarErro,
  });

  if (servico.isPending) {
    return (
      <section className="flex items-center justify-center gap-2 rounded-2xl border bg-card p-10 text-sm text-muted-foreground" role="status">
        <Loader2 className="size-4 animate-spin" aria-hidden /> Carregando serviço…
      </section>
    );
  }
  if (!dados) {
    return (
      <section className="rounded-2xl border bg-card p-10 text-center text-sm text-muted-foreground">
        {servico.error instanceof ErroApi ? servico.error.message : 'Não foi possível abrir o serviço.'}
      </section>
    );
  }

  const tipo = TIPOS_SERVICO_AGENDA[dados.tipo];
  const cliente = dados.projeto.cliente;
  const cidade = [cliente.cidade, cliente.uf].filter(Boolean).join('/');
  const devolvido = dados.status === 'DEVOLVIDO';
  // técnico: o responsável do agendamento; sem ele, quem enviou a última foto
  const tecnico = dados.tecnicoResponsavel?.nome ?? dados.fotos.at(-1)?.enviadaPor.nome;

  const paraRefazer = dados.fotos.filter((f) => marcas[f.id] === 'refazer');
  const conferidas = dados.fotos.filter((f) => marcas[f.id] === 'ok').length;
  const marcadasNoBanco = dados.fotos.filter((f) => f.revisao === 'REFAZER').length;
  const ocupado = aprovar.isPending || devolver.isPending;

  const acaoPrincipal = () => {
    setErro(null);
    if (paraRefazer.length === 0) return setConfirmarAprovacao(true);
    if (textoMotivo.trim().length < 5) {
      setErro('Escreva o motivo da devolução: o técnico recebe esta mensagem no celular.');
      return campoMotivo.current?.focus();
    }
    devolver.mutate({ motivo: textoMotivo.trim(), fotosParaRefazer: paraRefazer.map((f) => f.id) });
  };

  let dica = 'Nenhuma foto enviada.';
  if (dados.fotos.length > 0) {
    dica =
      paraRefazer.length > 0
        ? `${paraRefazer.length === 1 ? '1 foto marcada' : `${paraRefazer.length} fotos marcadas`} para refazer`
        : conferidas === dados.fotos.length
          ? 'Todas as fotos conferidas'
          : `${conferidas} de ${dados.fotos.length} fotos conferidas`;
  }

  return (
    <section aria-labelledby="titulo-servico" className="flex min-w-0 flex-col gap-5 rounded-2xl border bg-card p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-[13px] text-muted-foreground">
            <span className="font-mono">{dados.projeto.codigo}</span> · {tipo.rotulo}
            {cidade && ` · ${cidade}`}
          </p>
          <h2 id="titulo-servico" className="text-[28px] leading-tight font-bold">
            {cliente.nome}
          </h2>
        </div>
        <span
          className={cn(
            'rounded-full px-3 py-1.5 text-[13px] font-semibold',
            devolvido ? 'bg-[#F8E0DD] text-[#A3231B]' : 'bg-[#FDEBD6] text-[#8A4B07]',
          )}
        >
          {devolvido ? 'Devolvido ao técnico' : 'Aguardando validação'}
        </span>
      </div>

      {devolvido && (
        <p className="flex gap-2 rounded-xl border border-[#F0C2BD] bg-[#FDF3F2] px-4 py-3 text-sm text-[#7A1C15]">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            Aguardando nova foto do técnico.
            {dados.motivoDevolucao && <> Motivo enviado: “{dados.motivoDevolucao}”</>} Você ainda pode mudar as
            marcações e devolver de novo, ou aprovar aceitando as fotos atuais.
          </span>
        </p>
      )}

      <dl className="grid grid-cols-2 gap-4 rounded-xl bg-[#F8FAFD] px-4 py-3.5 text-[13px] 2xl:grid-cols-4">
        <div className="flex flex-col gap-0.5">
          <dt className="text-muted-foreground">Técnico responsável</dt>
          <dd className="font-medium">
            {tecnico ?? '—'} <span className="font-normal text-muted-foreground">· {dados.equipe.nome}</span>
          </dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-muted-foreground">Enviado em</dt>
          <dd className="font-medium">{dados.enviadoEm ? formatarDataHora(dados.enviadoEm) : '—'}</dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-muted-foreground">Projeto e orçamento</dt>
          <dd className="flex flex-wrap gap-x-2">
            <Link to={`/projetos/${dados.projetoId}`} className="font-mono font-medium text-primary hover:underline">
              {dados.projeto.codigo}
            </Link>
            <Link to={`/orcamentos/${dados.projeto.orcamento.id}`} className="font-mono font-medium text-primary hover:underline">
              {dados.projeto.orcamento.codigo}
            </Link>
          </dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-muted-foreground">Teste do sistema</dt>
          <dd className={cn('font-medium', dados.sistemaTestado ? 'text-[#17653E]' : 'text-[#A3231B]')}>
            {dados.sistemaTestado ? 'Confirmado pelo técnico' : 'Não confirmado'}
          </dd>
        </div>
      </dl>

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-semibold">Fotos do serviço</h3>
        <span className="text-[13px] text-muted-foreground">Marque “Refazer” nas fotos que precisam ser enviadas de novo</span>
      </div>

      {dados.fotos.length === 0 ? (
        <p className="text-sm text-muted-foreground">O técnico não enviou fotos.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-4 xl:grid-cols-3">
          {dados.fotos.map((foto, indice) => (
            <CartaoFoto
              key={foto.id}
              foto={foto}
              marcacao={marcas[foto.id]}
              onAmpliar={() => setAmpliada(indice)}
              onMarcar={(m) => marcar(foto.id, m)}
            />
          ))}
        </ul>
      )}

      {dados.observacoesTecnico && (
        <div className="flex flex-col gap-1.5 rounded-xl border px-4 py-3.5">
          <span className="text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">Observações do técnico</span>
          <p className="text-sm leading-relaxed whitespace-pre-line">{dados.observacoesTecnico}</p>
        </div>
      )}

      {dados.materiais.length > 0 && (
        <div className="flex flex-col gap-2 rounded-xl border px-4 py-3.5">
          <span className="text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">Materiais utilizados</span>
          <ul className="flex flex-col gap-1 text-sm">
            {dados.materiais.map((m) => (
              <li key={m.id} className="flex justify-between gap-4">
                <span>
                  {m.produto.nome}
                  {m.observacao && <span className="text-muted-foreground"> · {m.observacao}</span>}
                </span>
                <span className="font-mono whitespace-nowrap">
                  {Number(m.quantidade).toLocaleString('pt-BR')} {ROTULO_UNIDADE[m.produto.unidade]}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {paraRefazer.length > 0 && (
        <label className="flex flex-col gap-1.5 text-[13px] font-medium text-[#3A4A5E]">
          Motivo da devolução (o técnico recebe esta mensagem)
          <textarea
            ref={campoMotivo}
            rows={2}
            value={textoMotivo}
            onChange={(e) => {
              setMotivo(e.target.value);
              setErro(null);
            }}
            placeholder="Ex.: foto do aterramento está desfocada, refazer mostrando a haste."
            className="resize-y rounded-[10px] border border-input px-3 py-2.5 text-sm leading-snug text-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30"
          />
        </label>
      )}

      {erro && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {erro}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-end gap-3 border-t pt-4">
        <span className="mr-auto text-[13px] text-muted-foreground" aria-live="polite">
          {dica}
        </span>
        <Button
          onClick={acaoPrincipal}
          disabled={ocupado}
          className={cn(
            'h-[46px] rounded-[10px] px-5 font-semibold',
            paraRefazer.length > 0 && 'bg-[#A3231B] text-white hover:bg-[#8C1D16]',
          )}
        >
          {ocupado && <Loader2 className="animate-spin" aria-hidden />}
          {paraRefazer.length > 0 ? `Devolver ao técnico (${paraRefazer.length})` : 'Aprovar e concluir serviço'}
        </Button>
      </div>

      <FotoAmpliada
        fotos={dados.fotos}
        indice={ampliada}
        marcacoes={marcas}
        onIndice={setAmpliada}
        onMarcar={marcar}
        onFechar={() => setAmpliada(null)}
      />

      <Dialog open={confirmarAprovacao} onOpenChange={(aberto) => !aberto && !aprovar.isPending && setConfirmarAprovacao(false)}>
        <DialogContent className="bg-card sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Aprovar e concluir o serviço?</DialogTitle>
            <DialogDescription>
              {cliente.nome} · o projeto <span className="font-mono">{dados.projeto.codigo}</span> passa a{' '}
              <strong>Concluído</strong> e sai da fila de validação.
              {marcadasNoBanco > 0 &&
                ` ${marcadasNoBanco === 1 ? 'A foto que estava marcada' : `As ${marcadasNoBanco} fotos que estavam marcadas`} para refazer ${marcadasNoBanco === 1 ? 'será aceita' : 'serão aceitas'} como estão.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="h-11 rounded-[10px]" onClick={() => setConfirmarAprovacao(false)} disabled={aprovar.isPending}>
              Voltar
            </Button>
            <Button className="h-11 rounded-[10px] font-semibold" onClick={() => aprovar.mutate(marcadasNoBanco > 0)} disabled={aprovar.isPending}>
              {aprovar.isPending && <Loader2 className="animate-spin" aria-hidden />}
              Aprovar e concluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function CartaoFoto({
  foto,
  marcacao,
  onAmpliar,
  onMarcar,
}: {
  foto: FotoEmValidacao;
  marcacao?: Marcacao;
  onAmpliar: () => void;
  onMarcar: (m: Marcacao) => void;
}) {
  const rotulo = rotuloDaFoto(foto);
  const mapa = linkDoMapa(foto);
  return (
    <li
      className={cn(
        'flex flex-col gap-2 rounded-[14px] border-2 bg-card p-2',
        marcacao === 'refazer' ? 'border-[#D2463B]' : marcacao === 'ok' ? 'border-[#BFE2CC]' : 'border-border',
      )}
    >
      <button
        type="button"
        onClick={onAmpliar}
        className="relative flex h-[150px] items-center justify-center overflow-hidden rounded-[10px] bg-[#C6D5E8] text-[#2C5484] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <ImagemProtegida
          src={urlDaFoto(foto.id, 'miniatura')}
          alt=""
          className="size-full object-cover"
          carregando={<Loader2 className="size-6 animate-spin opacity-60" aria-hidden />}
          emErro={
            <span className="flex flex-col items-center gap-1 text-xs">
              <ImageOff className="size-7" aria-hidden />
              Não foi possível abrir a foto
            </span>
          }
        />
        <span className="sr-only">Ampliar: {rotulo}</span>
        {foto.capturadaEm && (
          <span className="absolute bottom-2 left-2 rounded-md bg-[#0B2F5E]/75 px-1.5 py-0.5 font-mono text-[11px] text-white">
            {formatarHora(foto.capturadaEm)}
          </span>
        )}
      </button>
      <div className="flex flex-col gap-2 px-1 pb-0.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[13px] leading-tight font-medium">{rotulo}</span>
          {mapa ? (
            <a
              href={mapa}
              target="_blank"
              rel="noreferrer"
              className="flex shrink-0 items-center gap-1 text-xs text-primary hover:underline"
            >
              <MapPin className="size-3" aria-hidden />
              Ver local
            </a>
          ) : (
            <span className="shrink-0 text-xs text-muted-foreground">Sem local</span>
          )}
        </div>
        <BotoesMarcacao rotulo={rotulo} marcacao={marcacao} onMarcar={onMarcar} largo />
      </div>
    </li>
  );
}
