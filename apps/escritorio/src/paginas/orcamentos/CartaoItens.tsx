import { useRef, useState } from 'react';
import { Link } from 'react-router';
import { useFieldArray, useFormContext, useWatch } from 'react-hook-form';
import { useQuery } from '@tanstack/react-query';
import { ROTULO_CATEGORIA, ROTULO_UNIDADE } from '@guarusolar/compartilhado';
import { api } from '@guarusolar/web/api';
import type { Produto } from '@/lib/tipos';
import { formatarBRL, formatarQuantidade } from '@/lib/formatar';
import { useValorAtrasado } from '@/hooks/useValorAtrasado';
import { CampoBusca } from '@/components/CampoBusca';
import { LinhaItem, COLUNAS_ITENS } from './LinhaItem';
import { itemDoProduto, numeroOuZero, type FormularioOrcamento } from './formulario';

const MINIMO_BUSCA = 2;

export function CartaoItens({ subtotal }: { subtotal: number }) {
  const {
    control,
    getValues,
    setValue,
    clearErrors,
    formState: { errors },
  } = useFormContext<FormularioOrcamento>();
  const erroItens = errors.root?.itens?.message;
  const { fields, append, remove } = useFieldArray({ control, name: 'itens' });
  const itens = useWatch({ control, name: 'itens' });
  const [termo, setTermo] = useState('');
  const campoBusca = useRef<HTMLInputElement>(null);

  const termoBusca = useValorAtrasado(termo.trim(), 300);
  const busca = useQuery({
    queryKey: ['produtos', 'busca', termoBusca],
    queryFn: ({ signal }) =>
      api.get<Produto[]>(`/api/produtos?q=${encodeURIComponent(termoBusca)}`, { signal }),
    enabled: termoBusca.length >= MINIMO_BUSCA,
    staleTime: 60_000,
  });
  const atualizando = termo.trim() !== termoBusca || busca.isFetching;

  function adicionar(produto: Produto) {
    const indice = getValues('itens').findIndex((i) => i.produtoId === produto.id);
    if (indice >= 0) {
      // já está no orçamento: soma 1 em vez de repetir a linha
      const atual = numeroOuZero(getValues(`itens.${indice}.quantidade`));
      setValue(`itens.${indice}.quantidade`, formatarQuantidade(atual + 1), { shouldDirty: true });
    } else {
      // sem foco na linha nova: o vendedor continua na busca para adicionar o próximo item
      append(itemDoProduto(produto), { shouldFocus: false });
    }
    clearErrors('root.itens');
    setTermo('');
    campoBusca.current?.focus();
  }

  const quantidadeNoOrcamento = (produtoId: string) => {
    const item = itens.find((i) => i.produtoId === produtoId);
    return item ? item.quantidade : null;
  };
  const totalUnidades = itens.reduce((soma, i) => soma + numeroOuZero(i.quantidade), 0);

  return (
    <section aria-labelledby="titulo-itens" className="flex flex-col gap-3.5 rounded-[14px] border bg-card px-6 py-[22px]">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="titulo-itens" className="text-xl font-bold">
          2. Itens do orçamento
        </h2>
        <p className="text-[13px] text-muted-foreground" aria-live="polite">
          {fields.length} {fields.length === 1 ? 'item' : 'itens'} · {formatarQuantidade(totalUnidades)}{' '}
          {totalUnidades === 1 ? 'unidade' : 'unidades'}
        </p>
      </div>

      <div className="busca-catalogo">
        <CampoBusca<Produto>
          inputRef={campoBusca}
          destacado
          rotulo="Adicionar item do catálogo"
          placeholder="Busque por nome ou código: painel, disjuntor, 113…"
          dica="Enter adiciona"
          termo={termo}
          onTermoChange={setTermo}
          resultados={termoBusca === termo.trim() ? busca.data : undefined}
          carregando={termo.trim().length >= MINIMO_BUSCA && atualizando}
          minimo={MINIMO_BUSCA}
          chave={(p) => p.id}
          onEscolher={adicionar}
          renderItem={(p) => {
            const noOrcamento = quantidadeNoOrcamento(p.id);
            return (
              <div className="grid grid-cols-[minmax(0,1fr)_120px_110px] items-center gap-3">
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-sm font-medium">{p.nome}</span>
                  <span className="text-xs text-muted-foreground">
                    {p.codigoFornecedor && <span className="font-mono">Cód. {p.codigoFornecedor} · </span>}
                    {ROTULO_CATEGORIA[p.categoria]} · por {ROTULO_UNIDADE[p.unidade]}
                    {noOrcamento && ` · já no orçamento (${noOrcamento})`}
                  </span>
                </span>
                <span className="text-right font-mono text-sm">{formatarBRL(Number(p.precoVenda))}</span>
                <span className="justify-self-end text-[13px] font-semibold text-primary" aria-hidden>
                  + Adicionar
                </span>
              </div>
            );
          }}
          vazio={
            <>
              Nenhum item encontrado no catálogo.{' '}
              <Link to="/catalogo" className="font-medium text-primary underline-offset-2 hover:underline">
                Cadastrar novo item
              </Link>
            </>
          }
        />
      </div>

      {fields.length === 0 ? (
        <p
          role={erroItens ? 'alert' : undefined}
          className={
            erroItens
              ? 'rounded-xl border border-dashed border-destructive px-4 py-8 text-center text-sm text-destructive'
              : 'rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground'
          }
        >
          {erroItens ?? 'Nenhum item ainda. Busque no catálogo acima para adicionar.'}
        </p>
      ) : (
        <div role="table" aria-label="Itens do orçamento">
          <div
            role="row"
            className={`grid ${COLUNAS_ITENS} gap-3 pt-2 pb-2 text-xs font-semibold tracking-[0.06em] text-muted-foreground uppercase`}
          >
            <span role="columnheader">Item</span>
            <span role="columnheader">Qtd.</span>
            <span role="columnheader">Preço unit.</span>
            <span role="columnheader" className="text-right">
              Subtotal
            </span>
            <span role="columnheader">
              <span className="sr-only">Remover</span>
            </span>
          </div>
          <div role="rowgroup">
            {fields.map((campo, indice) => (
              <LinhaItem key={campo.id} indice={indice} onRemover={() => remove(indice)} />
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between border-t pt-3.5 text-sm">
        <span className="text-muted-foreground">Subtotal dos itens</span>
        <span className="font-mono text-base font-medium">{formatarBRL(subtotal)}</span>
      </div>
    </section>
  );
}
