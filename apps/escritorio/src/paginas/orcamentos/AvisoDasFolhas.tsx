import { useQuery } from '@tanstack/react-query';
import { useFormContext, useWatch } from 'react-hook-form';
import { Info } from 'lucide-react';
import { ROTULO_GRUPO_NA_PROPOSTA, type GrupoNaProposta } from '@guarusolar/compartilhado';
import { api } from '@guarusolar/web/api';
import { useValorAtrasado } from '@/hooks/useValorAtrasado';
import type { FormularioOrcamento } from './formulario';

/*
 * Aviso discreto, enquanto o vendedor monta os itens: com o que está marcado AGORA, a página 2 da
 * proposta (modelo novo) perde a foto de algum grupo ou passa de uma folha. A API mede com a
 * mesma função do PDF (planoDaPagina2, POST /api/orcamentos/folhas-da-proposta). Não bloqueia
 * nada; no modelo atual (`ativa: false`) não aparece.
 */

type Folhas =
  | { ativa: false }
  | { ativa: true; modo: 'cartoes' | 'reserva'; semFoto: GrupoNaProposta[]; folhas: number };

const lista = (grupos: GrupoNaProposta[]) => {
  const nomes = grupos.map((g) => ROTULO_GRUPO_NA_PROPOSTA[g]);
  return nomes.length > 1 ? `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}` : nomes[0];
};

/** O texto do aviso, ou null quando a página 2 sai como o normal (uma folha, todas as fotos). */
export function textoDoAvisoDasFolhas(f: Folhas | undefined): string | null {
  if (!f?.ativa) return null;
  if (f.modo === 'reserva') {
    const total = 2 + f.folhas;
    return f.folhas > 1
      ? `Com estes itens, a proposta passa a ter ${total} páginas: os grupos saem um embaixo do outro, sem as fotos.`
      : 'Com estes itens, os grupos da proposta saem um embaixo do outro, sem as fotos.';
  }
  if (f.semFoto.length === 0) return null;
  return f.semFoto.length === 1
    ? `Com estes itens, a foto de ${lista(f.semFoto)} sai da proposta: falta espaço no cartão.`
    : `Com estes itens, as fotos de ${lista(f.semFoto)} saem da proposta: falta espaço nos cartões.`;
}

export function AvisoDasFolhas({ orcamentoId }: { orcamentoId?: string }) {
  const { control } = useFormContext<FormularioOrcamento>();
  const [itens, cliente] = useWatch({ control, name: ['itens', 'cliente'] });
  // só o que muda o arranjo: quais itens e se aparecem (a quantidade e o preço não)
  const pedido = {
    orcamentoId,
    clienteId: cliente?.id,
    itens: (itens ?? []).map((i) => ({ produtoId: i.produtoId, apareceNaProposta: i.apareceNaProposta })),
  };
  const atrasado = useValorAtrasado(JSON.stringify(pedido), 600);
  const consulta = useQuery({
    queryKey: ['orcamentos', 'folhas-da-proposta', atrasado],
    queryFn: ({ signal }) => api.post<Folhas>('/api/orcamentos/folhas-da-proposta', JSON.parse(atrasado), { signal }),
    enabled: pedido.itens.length > 0,
    staleTime: 60_000,
    placeholderData: (anterior) => anterior,
    // é só um aviso: se a consulta falhar, ele não aparece (sem o aviso global de erro)
    meta: { erroNaTela: true },
  });
  // falhou: sem aviso (nem o da resposta anterior, que o React Query manteria em `data`)
  const texto = pedido.itens.length > 0 && !consulta.isError ? textoDoAvisoDasFolhas(consulta.data) : null;
  if (!texto) return null;
  return (
    <p role="status" className="flex items-start gap-2 rounded-[10px] bg-muted/60 px-3 py-2 text-[13px] text-muted-foreground">
      <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
      {texto}
    </p>
  );
}
