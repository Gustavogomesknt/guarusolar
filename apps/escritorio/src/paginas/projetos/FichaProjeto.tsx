import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowRight, Check, ChevronLeft, ChevronRight, ExternalLink, ImageOff, Loader2, MessageCircle } from 'lucide-react';
import {
  formatarData,
  formatarDataHora,
  formatarHora,
  intervaloEscrito,
  ROTULO_STATUS_AGENDAMENTO,
  ROTULO_TIPO_SERVICO,
  segundaDaSemana,
  type TipoEventoProjeto,
} from '@guarusolar/compartilhado';
import { api, ErroApi, urlDaApi, urlDaFoto } from '@guarusolar/web/api';
import { ImagemProtegida } from '@guarusolar/web/ImagemProtegida';
import { useSessao } from '@guarusolar/web/sessao';
import type { FichaDoProjeto, FotoDoProjeto } from '@/lib/tipos';
import { formatarBRL, formatarDecimal, lerNumero, mascararCep, mascararDocumento, mascararTelefone } from '@/lib/formatar';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Selo } from '@/components/Selo';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SeloProjeto } from './SeloProjeto';

type Ficha = FichaDoProjeto;
type Servico = Ficha['agendamentos'][number];

const dia = (iso: string) => iso.slice(0, 10);
const periodo = (s: Pick<Servico, 'dataInicio' | 'dataFim'>) => intervaloEscrito(dia(s.dataInicio), dia(s.dataFim));
const agendaDaSemana = (s: Servico) => `/agenda?semana=${segundaDaSemana(dia(s.dataInicio))}`;

/**
 * Ficha do projeto (a obra do começo ao fim). Agendar e validar continuam na Agenda e na
 * Validação: daqui só se leva até lá. O que só existe aqui: potência e observações internas, e
 * cancelar a obra antes da execução. O comercial vê tudo, menos fotos (regra 6), sem ações.
 */
export function FichaProjeto() {
  const { id = '' } = useParams();
  const { usuario } = useSessao();
  const gestor = usuario?.papel === 'GESTOR' || usuario?.papel === 'ADMIN';
  const [cancelando, setCancelando] = useState(false);

  const ficha = useQuery({
    queryKey: ['projetos', 'ficha', id],
    queryFn: ({ signal }) => api.get<Ficha>(`/api/projetos/${id}`, { signal }),
  });

  if (ficha.isPending) {
    return (
      <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden /> Carregando projeto…
      </p>
    );
  }
  if (ficha.isError) {
    const naoExiste = ficha.error instanceof ErroApi && ficha.error.status === 404;
    return (
      <div className="flex flex-col items-start gap-3">
        <h1 className="text-2xl font-bold">{naoExiste ? 'Projeto não encontrado' : 'Não foi possível abrir o projeto'}</h1>
        <Button asChild variant="outline" className="h-11 rounded-[10px]">
          <Link to="/projetos">Voltar para a lista</Link>
        </Button>
      </div>
    );
  }

  const p = ficha.data;
  const atual = [...p.agendamentos].reverse().find((s) => s.status !== 'CANCELADO') ?? null;
  const podeCancelar = gestor && (p.status === 'AGUARDANDO_AGENDAMENTO' || p.status === 'AGENDADO');
  const nomeCliente = p.orcamento.clienteNome ?? p.cliente.nome;

  return (
    <div className="flex flex-col gap-[22px]">
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div className="flex min-w-0 flex-col gap-1">
          <nav aria-label="Caminho" className="text-[13px] text-muted-foreground">
            <Link to="/projetos" className="hover:underline">
              Projetos
            </Link>{' '}
            <span aria-hidden>/</span> <span aria-current="page">{p.codigo}</span>
          </nav>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-mono text-[30px] font-bold tracking-[-0.02em]">{p.codigo}</h1>
            <SeloProjeto status={p.status} />
          </div>
          <p className="text-[15px] text-foreground/80">
            {nomeCliente}
            {p.orcamento.descricaoServico && <span className="text-muted-foreground"> · {p.orcamento.descricaoServico}</span>}
          </p>
        </div>
        {gestor && <AcaoPrincipal projeto={p} atual={atual} />}
      </header>

      {p.status === 'CANCELADO' && (
        <p role="status" className="rounded-xl border bg-muted px-4 py-3 text-sm text-foreground/80">
          Projeto cancelado{p.canceladoEm ? ` em ${formatarData(p.canceladoEm)}` : ''}
          {p.motivoCancelamento && <>: {p.motivoCancelamento}</>}. O orçamento continua aprovado; nada foi apagado.
        </p>
      )}

      <Etapas projeto={p} atual={atual} />

      <div className="grid gap-5 lg:grid-cols-2">
        <CartaoCliente projeto={p} />
        <CartaoOrcamento projeto={p} />
      </div>

      <Servicos projeto={p} gestor={gestor} />
      <Fotos projeto={p} />

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <DadosDoProjeto projeto={p} gestor={gestor} />
        <Historico projeto={p} />
      </div>

      {podeCancelar && (
        <div className="flex flex-wrap items-center gap-3 border-t pt-4 text-[13px] text-muted-foreground">
          <Button variant="ghost" size="sm" className="h-10 px-2 text-muted-foreground hover:text-foreground" onClick={() => setCancelando(true)}>
            Cancelar projeto
          </Button>
          <span>Para quando o cliente desiste antes da obra começar. Os serviços agendados são cancelados junto.</span>
        </div>
      )}
      <DialogCancelar projeto={p} aberto={cancelando} onAbertoChange={setCancelando} />
    </div>
  );
}

