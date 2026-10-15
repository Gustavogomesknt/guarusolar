import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Check, Loader2, Pencil, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { api, ErroApi } from '@guarusolar/web/api';
import type { TipoDeServico } from '@/lib/tipos';
import { textoDoErro } from '@/lib/consultas';
import { useTiposDeServico } from '@/lib/tiposDeServico';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Selo } from '@/components/Selo';

/**
 * Tipos de serviço VENDIDOS (ADMIN e GESTOR): o campo obrigatório do orçamento, que separa os
 * números do painel. Nos moldes do catálogo: nada é apagado; desativar só tira das escolhas de
 * orçamentos novos. A ordem aqui é a das escolhas e do painel.
 * Não é a ETAPA do agendamento (instalação, visita técnica, vistoria...), que fica na Agenda.
 */
export function PaginaTiposDeServico() {
  const tipos = useTiposDeServico();
  const clienteConsultas = useQueryClient();
  const [novo, setNovo] = useState('');
  const atualizar = () => clienteConsultas.invalidateQueries({ queryKey: ['tipos-de-servico'] });
  const avisarErro = (erro: unknown) => {
    if (!(erro instanceof ErroApi && erro.status === 401)) toast.error(erro instanceof ErroApi ? erro.message : 'Não foi possível salvar.');
  };

  const criar = useMutation({
    mutationFn: (nome: string) => api.post<TipoDeServico>('/api/tipos-de-servico', { nome }),
    meta: { erroTratadoNoFormulario: true },
    onSuccess: (t) => {
      toast.success(`${t.nome} adicionado`);
      setNovo('');
      return atualizar();
    },
    onError: avisarErro,
  });
  const mover = useMutation({
    mutationFn: ({ id, direcao }: { id: string; direcao: 'acima' | 'abaixo' }) => api.post(`/api/tipos-de-servico/${id}/mover`, { direcao }),
    meta: { erroTratadoNoFormulario: true },
    onSuccess: atualizar,
    onError: avisarErro,
  });

  const aoCriar = (e: FormEvent) => {
    e.preventDefault();
    if (novo.trim().length >= 3) criar.mutate(novo.trim());
  };
  const lista = tipos.data ?? [];

  return (
    <div className="flex max-w-3xl flex-col gap-[22px]">
      <header className="flex flex-col gap-1">
        <p className="text-[13px] text-muted-foreground">O que o orçamento vende; separa os números do painel</p>
        <h1 className="text-4xl font-bold tracking-[-0.02em]">Tipos de serviço</h1>
      </header>

      <form onSubmit={aoCriar} className="flex flex-wrap items-end gap-3 rounded-[14px] border bg-card p-5">
        <label className="flex min-w-[260px] flex-1 flex-col gap-1.5 text-[13px] font-medium text-foreground/80">
          Novo tipo de serviço
          <Input value={novo} onChange={(e) => setNovo(e.target.value)} maxLength={80} placeholder="Ex.: Instalação de bateria" className="h-11 rounded-[10px]" />
        </label>
        <Button type="submit" disabled={criar.isPending || novo.trim().length < 3} className="h-11 rounded-[10px] px-[18px] font-semibold">
          {criar.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <Plus aria-hidden />}
          Adicionar
        </Button>
      </form>

      <section aria-label="Tipos de serviço" className="overflow-hidden rounded-[14px] border bg-card">
        {tipos.isPending ? (
          <p role="status" className="flex items-center gap-2 px-5 py-8 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Carregando…
          </p>
        ) : tipos.isError ? (
          <p role="alert" className="px-5 py-8 text-sm text-destructive">
            Não foi possível carregar os tipos. {textoDoErro(tipos.error)}
          </p>
        ) : (
          <ol>
            {lista.map((t, i) => (
              <LinhaTipo
                key={t.id}
                tipo={t}
                primeiro={i === 0}
                ultimo={i === lista.length - 1}
                movendo={mover.isPending}
                onMover={(direcao) => mover.mutate({ id: t.id, direcao })}
                onSalvo={atualizar}
                avisarErro={avisarErro}
              />
            ))}
          </ol>
        )}
        <p className="border-t px-5 py-3.5 text-[13px] text-muted-foreground">
          Desativar só tira o tipo das escolhas de orçamentos novos: nada é apagado, e quem já o usa continua com ele.
          A etapa da execução (instalação, visita técnica, vistoria) fica na Agenda.
        </p>
      </section>
    </div>
  );
}

