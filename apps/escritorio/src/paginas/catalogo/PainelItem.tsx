import { useEffect, useRef, useState } from 'react';
import { useBlocker } from 'react-router';
import { Controller, useForm, useWatch, type UseFormRegisterReturn } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { Loader2, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import {
  CATEGORIAS_PRODUTO,
  calcularMargem,
  formatarBRL,
  ROTULO_CATEGORIA,
  UNIDADES,
  type CategoriaProduto,
  type Unidade,
} from '@guarusolar/compartilhado';
import { api, ErroApi, tokenSalvo } from '@guarusolar/web/api';
import type { Produto } from '@/lib/tipos';
import { formatarDecimal, lerNumero } from '@/lib/formatar';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Campo, ariaDoCampo } from '@/components/Campo';

const ROTULO_UNIDADE_LONGO: Record<Unidade, string> = {
  UN: 'Unidade (un)',
  PECA: 'Peça (pç)',
  KIT: 'Kit',
  M: 'Metro (m)',
  BARRA: 'Barra',
  ROLO: 'Rolo',
  SERVICO: 'Serviço',
  KWP: 'kWp',
};

const esquema = z.object({
  nome: z.string().trim().min(3, 'Informe o nome do item (pelo menos 3 letras)'),
  categoria: z.enum(CATEGORIAS_PRODUTO),
  unidade: z.enum(UNIDADES),
  precoCusto: z.string().refine((v) => lerNumero(v || '0') >= 0, 'Informe o custo (use 0 se não houver)'),
  precoVenda: z.string().refine((v) => lerNumero(v) > 0, 'Informe o preço de venda'),
  descricaoTecnica: z.string().max(1500, 'Use no máximo 1.500 caracteres'),
  codigoFornecedor: z.string().trim().max(30, 'Use até 30 caracteres'),
  ativo: z.boolean(),
});
type DadosItem = z.infer<typeof esquema>;

function valoresDoItem(item: Produto | null): DadosItem {
  return {
    nome: item?.nome ?? '',
    categoria: item?.categoria ?? 'PAINEL_SOLAR',
    unidade: item?.unidade ?? 'UN',
    precoCusto: item ? formatarDecimal(Number(item.precoCusto)) : '',
    precoVenda: item ? formatarDecimal(Number(item.precoVenda)) : '',
    descricaoTecnica: item?.descricaoTecnica ?? '',
    codigoFornecedor: item?.codigoFornecedor ?? '',
    ativo: item?.ativo ?? true,
  };
}

const paraApi = (d: DadosItem) => ({
  nome: d.nome.trim(),
  categoria: d.categoria,
  unidade: d.unidade,
  precoCusto: lerNumero(d.precoCusto || '0'),
  precoVenda: lerNumero(d.precoVenda),
  descricaoTecnica: d.descricaoTecnica.trim() || null,
  codigoFornecedor: d.codigoFornecedor.trim() || null,
  ativo: d.ativo,
});

const CLASSE_SELECT =
  'h-11 w-full rounded-[10px] border border-input bg-card px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30';

/**
 * Painel lateral de criar/editar item do catálogo.
 * `item === null` cria; um produto edita. `aberto` controla a exibição.
 */
