import { useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@guarusolar/web/api';
import type { Cliente } from '@/lib/tipos';
import { textoDoErro } from '@/lib/consultas';
import { documentoParaExibir, mascararTelefone } from '@/lib/formatar';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { BuscaDeCliente } from './CartaoCliente';

/*
 * Duplicar orçamento (lista e cabeçalho do gerador, em qualquer status): a janela só pergunta o
 * CLIENTE da cópia, começando pelo do original (em branco se ele foi desativado). A cópia é montada
 * pela API (POST /api/orcamentos/:id/duplicar), nunca aqui; depois o gerador abre a cópia.
 */

type Duplicado = {
  id: string;
  codigo: string;
  origem: string;
  semTipo: boolean;
  prazoDescartado: boolean;
  garantiaDescartada: boolean;
};

export type OrcamentoParaDuplicar = { id: string; codigo: string; clienteId: string };

export function useDuplicarOrcamento() {
  const [orcamento, setOrcamento] = useState<OrcamentoParaDuplicar | null>(null);
  return {
    abrir: setOrcamento,
    dialogo: orcamento ? <DialogDuplicar key={orcamento.id} orcamento={orcamento} onFechar={() => setOrcamento(null)} /> : null,
  };
}

function DialogDuplicar({ orcamento, onFechar }: { orcamento: OrcamentoParaDuplicar; onFechar: () => void }) {
  const navegar = useNavigate();
  const consultas = useQueryClient();
  const original = useQuery({
    queryKey: ['clientes', 'ficha', orcamento.clienteId],
    queryFn: ({ signal }) => api.get<Cliente>(`/api/clientes/${orcamento.clienteId}`, { signal }),
    enabled: orcamento.clienteId !== '',
  });
  // undefined = ainda não mexeu: vale o cliente do original (se ativo); null = trocou e não escolheu
  const [escolhido, setEscolhido] = useState<Cliente | null | undefined>(undefined);
  const [termo, setTermo] = useState('');
  const cliente = escolhido === undefined ? (original.data?.ativo ? original.data : null) : escolhido;

  // um idCriacao por cliente escolhido nesta abertura da janela: repetir o pedido (duplo clique,
  // resposta perdida e novo clique) devolve a mesma cópia; trocar o cliente é outro pedido
  const idsDeCriacao = useRef(new Map<string, string>());
  const idCriacaoPara = (clienteId: string) => {
    if (!idsDeCriacao.current.has(clienteId)) idsDeCriacao.current.set(clienteId, crypto.randomUUID());
    return idsDeCriacao.current.get(clienteId)!;
  };

  const duplicar = useMutation({
    mutationFn: (clienteId: string) =>
      api.post<Duplicado>(`/api/orcamentos/${orcamento.id}/duplicar`, { clienteId, idCriacao: idCriacaoPara(clienteId) }),
    meta: { erroTratadoNoFormulario: true },
    onSuccess: (copia) => {
      void consultas.invalidateQueries({ queryKey: ['orcamentos'] });
      const faltam = [
        copia.semTipo && 'Escolha o tipo de serviço: o do original foi desativado ou não existia.',
        copia.prazoDescartado && 'O prazo do original passou do limite atual: informe o prazo de novo.',
        copia.garantiaDescartada && 'A garantia do original passou do limite atual e voltou à padrão.',
      ].filter(Boolean);
      toast.success(`Cópia de ${copia.origem} criada como ${copia.codigo}`, {
        description: faltam.length > 0 ? faltam.join(' ') : 'Rascunho novo: confira e salve.',
        duration: faltam.length > 0 ? 10_000 : undefined,
      });
      onFechar();
      navegar(`/orcamentos/${copia.id}`);
    },
  });

  return (
    <Dialog open onOpenChange={(aberto) => !aberto && !duplicar.isPending && onFechar()}>
      <DialogContent className="bg-card sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Duplicar {orcamento.codigo}</DialogTitle>
          <DialogDescription>
            A cópia nasce como rascunho novo, com código próprio, os mesmos itens, valores e condições. Para qual cliente?
          </DialogDescription>
        </DialogHeader>

        {original.isLoading ? (
          <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Carregando cliente…
          </p>
        ) : cliente ? (
          <div className="flex items-center justify-between gap-3 rounded-[10px] border bg-background px-4 py-3">
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-semibold">{cliente.nome}</span>
              <span className="truncate text-xs text-muted-foreground">
                {[documentoParaExibir(cliente.documento), mascararTelefone(cliente.whatsapp), cliente.cidade].filter(Boolean).join(' · ')}
              </span>
            </span>
            <Button variant="outline" className="h-10 rounded-[10px]" onClick={() => setEscolhido(null)} disabled={duplicar.isPending}>
              Trocar
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {escolhido === undefined && original.data && !original.data.ativo && (
              <p className="text-[13px] text-muted-foreground">
                {original.data.nome}, cliente do original, está desativado. Escolha outro.
              </p>
            )}
            <BuscaDeCliente
              rotulo="Cliente da cópia"
              termo={termo}
              onTermoChange={setTermo}
              onEscolher={(c) => {
                setEscolhido(c);
                setTermo('');
              }}
              vazio={<span>Nenhum cliente encontrado.</span>}
            />
          </div>
        )}

        {duplicar.isError && (
          <p role="alert" className="text-[13px] text-destructive">
            {textoDoErro(duplicar.error)}
          </p>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" className="h-11 rounded-[10px]" onClick={onFechar} disabled={duplicar.isPending}>
            Cancelar
          </Button>
          <Button className="h-11 rounded-[10px]" disabled={!cliente || duplicar.isPending} onClick={() => cliente && duplicar.mutate(cliente.id)}>
            {duplicar.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <Copy aria-hidden />}
            Duplicar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
