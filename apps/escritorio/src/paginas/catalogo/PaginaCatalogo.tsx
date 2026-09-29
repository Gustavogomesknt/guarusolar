import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Package, Pencil, Plus, Search } from 'lucide-react';
import { toast } from 'sonner';
import {
  CATEGORIAS_PRODUTO,
  ROTULO_CATEGORIA,
  ROTULO_UNIDADE,
  type CategoriaProduto,
} from '@guarusolar/compartilhado';
import { api, ErroApi } from '@guarusolar/web/api';
import type { Produto } from '@/lib/tipos';
import { formatarBRL } from '@/lib/formatar';
import { useValorAtrasado } from '@/hooks/useValorAtrasado';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Selo } from '@/components/Selo';
import { PainelItem } from './PainelItem';

type FiltroCategoria = CategoriaProduto | 'TODAS';

const COLUNAS = 'grid-cols-[minmax(0,1fr)_130px_64px_120px_130px_90px_64px_40px]';

/** Abaixo disso a margem aparece em laranja (atenção), nunca em vermelho de erro. */
const MARGEM_BAIXA = 15;

export function PaginaCatalogo() {
  const [categoria, setCategoria] = useState<FiltroCategoria>('TODAS');
  const [busca, setBusca] = useState('');
  const [incluirInativos, setIncluirInativos] = useState(false);
  const [painel, setPainel] = useState<{ aberto: boolean; item: Produto | null }>({ aberto: false, item: null });
  const buscaAtrasada = useValorAtrasado(busca.trim(), 300);

  const parametros = useMemo(() => {
    const p = new URLSearchParams();
    if (buscaAtrasada) p.set('q', buscaAtrasada);
    if (categoria !== 'TODAS') p.set('categoria', categoria);
    if (incluirInativos) p.set('incluirInativos', 'true');
    return p.toString();
  }, [buscaAtrasada, categoria, incluirInativos]);

  const itens = useQuery({
    queryKey: ['produtos', 'catalogo', parametros],
    queryFn: ({ signal }) => api.get<Produto[]>(`/api/produtos?${parametros}`, { signal }),
  });

  const abrir = (item: Produto | null) => setPainel({ aberto: true, item });
  const filtrando = categoria !== 'TODAS' || buscaAtrasada !== '';

  return (
    <div className="flex flex-col gap-[22px]">
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div className="flex flex-col gap-1">
          <p className="text-[13px] text-muted-foreground">Itens pré-moldados usados nos orçamentos</p>
          <h1 className="text-4xl font-bold tracking-[-0.02em]">Catálogo de itens</h1>
        </div>
        <Button className="h-11 rounded-[10px] px-[18px] font-semibold" onClick={() => abrir(null)}>
          <Plus aria-hidden />
          Novo item
        </Button>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div role="group" aria-label="Filtrar por categoria" className="flex flex-wrap gap-2">
          {(['TODAS', ...CATEGORIAS_PRODUTO] as FiltroCategoria[]).map((c) => {
            const ativo = categoria === c;
            return (
              <button
                key={c}
                type="button"
                aria-pressed={ativo}
                onClick={() => setCategoria(c)}
                className={cn(
                  'h-10 rounded-full border px-3.5 text-[13px] font-medium transition-colors',
                  ativo ? 'border-foreground bg-foreground text-white' : 'border-input bg-card text-foreground hover:bg-muted',
                )}
              >
                {c === 'TODAS' ? 'Todos' : ROTULO_CATEGORIA[c]}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex h-10 w-[260px] items-center gap-2 rounded-[10px] border border-input bg-card px-3 text-muted-foreground focus-within:ring-[3px] focus-within:ring-ring/30">
            <Search className="size-4 shrink-0" aria-hidden />
            <span className="sr-only">Buscar item pelo nome</span>
            <input
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar item"
              className="h-full min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
          </label>
          <label htmlFor="mostrar-desativados" className="flex h-10 cursor-pointer items-center gap-2 text-[13px] text-foreground/80">
            <Switch id="mostrar-desativados" checked={incluirInativos} onCheckedChange={setIncluirInativos} />
            Mostrar desativados
          </label>
        </div>
      </div>

      <section aria-label="Itens do catálogo" className="relative overflow-x-auto rounded-[14px] border bg-card">
        <div role="table" aria-label="Itens do catálogo" className="min-w-[940px]">
          <div
            role="row"
            className={`grid ${COLUNAS} gap-3.5 border-b px-5 py-3 text-xs font-semibold tracking-[0.06em] text-muted-foreground uppercase`}
          >
            <span role="columnheader">Item</span>
            <span role="columnheader">Categoria</span>
            <span role="columnheader">Unid.</span>
            <span role="columnheader" className="text-right">
              Custo
            </span>
            <span role="columnheader" className="text-right">
              Venda padrão
            </span>
            <span role="columnheader" className="text-right">
              Margem
            </span>
            <span role="columnheader">Ativo</span>
            <span role="columnheader">
              <span className="sr-only">Editar</span>
            </span>
          </div>
          <div role="rowgroup">
            {itens.data?.map((item) => <Linha key={item.id} item={item} onEditar={() => abrir(item)} />)}
          </div>
        </div>

        {itens.isPending && (
          <p role="status" className="flex items-center justify-center gap-2 px-5 py-10 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Carregando catálogo…
          </p>
        )}
        {itens.data?.length === 0 && (
          <div className="flex flex-col items-center gap-3 px-5 py-12 text-center">
            <Package className="size-8 text-destaque" aria-hidden />
            <p className="text-sm text-muted-foreground">
              {filtrando ? 'Nenhum item encontrado com esses filtros.' : 'O catálogo ainda está vazio.'}
            </p>
            <Button className="h-11 rounded-[10px]" onClick={() => abrir(null)}>
              <Plus aria-hidden />
              {filtrando ? 'Cadastrar novo item' : 'Cadastrar o primeiro item'}
            </Button>
          </div>
        )}
        {itens.data && itens.data.length > 0 && (
          <p className="px-5 py-3.5 text-[13px] text-muted-foreground">
            Desativar um item só o tira da busca de novos orçamentos. Nada é apagado e os orçamentos
            antigos continuam iguais.
          </p>
        )}
      </section>

      <PainelItem
        aberto={painel.aberto}
        item={painel.item}
        onFechar={() => setPainel((p) => ({ ...p, aberto: false }))}
      />
    </div>
  );
}

function Linha({ item, onEditar }: { item: Produto; onEditar: () => void }) {
  const clienteConsultas = useQueryClient();
  const alternar = useMutation({
    mutationFn: (ativo: boolean) => api.patch<Produto>(`/api/produtos/${item.id}/ativo`, { ativo }),
    meta: { erroTratadoNoFormulario: true },
    onSuccess: (_r, ativo) => {
      toast.success(
        ativo
          ? `${item.nome} voltou a aparecer nos novos orçamentos`
          : `${item.nome} desativado. Não aparece mais na busca de novos orçamentos; os antigos não mudam.`,
      );
      // catálogo e busca do gerador de orçamentos
      return clienteConsultas.invalidateQueries({ queryKey: ['produtos'] });
    },
    onError: (erro) => {
      if (!(erro instanceof ErroApi && erro.status === 401)) {
        toast.error(erro instanceof ErroApi ? erro.message : 'Não foi possível alterar o item.');
      }
    },
  });

  const inativo = !item.ativo;
  const apoio = inativo
    ? 'Não aparece em novos orçamentos'
    : item.usadoEmOrcamentos > 0
      ? `Usado em ${item.usadoEmOrcamentos} ${item.usadoEmOrcamentos === 1 ? 'orçamento' : 'orçamentos'}`
      : 'Ainda não usado em orçamentos';
  const margemAtencao = item.margemPercentual < MARGEM_BAIXA;

  return (
    <div
      role="row"
      className={cn(`grid min-h-[62px] ${COLUNAS} items-center gap-3.5 border-b px-5 py-2.5`, inativo && 'bg-background/60')}
    >
      <span role="cell" className={cn('flex min-w-0 flex-col gap-0.5', inativo && 'opacity-60')}>
        <span className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={onEditar}
            className="truncate text-left text-sm font-semibold underline-offset-2 hover:underline"
          >
            {item.nome}
          </button>
          {inativo && <Selo className="shrink-0">Desativado</Selo>}
        </span>
        <span className="truncate text-xs text-muted-foreground">{apoio}</span>
      </span>
      <span role="cell" className={cn(inativo && 'opacity-60')}>
        <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-foreground/80">
          {ROTULO_CATEGORIA[item.categoria]}
        </span>
      </span>
      <span role="cell" className={cn('text-sm text-foreground/80', inativo && 'opacity-60')}>
        {ROTULO_UNIDADE[item.unidade]}
      </span>
      <span role="cell" className={cn('text-right font-mono text-sm text-foreground/80', inativo && 'opacity-60')}>
        {formatarBRL(Number(item.precoCusto))}
      </span>
      <span role="cell" className={cn('text-right font-mono text-sm font-medium', inativo && 'opacity-60')}>
        {formatarBRL(Number(item.precoVenda))}
      </span>
      <span
        role="cell"
        className={cn('text-right font-mono text-sm', margemAtencao ? 'text-destaque-texto' : 'text-foreground/80', inativo && 'opacity-60')}
        title={`Lucro bruto de ${formatarBRL(item.lucroBruto)} por unidade`}
      >
        {item.margemPercentual.toLocaleString('pt-BR')}%
        <span className="sr-only">, lucro bruto de {formatarBRL(item.lucroBruto)} por unidade</span>
      </span>
      <span role="cell" className="flex items-center">
        <Switch
          checked={item.ativo}
          disabled={alternar.isPending}
          onCheckedChange={(ativo) => alternar.mutate(ativo)}
          aria-label={`${item.nome}: ${item.ativo ? 'ativo' : 'desativado'}`}
        />
      </span>
      <span role="cell">
        <button
          type="button"
          onClick={onEditar}
          aria-label={`Editar ${item.nome}`}
          className="flex size-10 items-center justify-center rounded-[10px] border text-foreground/80 hover:bg-muted"
        >
          <Pencil className="size-4" aria-hidden />
        </button>
      </span>
    </div>
  );
}