function LinhaTipo({
  tipo: t,
  primeiro,
  ultimo,
  movendo,
  onMover,
  onSalvo,
  avisarErro,
}: {
  tipo: TipoDeServico;
  primeiro: boolean;
  ultimo: boolean;
  movendo: boolean;
  onMover: (direcao: 'acima' | 'abaixo') => void;
  onSalvo: () => Promise<unknown>;
  avisarErro: (erro: unknown) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [nome, setNome] = useState(t.nome);
  const salvar = useMutation({
    mutationFn: (dados: { nome?: string; ativo?: boolean }) => api.put<TipoDeServico>(`/api/tipos-de-servico/${t.id}`, dados),
    meta: { erroTratadoNoFormulario: true },
    onSuccess: (salvo, dados) => {
      if (dados.ativo !== undefined) toast.success(dados.ativo ? `${salvo.nome} voltou às escolhas` : `${salvo.nome} desativado: sai das escolhas de orçamentos novos`);
      setEditando(false);
      return onSalvo();
    },
    onError: avisarErro,
  });

  return (
    <li className={cn('flex min-h-[60px] flex-wrap items-center gap-3 border-b px-5 py-2.5 last:border-b-0', !t.ativo && 'bg-background/60')}>
      <span className="flex flex-col">
        <button type="button" aria-label={`Subir ${t.nome}`} disabled={primeiro || movendo} onClick={() => onMover('acima')} className="rounded p-0.5 text-foreground/70 hover:bg-muted disabled:opacity-30">
          <ArrowUp className="size-4" aria-hidden />
        </button>
        <button type="button" aria-label={`Descer ${t.nome}`} disabled={ultimo || movendo} onClick={() => onMover('abaixo')} className="rounded p-0.5 text-foreground/70 hover:bg-muted disabled:opacity-30">
          <ArrowDown className="size-4" aria-hidden />
        </button>
      </span>
      {editando ? (
        <form
          className="flex min-w-[240px] flex-1 items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (nome.trim().length >= 3) salvar.mutate({ nome: nome.trim() });
          }}
        >
          <Input aria-label={`Novo nome de ${t.nome}`} value={nome} onChange={(e) => setNome(e.target.value)} maxLength={80} autoFocus className="h-10 rounded-[10px]" />
          <Button type="submit" size="sm" aria-label="Salvar o nome" disabled={salvar.isPending} className="h-10 rounded-[10px]">
            {salvar.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <Check aria-hidden />}
          </Button>
          <Button type="button" size="sm" variant="outline" aria-label="Cancelar" onClick={() => (setEditando(false), setNome(t.nome))} className="h-10 rounded-[10px]">
            <X aria-hidden />
          </Button>
        </form>
      ) : (
        <span className={cn('flex min-w-0 flex-1 flex-col', !t.ativo && 'opacity-60')}>
          <span className="flex items-center gap-2 text-sm font-semibold">
            {t.nome}
            {!t.ativo && <Selo>Desativado</Selo>}
          </span>
          <span className="text-xs text-muted-foreground">
            {t.usadoEmOrcamentos === 0 ? 'Ainda não usado em orçamentos' : `Usado em ${t.usadoEmOrcamentos} ${t.usadoEmOrcamentos === 1 ? 'orçamento' : 'orçamentos'}`}
          </span>
        </span>
      )}
      {!editando && (
        <Button variant="outline" size="sm" className="h-9 rounded-[8px] bg-card" onClick={() => setEditando(true)} aria-label={`Renomear ${t.nome}`}>
          <Pencil aria-hidden /> Renomear
        </Button>
      )}
      <label className="flex items-center gap-2 text-[13px] text-foreground/80">
        <Switch checked={t.ativo} disabled={salvar.isPending} onCheckedChange={(ativo) => salvar.mutate({ ativo })} aria-label={`${t.nome}: ${t.ativo ? 'ativo' : 'desativado'}`} />
        Ativo
      </label>
    </li>
  );
}