/** O próximo passo do gestor, levando à tela que resolve (sem duplicar Agenda e Validação). */
function AcaoPrincipal({ projeto: p, atual }: { projeto: Ficha; atual: Servico | null }) {
  const botao = (para: string, texto: string) => (
    <Button asChild className="h-11 rounded-[10px] font-semibold">
      <Link to={para}>
        {texto} <ArrowRight aria-hidden />
      </Link>
    </Button>
  );
  if (p.status === 'AGUARDANDO_AGENDAMENTO') return botao('/agenda', 'Agendar na agenda');
  if (p.status === 'AGENDADO' && atual) return botao(agendaDaSemana(atual), 'Ver ou remarcar na agenda');
  if ((p.status === 'AGUARDANDO_VALIDACAO' || atual?.status === 'DEVOLVIDO') && atual) {
    return botao(`/validacao?servico=${atual.id}`, 'Abrir na validação');
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// Etapas
// ---------------------------------------------------------------------------------------------

const ETAPAS: { rotulo: string; evento: TipoEventoProjeto }[] = [
  { rotulo: 'Aprovado', evento: 'PROJETO_CRIADO' },
  { rotulo: 'Agendado', evento: 'SERVICO_AGENDADO' },
  { rotulo: 'Em execução', evento: 'SERVICO_INICIADO' },
  { rotulo: 'Validação', evento: 'SERVICO_ENVIADO' },
  { rotulo: 'Concluído', evento: 'PROJETO_CONCLUIDO' },
];
const ETAPA_DO_STATUS: Record<Ficha['status'], number> = {
  AGUARDANDO_AGENDAMENTO: 0,
  AGENDADO: 1,
  EM_EXECUCAO: 2,
  AGUARDANDO_VALIDACAO: 3,
  CONCLUIDO: 4,
  CANCELADO: -1,
};

function Etapas({ projeto: p, atual }: { projeto: Ficha; atual: Servico | null }) {
  const alcancada = ETAPA_DO_STATUS[p.status];
  // data de cada etapa: o evento mais recente daquele tipo (a lista já vem do mais recente)
  const dataDa = (tipo: TipoEventoProjeto) => p.eventos.find((e) => e.tipo === tipo)?.criadoEm;
  return (
    <ol aria-label="Etapas do projeto" className="grid grid-cols-5 gap-2 rounded-[14px] border bg-card px-6 py-5">
      {ETAPAS.map((etapa, i) => {
        const feita = alcancada >= i;
        const corrente = alcancada === i;
        const quando = i === 1 && atual && alcancada >= 1 ? periodo(atual) : feita ? dataDa(etapa.evento) && formatarData(dataDa(etapa.evento)!) : null;
        return (
          <li key={etapa.rotulo} aria-current={corrente ? 'step' : undefined} className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  'flex size-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold',
                  feita ? 'border-primary bg-primary text-white' : 'border-border bg-card text-muted-foreground',
                  corrente && 'ring-4 ring-primary/20',
                )}
              >
                {feita && !corrente ? <Check className="size-4" aria-hidden /> : i + 1}
              </span>
              {i < ETAPAS.length - 1 && <span className={cn('h-0.5 flex-1 rounded', alcancada > i ? 'bg-primary' : 'bg-border')} />}
            </div>
            <span className={cn('text-sm', corrente ? 'font-semibold' : feita ? 'font-medium' : 'text-muted-foreground')}>{etapa.rotulo}</span>
            <span className="text-xs text-muted-foreground">{quando ?? (p.status === 'CANCELADO' ? '' : '·')}</span>
          </li>
        );
      })}
    </ol>
  );
}

