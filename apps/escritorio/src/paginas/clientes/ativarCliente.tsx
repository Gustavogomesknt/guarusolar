import { useState, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { api, ErroApi } from '@/lib/api';
import type { Cliente } from '@/lib/tipos';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type ClienteBasico = Pick<Cliente, 'id' | 'nome' | 'ativo'>;

/**
 * Desativar (com confirmação) e reativar cliente. Nada é apagado (regra 3): o cliente só
 * sai das buscas de novos orçamentos, e os orçamentos dele continuam como estão.
 */
export function useAtivacaoDeCliente(): { pedir: (c: ClienteBasico) => void; dialogo: ReactNode; pendenteId: string | null } {
  const clienteConsultas = useQueryClient();
  const [confirmando, setConfirmando] = useState<ClienteBasico | null>(null);

  const alternar = useMutation({
    mutationFn: ({ id, ativo }: { id: string; ativo: boolean; nome: string }) =>
      api.patch<Cliente>(`/api/clientes/${id}/ativo`, { ativo }),
    meta: { erroTratadoNoFormulario: true },
    onSuccess: (_r, { ativo, nome }) => {
      toast.success(ativo ? `${nome} reativado` : `${nome} desativado. Os orçamentos dele continuam como estão.`);
      setConfirmando(null);
      // lista, ficha e busca do gerador
      return clienteConsultas.invalidateQueries({ queryKey: ['clientes'] });
    },
    onError: (erro) => {
      if (!(erro instanceof ErroApi && erro.status === 401)) {
        toast.error(erro instanceof ErroApi ? erro.message : 'Não foi possível alterar o cliente.');
      }
    },
  });

  const pedir = (c: ClienteBasico) => {
    // reativar não precisa de confirmação: não tira nada de lugar nenhum
    if (!c.ativo) alternar.mutate({ id: c.id, ativo: true, nome: c.nome });
    else setConfirmando(c);
  };

  const dialogo = (
    <Dialog open={confirmando !== null} onOpenChange={(a) => !a && !alternar.isPending && setConfirmando(null)}>
      <DialogContent className="bg-card sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Desativar {confirmando?.nome}?</DialogTitle>
          <DialogDescription>
            O cliente deixa de aparecer nas buscas de novos orçamentos. Nada é apagado: os
            orçamentos dele continuam como estão, e dá para reativar quando quiser.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button variant="outline" className="h-11 rounded-[10px]" onClick={() => setConfirmando(null)} disabled={alternar.isPending}>
            Cancelar
          </Button>
          <Button
            className="h-11 rounded-[10px]"
            disabled={alternar.isPending}
            onClick={() => confirmando && alternar.mutate({ id: confirmando.id, ativo: false, nome: confirmando.nome })}
          >
            {alternar.isPending && <Loader2 className="animate-spin" aria-hidden />}
            Desativar cliente
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return { pedir, dialogo, pendenteId: alternar.isPending ? alternar.variables?.id ?? null : null };
}