export function PainelItem({
  aberto,
  item,
  onFechar,
}: {
  aberto: boolean;
  item: Produto | null;
  onFechar: () => void;
}) {
  const clienteConsultas = useQueryClient();
  const [confirmarSaida, setConfirmarSaida] = useState(false);
  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isDirty },
  } = useForm<DadosItem>({ resolver: zodResolver(esquema), defaultValues: valoresDoItem(item) });

  // Ao abrir (ou trocar de item), o formulário recomeça com os dados do item
  useEffect(() => {
    if (aberto) reset(valoresDoItem(item));
  }, [aberto, item, reset]);

  const [custoTexto, vendaTexto] = useWatch({ control, name: ['precoCusto', 'precoVenda'] });
  const custo = lerNumero(custoTexto || '0');
  const venda = lerNumero(vendaTexto);
  const temPrecos = Number.isFinite(custo) && venda > 0;
  const margem = temPrecos ? calcularMargem(custo, venda) : null;
  const vendaAbaixoDoCusto = temPrecos && venda < custo;

  const salvar = useMutation({
    mutationFn: (dados: DadosItem) =>
      item ? api.put<Produto>(`/api/produtos/${item.id}`, paraApi(dados)) : api.post<Produto>('/api/produtos', paraApi(dados)),
    meta: { erroTratadoNoFormulario: true },
    onSuccess: (salvo) => {
      toast.success(item ? `${salvo.nome} atualizado` : `${salvo.nome} adicionado ao catálogo`);
      // catálogo e busca do gerador de orçamentos
      void clienteConsultas.invalidateQueries({ queryKey: ['produtos'] });
      reset(valoresDoItem(salvo));
      onFechar();
    },
    onError: (erro) => {
      if (erro instanceof ErroApi && erro.detalhes.length > 0) {
        const campos = Object.keys(valoresDoItem(null));
        erro.detalhes.forEach((d, i) => {
          if (campos.includes(d.campo)) setError(d.campo as keyof DadosItem, { message: d.mensagem }, { shouldFocus: i === 0 });
        });
        return;
      }
      if (!(erro instanceof ErroApi && erro.status === 401)) {
        toast.error(erro instanceof ErroApi ? erro.message : 'Não foi possível salvar o item.');
      }
    },
  });

  // Fechar pelo X, Esc, clique fora ou Cancelar: confirma se houver alterações
  function pedirParaFechar() {
    if (isDirty && !salvar.isPending) setConfirmarSaida(true);
    else onFechar();
  }

  // Navegar para outra tela com o painel alterado: mesma confirmação do gerador
  const alteradoRef = useRef(false);
  alteradoRef.current = aberto && isDirty;
  const bloqueio = useBlocker(
    ({ currentLocation, nextLocation }) =>
      alteradoRef.current && currentLocation.pathname !== nextLocation.pathname && tokenSalvo.ler() !== null,
  );

  const enviar = handleSubmit((dados) => salvar.mutate(dados));

  return (
    <>
      <Sheet open={aberto} onOpenChange={(abrir) => !abrir && pedirParaFechar()}>
        <SheetContent side="right" className="w-full gap-0 bg-card p-0 sm:max-w-[460px]">
          <form onSubmit={enviar} noValidate className="flex h-full flex-col">
            <SheetHeader className="gap-1 border-b px-7 pt-7 pb-5 pr-20">
              <SheetDescription className="text-[13px]">
                {item ? 'Editar item do catálogo' : 'Novo item do catálogo'}
              </SheetDescription>
              <SheetTitle className="font-titulo text-[22px] leading-tight font-bold">
                {item ? item.nome : 'Novo item'}
              </SheetTitle>
            </SheetHeader>

            <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-7 py-5">
              <Campo id="item-nome" rotulo="Nome do item" obrigatorio erro={errors.nome?.message}>
                <Input
                  {...ariaDoCampo('item-nome', errors.nome?.message)}
                  {...register('nome')}
                  placeholder="Ex.: Painel solar 550 W monocristalino"
                  className="h-11 rounded-[10px]"
                />
              </Campo>

              <Campo id="item-codigo" rotulo="Código do fornecedor" erro={errors.codigoFornecedor?.message}>
                <Input
                  {...ariaDoCampo('item-codigo', errors.codigoFornecedor?.message)}
                  {...register('codigoFornecedor')}
                  placeholder="Ex.: 113 (opcional; digitado inteiro, acha o item na busca)"
                  className="h-11 rounded-[10px] font-mono"
                />
              </Campo>

              <div className="grid grid-cols-2 gap-3">
                <Campo id="item-categoria" rotulo="Categoria" obrigatorio>
                  <select id="item-categoria" {...register('categoria')} className={CLASSE_SELECT}>
                    {CATEGORIAS_PRODUTO.map((c: CategoriaProduto) => (
                      <option key={c} value={c}>
                        {ROTULO_CATEGORIA[c]}
                      </option>
                    ))}
                  </select>
                </Campo>
                <Campo id="item-unidade" rotulo="Unidade de medida" obrigatorio>
                  <select id="item-unidade" {...register('unidade')} className={CLASSE_SELECT}>
                    {UNIDADES.map((u) => (
                      <option key={u} value={u}>
                        {ROTULO_UNIDADE_LONGO[u]}
                      </option>
                    ))}
                  </select>
                </Campo>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <CampoDinheiro
                  id="item-custo"
                  rotulo="Preço de custo"
                  erro={errors.precoCusto?.message}
                  registro={register('precoCusto')}
                />
                <CampoDinheiro
                  id="item-venda"
                  rotulo="Preço de venda padrão"
                  obrigatorio
                  destaque
                  erro={errors.precoVenda?.message}
                  registro={register('precoVenda')}
                />
              </div>

              {/* margem recalculada a cada digitação, com a mesma conta da API */}
              <div
                aria-live="polite"
                className={cn(
                  'flex flex-col gap-1 rounded-[10px] px-3.5 py-3 text-[13px]',
                  vendaAbaixoDoCusto ? 'border border-destaque bg-destaque-suave text-destaque-texto' : 'bg-[#EAF2FB] text-[#123F78]',
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <span>Margem bruta</span>
                  <span className="font-mono font-medium">
                    {margem
                      ? `${margem.margemPercentual.toLocaleString('pt-BR')}% · ${formatarBRL(margem.lucroBruto)} por unidade`
                      : '—'}
                  </span>
                </div>
                {vendaAbaixoDoCusto && (
                  <p className="flex gap-1.5">
                    <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                    Venda abaixo do custo: a margem fica negativa. Dá para salvar assim (por exemplo, numa
                    promoção).
                  </p>
                )}
              </div>

              <Campo
                id="item-descricao"
                rotulo="Descrição técnica"
                erro={errors.descricaoTecnica?.message}
                ajuda="Aparece no PDF do orçamento, abaixo do nome do item."
              >
                <Textarea
                  {...ariaDoCampo('item-descricao', errors.descricaoTecnica?.message)}
                  {...register('descricaoTecnica')}
                  rows={5}
                  placeholder="Potência, eficiência, garantia do fabricante…"
                  className="rounded-[10px] text-sm leading-relaxed"
                />
              </Campo>

              <Controller
                control={control}
                name="ativo"
                render={({ field }) => (
                  <div className="flex items-start justify-between gap-4 rounded-[10px] border px-3.5 py-3">
                    <div className="flex flex-col gap-0.5">
                      <label htmlFor="item-ativo" className="text-sm font-medium">
                        {field.value ? 'Item ativo' : 'Item desativado'}
                      </label>
                      <p id="item-ativo-ajuda" className="text-[13px] text-muted-foreground">
                        Desativado, o item deixa de aparecer na busca de novos orçamentos. Nada é apagado:
                        orçamentos que já usam o item continuam iguais.
                      </p>
                    </div>
                    <Switch
                      id="item-ativo"
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      aria-describedby="item-ativo-ajuda"
                      className="mt-0.5"
                    />
                  </div>
                )}
              />
            </div>

            <SheetFooter className="mt-0 flex-row justify-end gap-2.5 border-t px-7 py-4">
              <Button type="button" variant="outline" className="h-11 rounded-[10px] px-4" onClick={pedirParaFechar}>
                Cancelar
              </Button>
              <Button type="submit" className="h-11 rounded-[10px] px-5 font-semibold" disabled={salvar.isPending}>
                {salvar.isPending && <Loader2 className="animate-spin" aria-hidden />}
                {item ? 'Salvar alterações' : 'Adicionar ao catálogo'}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      <DialogoDescartar
        aberto={confirmarSaida || bloqueio.state === 'blocked'}
        onContinuar={() => {
          setConfirmarSaida(false);
          bloqueio.reset?.();
        }}
        onDescartar={() => {
          setConfirmarSaida(false);
          reset(valoresDoItem(item));
          if (bloqueio.state === 'blocked') bloqueio.proceed?.();
          else onFechar();
        }}
      />
    </>
  );
}

function CampoDinheiro({
  id,
  rotulo,
  obrigatorio = false,
  destaque = false,
  erro,
  registro,
}: {
  id: string;
  rotulo: string;
  obrigatorio?: boolean;
  destaque?: boolean;
  erro?: string;
  registro: UseFormRegisterReturn;
}) {
  return (
    <Campo id={id} rotulo={rotulo} obrigatorio={obrigatorio} erro={erro}>
      <div
        className={cn(
          'flex h-11 items-center gap-1.5 rounded-[10px] bg-card px-3 focus-within:ring-[3px] focus-within:ring-ring/30',
          erro ? 'border border-destructive' : destaque ? 'border-2 border-primary' : 'border border-input',
        )}
      >
        <span className="text-sm text-muted-foreground" aria-hidden>
          R$
        </span>
        <input
          {...ariaDoCampo(id, erro)}
          {...registro}
          inputMode="decimal"
          autoComplete="off"
          placeholder="0,00"
          className="h-full w-0 min-w-0 flex-1 bg-transparent font-mono text-sm outline-none"
        />
      </div>
    </Campo>
  );
}

function DialogoDescartar({
  aberto,
  onContinuar,
  onDescartar,
}: {
  aberto: boolean;
  onContinuar: () => void;
  onDescartar: () => void;
}) {
  return (
    <Dialog open={aberto} onOpenChange={(a) => !a && onContinuar()}>
      <DialogContent className="bg-card sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Descartar alterações?</DialogTitle>
          <DialogDescription>As alterações feitas neste item ainda não foram salvas.</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button variant="outline" className="h-11 rounded-[10px]" onClick={onContinuar}>
            Continuar editando
          </Button>
          <Button variant="destructive" className="h-11 rounded-[10px]" onClick={onDescartar}>
            Descartar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