// ---------------------------------------------------------------------------------------------
// Cartões
// ---------------------------------------------------------------------------------------------

function Cartao({ titulo, acao, children, className }: { titulo: string; acao?: React.ReactNode; children: React.ReactNode; className?: string }) {
  const idTitulo = `titulo-${titulo.toLowerCase().replace(/\W+/g, '-')}`;
  return (
    <section aria-labelledby={idTitulo} className={cn('flex flex-col gap-3.5 rounded-[14px] border bg-card px-6 py-[22px]', className)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={idTitulo} className="text-xl font-bold">
          {titulo}
        </h2>
        {acao}
      </div>
      {children}
    </section>
  );
}

function Dado({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 text-sm">
      <span className="text-xs text-muted-foreground">{rotulo}</span>
      {children}
    </div>
  );
}

/** Cliente e local: o que foi vendido (a cópia gravada no orçamento), com o cadastro ao lado. */
function CartaoCliente({ projeto: p }: { projeto: Ficha }) {
  const o = p.orcamento;
  const nome = o.clienteNome ?? p.cliente.nome;
  const whatsapp = o.clienteWhatsapp ?? p.cliente.whatsapp;
  const rua = [o.clienteLogradouro, o.clienteNumero].filter(Boolean).join(', ');
  const endereco = [rua, o.clienteComplemento, o.clienteBairro].filter(Boolean).join(' — ');
  const cidade = [[o.clienteCidade, o.clienteUf].filter(Boolean).join('/'), o.clienteCep ? `CEP ${mascararCep(o.clienteCep)}` : null].filter(Boolean).join(' · ');
  return (
    <Cartao
      titulo="Cliente e local"
      acao={
        <Link to={`/clientes/${p.cliente.id}`} className="text-[13px] font-medium text-primary underline-offset-2 hover:underline">
          Ficha do cliente
        </Link>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Dado rotulo="Cliente">
          <span className="font-semibold">{nome}</span>
          {o.clienteDocumento && <span className="font-mono text-[13px] text-muted-foreground">{mascararDocumento(o.clienteDocumento)}</span>}
        </Dado>
        <Dado rotulo="Contato">
          <a
            href={`https://wa.me/55${whatsapp.replace(/\D/g, '')}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-primary underline-offset-2 hover:underline"
          >
            <MessageCircle className="size-4" aria-hidden /> {mascararTelefone(whatsapp)}
          </a>
          <span className="text-muted-foreground">{o.clienteEmail || 'Sem e-mail'}</span>
        </Dado>
        <Dado rotulo="Endereço da instalação">
          <span>{endereco || 'Endereço não informado'}</span>
          <span className="text-muted-foreground">{cidade}</span>
        </Dado>
      </div>
      <p className="text-xs text-muted-foreground">Dados gravados no orçamento (os da proposta enviada).</p>
    </Cartao>
  );
}

function CartaoOrcamento({ projeto: p }: { projeto: Ficha }) {
  const o = p.orcamento;
  const totalCliente = Number(o.valorTotalCliente ?? o.valorTotal);
  const pdf = urlDaApi(`/api/orcamentos/${o.id}/pdf?token=${encodeURIComponent(o.tokenPdf)}`);
  return (
    <Cartao
      titulo="Orçamento de origem"
      acao={
        <a href={pdf} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-[13px] font-medium text-primary underline-offset-2 hover:underline">
          PDF da proposta <ExternalLink className="size-3.5" aria-hidden />
        </a>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Dado rotulo="Orçamento">
          <Link to={`/orcamentos/${o.id}`} className="font-mono font-semibold underline-offset-2 hover:underline">
            {o.codigo}
          </Link>
          <span className="text-muted-foreground">
            {o.aprovadoEm ? `Aprovado em ${formatarData(o.aprovadoEm)}` : 'Aprovado'} · {o.vendedor.nome}
          </span>
        </Dado>
        <Dado rotulo="Valor da proposta">
          <span className="font-mono font-semibold">{formatarBRL(Number(o.valorTotal))}</span>
          {totalCliente !== Number(o.valorTotal) && <span className="text-muted-foreground">Cliente paga {formatarBRL(totalCliente)} (com a taxa do cartão)</span>}
        </Dado>
        <Dado rotulo="Pagamento">
          <span>{o.resumoPagamento ?? '—'}</span>
        </Dado>
        <Dado rotulo="Itens">
          <span>
            {o._count.itens} {o._count.itens === 1 ? 'item' : 'itens'}
          </span>
        </Dado>
      </div>
    </Cartao>
  );
}

function Servicos({ projeto: p, gestor }: { projeto: Ficha; gestor: boolean }) {
  return (
    <Cartao titulo={`Serviços (${p.agendamentos.length})`}>
      {p.agendamentos.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhum serviço agendado ainda.{gestor && p.status === 'AGUARDANDO_AGENDAMENTO' && ' O projeto está na faixa "A agendar" da Agenda.'}
        </p>
      ) : (
        <ul className="flex flex-col divide-y">
          {[...p.agendamentos].reverse().map((s) => (
            <li key={s.id} className={cn('grid gap-3 py-3.5 first:pt-0 last:pb-0 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.2fr)]', s.status === 'CANCELADO' && 'opacity-60')}>
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-semibold">
                  {ROTULO_TIPO_SERVICO[s.tipo]} · {periodo(s)}
                </span>
                <span className="text-[13px] text-muted-foreground">
                  {s.equipe.nome}
                  {s.tecnicoResponsavel && ` · técnico ${s.tecnicoResponsavel.nome}`}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <Selo className="self-start">{ROTULO_STATUS_AGENDAMENTO[s.status]}</Selo>
                <span className="text-[13px] text-muted-foreground">
                  {s._count.fotos} {s._count.fotos === 1 ? 'foto' : 'fotos'}
                  {s.enviadoEm && ` · enviado em ${formatarDataHora(s.enviadoEm)}`}
                </span>
              </div>
              <div className="flex flex-col gap-1 text-[13px]">
                {s.validadoPor && s.validadoEm && (
                  <span>
                    {s.status === 'DEVOLVIDO' ? 'Devolvido' : 'Validado'} por {s.validadoPor.nome} em {formatarDataHora(s.validadoEm)}
                  </span>
                )}
                {s.status === 'DEVOLVIDO' && s.motivoDevolucao && <span className="text-destaque-texto">Motivo: {s.motivoDevolucao}</span>}
                {s.observacoesTecnico && <span className="text-muted-foreground">Técnico: {s.observacoesTecnico}</span>}
                {gestor && s.status === 'AGENDADO' && (
                  <Link to={agendaDaSemana(s)} className="font-medium text-primary underline-offset-2 hover:underline">
                    Ver na agenda →
                  </Link>
                )}
                {gestor && (s.status === 'AGUARDANDO_VALIDACAO' || s.status === 'DEVOLVIDO') && (
                  <Link to={`/validacao?servico=${s.id}`} className="font-medium text-primary underline-offset-2 hover:underline">
                    Abrir na validação →
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Cartao>
  );
}

// ---------------------------------------------------------------------------------------------
// Fotos (só o gestor vê; regra 6)
// ---------------------------------------------------------------------------------------------

const rotuloDaFoto = (f: FotoDoProjeto) => f.rotulo ?? (f.chave ? f.chave.replace(/_/g, ' ') : 'Foto extra');

function Fotos({ projeto: p }: { projeto: Ficha }) {
  const total = p.agendamentos.reduce((t, s) => t + s._count.fotos, 0);
  const [aberta, setAberta] = useState<{ fotos: FotoDoProjeto[]; indice: number } | null>(null);
  if (total === 0) return null;
  if (!p.podeVerFotos) {
    return (
      <Cartao titulo={`Fotos do serviço (${total})`}>
        <p className="text-sm text-muted-foreground">As fotos dos serviços ficam visíveis só para o gestor.</p>
      </Cartao>
    );
  }
  return (
    <Cartao titulo={`Fotos do serviço (${total})`}>
      {[...p.agendamentos].reverse().map((s) =>
        s.fotos && s.fotos.length > 0 ? (
          <div key={s.id} className="flex flex-col gap-2.5">
            <h3 className="text-sm font-semibold">
              {ROTULO_TIPO_SERVICO[s.tipo]} · {periodo(s)}
            </h3>
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(132px,1fr))] gap-3">
              {s.fotos.map((f, i) => (
                <li key={f.id}>
                  <button
                    type="button"
                    onClick={() => setAberta({ fotos: s.fotos!, indice: i })}
                    className="group flex w-full flex-col gap-1.5 text-left"
                    aria-label={`Ampliar foto: ${rotuloDaFoto(f)}`}
                  >
                    <span className="relative block aspect-[4/3] overflow-hidden rounded-lg border bg-muted">
                      <ImagemProtegida
                        src={urlDaFoto(f.id, 'miniatura')}
                        alt={rotuloDaFoto(f)}
                        className="size-full object-cover transition-transform group-hover:scale-[1.03]"
                        carregando={<Loader2 className="absolute inset-0 m-auto size-5 animate-spin text-muted-foreground" aria-hidden />}
                        emErro={<ImageOff className="absolute inset-0 m-auto size-5 text-muted-foreground" aria-hidden />}
                      />
                      {f.revisao === 'REFAZER' && <Selo variante="destaque" className="absolute top-1.5 left-1.5">Refazer</Selo>}
                    </span>
                    <span className="truncate text-xs text-foreground/80">{rotuloDaFoto(f)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null,
      )}
      <FotoAmpliada aberta={aberta} onIndice={(indice) => setAberta((a) => (a ? { ...a, indice } : a))} onFechar={() => setAberta(null)} />
    </Cartao>
  );
}

/** Foto ampliada só para consulta. ← e → navegam; Esc fecha (Dialog do Radix). */
function FotoAmpliada({
  aberta,
  onIndice,
  onFechar,
}: {
  aberta: { fotos: FotoDoProjeto[]; indice: number } | null;
  onIndice: (indice: number) => void;
  onFechar: () => void;
}) {
  const foto = aberta ? aberta.fotos[aberta.indice] : null;
  const ir = (passo: number) => aberta && onIndice((aberta.indice + passo + aberta.fotos.length) % aberta.fotos.length);
  return (
    <Dialog open={foto !== null} onOpenChange={(abrir) => !abrir && onFechar()}>
      {foto && aberta && (
        <DialogContent
          className="flex max-h-[94vh] flex-col gap-3 bg-card p-4 sm:max-w-[min(1100px,94vw)]"
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight') ir(1);
            else if (e.key === 'ArrowLeft') ir(-1);
            else return;
            e.preventDefault();
          }}
        >
          <div className="flex items-baseline justify-between gap-4 pr-10">
            <DialogTitle className="font-sans text-base font-semibold tracking-normal">{rotuloDaFoto(foto)}</DialogTitle>
            <DialogDescription className="font-mono text-xs">
              {aberta.indice + 1} de {aberta.fotos.length}
              {foto.capturadaEm && ` · ${formatarData(foto.capturadaEm)} ${formatarHora(foto.capturadaEm)}`}
            </DialogDescription>
          </div>
          <div className="relative flex min-h-0 flex-1 items-center justify-center rounded-lg bg-[#0B2F5E]">
            <ImagemProtegida
              key={foto.id}
              src={urlDaFoto(foto.id)}
              alt={rotuloDaFoto(foto)}
              className="max-h-[72vh] max-w-full object-contain"
              carregando={<Loader2 className="my-24 size-8 animate-spin text-white/70" aria-hidden />}
              emErro={<ImageOff className="my-24 size-8 text-white/70" aria-hidden />}
            />
            {aberta.fotos.length > 1 && (
              <>
                <Button variant="outline" size="icon" className="absolute left-3 rounded-full bg-card" onClick={() => ir(-1)} aria-label="Foto anterior">
                  <ChevronLeft aria-hidden />
                </Button>
                <Button variant="outline" size="icon" className="absolute right-3 rounded-full bg-card" onClick={() => ir(1)} aria-label="Próxima foto">
                  <ChevronRight aria-hidden />
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}

// ---------------------------------------------------------------------------------------------
// Dados do projeto (potência e observações internas) e histórico
// ---------------------------------------------------------------------------------------------

function DadosDoProjeto({ projeto: p, gestor }: { projeto: Ficha; gestor: boolean }) {
  const consultas = useQueryClient();
  const editavel = gestor && p.status !== 'CANCELADO';
  const inicialPotencia = p.potenciaKwp ? formatarDecimal(Number(p.potenciaKwp)) : '';
  const [potencia, setPotencia] = useState(inicialPotencia);
  const [observacoes, setObservacoes] = useState(p.observacoes ?? '');
  useEffect(() => {
    setPotencia(inicialPotencia);
    setObservacoes(p.observacoes ?? '');
  }, [inicialPotencia, p.observacoes]);
  const alterado = potencia !== inicialPotencia || observacoes !== (p.observacoes ?? '');
  const potenciaInvalida = potencia.trim() !== '' && !(lerNumero(potencia) >= 0);

  const salvar = useMutation({
    mutationFn: () =>
      api.patch(`/api/projetos/${p.id}`, {
        potenciaKwp: potencia.trim() === '' ? null : lerNumero(potencia),
        observacoes: observacoes.trim() || null,
      }),
    onSuccess: () => {
      toast.success('Projeto atualizado');
      void consultas.invalidateQueries({ queryKey: ['projetos'] });
    },
  });

  if (!editavel) {
    return (
      <Cartao titulo="Projeto">
        <div className="grid gap-4">
          <Dado rotulo="Potência">{p.potenciaKwp ? `${formatarDecimal(Number(p.potenciaKwp))} kWp` : '—'}</Dado>
          <Dado rotulo="Observações internas">
            <span className="whitespace-pre-line">{p.observacoes || '—'}</span>
          </Dado>
        </div>
      </Cartao>
    );
  }
  return (
    <Cartao titulo="Projeto">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!potenciaInvalida) salvar.mutate();
        }}
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="projeto-potencia" className="text-[13px] font-medium text-foreground/80">
            Potência (kWp)
          </Label>
          <Input
            id="projeto-potencia"
            inputMode="decimal"
            value={potencia}
            onChange={(e) => setPotencia(e.target.value)}
            aria-invalid={potenciaInvalida || undefined}
            aria-describedby={potenciaInvalida ? 'projeto-potencia-erro' : undefined}
            className="h-11 w-40 rounded-[10px] font-mono"
          />
          {potenciaInvalida && (
            <p id="projeto-potencia-erro" className="text-[13px] text-destructive">
              Informe um número, como 7,5
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="projeto-observacoes" className="text-[13px] font-medium text-foreground/80">
            Observações internas
          </Label>
          <Textarea
            id="projeto-observacoes"
            value={observacoes}
            onChange={(e) => setObservacoes(e.target.value)}
            rows={4}
            maxLength={2000}
            placeholder="Acesso ao local, materiais especiais, combinados com o cliente…"
            className="rounded-[10px] text-sm leading-relaxed"
          />
          <p className="text-xs text-muted-foreground">Só para a equipe da Guarusolar: não aparece no PDF.</p>
        </div>
        <Button type="submit" className="h-11 self-start rounded-[10px] font-semibold" disabled={!alterado || potenciaInvalida || salvar.isPending}>
          {salvar.isPending && <Loader2 className="animate-spin" aria-hidden />} Salvar
        </Button>
      </form>
    </Cartao>
  );
}

function Historico({ projeto: p }: { projeto: Ficha }) {
  const algumReconstruido = p.eventos.some((e) => e.reconstruido);
  return (
    <Cartao titulo="Histórico">
      {p.eventos.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nada registrado ainda.</p>
      ) : (
        <ol className="flex flex-col">
          {p.eventos.map((e) => (
            <li key={e.id} className="grid grid-cols-[132px_minmax(0,1fr)] gap-3 border-b py-2.5 text-[13px] last:border-b-0">
              <time dateTime={e.criadoEm} className="font-mono text-xs text-muted-foreground">
                {formatarDataHora(e.criadoEm)}
              </time>
              <span className="flex flex-col gap-0.5">
                <span>{e.descricao}</span>
                <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {e.usuario?.nome ?? (e.reconstruido ? 'Autor não registrado' : 'Sistema')}
                  {e.reconstruido && <Selo>Reconstruído</Selo>}
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}
      {algumReconstruido && (
        <p className="text-xs text-muted-foreground">
          "Reconstruído": montado a partir das datas que o sistema já guardava, antes de existir este histórico. Remarcações e devoluções
          antigas não foram registradas.
        </p>
      )}
    </Cartao>
  );
}

// ---------------------------------------------------------------------------------------------
// Cancelar
// ---------------------------------------------------------------------------------------------

function DialogCancelar({ projeto: p, aberto, onAbertoChange }: { projeto: Ficha; aberto: boolean; onAbertoChange: (aberto: boolean) => void }) {
  const consultas = useQueryClient();
  const [motivo, setMotivo] = useState('');
  const agendados = p.agendamentos.filter((s) => s.status === 'AGENDADO');
  const cancelar = useMutation({
    mutationFn: () => api.post(`/api/projetos/${p.id}/cancelar`, { motivo: motivo.trim() }),
    onSuccess: () => {
      toast.success(`Projeto ${p.codigo} cancelado`);
      onAbertoChange(false);
      setMotivo('');
      void consultas.invalidateQueries({ queryKey: ['projetos'] });
      void consultas.invalidateQueries({ queryKey: ['agenda'] });
    },
  });
  const curto = motivo.trim().length < 5;
  return (
    <Dialog open={aberto} onOpenChange={onAbertoChange}>
      <DialogContent className="bg-card sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cancelar o projeto {p.codigo}?</DialogTitle>
          <DialogDescription>
            O projeto sai da operação e{' '}
            {agendados.length > 0
              ? `${agendados.length === 1 ? 'o serviço agendado é cancelado' : `os ${agendados.length} serviços agendados são cancelados`} junto`
              : 'não fica mais na faixa "A agendar"'}
            . O orçamento continua aprovado e nada é apagado.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="motivo-cancelamento" className="text-[13px] font-medium">
            Motivo
          </Label>
          <Textarea
            id="motivo-cancelamento"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={3}
            placeholder="Ex.: cliente desistiu da instalação"
            className="rounded-[10px] text-sm"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" className="h-11 rounded-[10px]" onClick={() => onAbertoChange(false)}>
            Voltar
          </Button>
          <Button variant="destructive" className="h-11 rounded-[10px]" disabled={curto || cancelar.isPending} onClick={() => cancelar.mutate()}>
            {cancelar.isPending && <Loader2 className="animate-spin" aria-hidden />} Cancelar projeto
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
