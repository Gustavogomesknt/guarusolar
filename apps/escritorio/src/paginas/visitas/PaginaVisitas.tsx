import { useState } from 'react';
import { Link } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FilePlus2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { api, ErroApi } from '@guarusolar/web/api';
import type { VisitaTecnica } from '@/lib/tipos';
import { textoDoErro } from '@/lib/consultas';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CartaoVisita, CHAVE_VISITAS, useVisitasAguardandoOrcamento } from '@/components/VisitasTecnicas';

/**
 * Visitas técnicas AVULSAS já validadas, esperando a proposta (COMERCIAL e GESTOR). A visita sai
 * daqui sozinha quando o cliente ganha um orçamento criado depois da validação, ou pelo
 * "Dispensar". Sair daqui não esconde nada: a ficha do cliente lista todas as visitas dele.
 */
export function PaginaVisitas() {
  const visitas = useVisitasAguardandoOrcamento();
  const [dispensando, setDispensando] = useState<VisitaTecnica | null>(null);

  return (
    <div className="flex max-w-5xl flex-col gap-[22px]">
      <header className="flex flex-col gap-1">
        <p className="text-[13px] text-muted-foreground">Visitas técnicas avulsas validadas, com as fotos e as medições para montar a proposta</p>
        <h1 className="text-4xl font-bold tracking-[-0.02em]">Visitas aguardando orçamento</h1>
      </header>

      {visitas.isPending ? (
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden /> Carregando…
        </p>
      ) : visitas.isError ? (
        <p role="alert" className="text-sm text-destructive">
          Não foi possível carregar as visitas. {textoDoErro(visitas.error)}
        </p>
      ) : visitas.data.length === 0 ? (
        <p className="rounded-[14px] border bg-card px-6 py-8 text-sm text-muted-foreground">
          Nenhuma visita aguardando orçamento. Quando o gestor validar uma visita técnica avulsa, ela aparece aqui.
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {visitas.data.map((v) => (
            <li key={v.id}>
              <CartaoVisita
                visita={v}
                mostrarCliente
                acoes={
                  <>
                    <Button asChild className="h-10 rounded-[10px] font-semibold">
                      <Link to={`/orcamentos/novo?cliente=${v.cliente?.id}`}>
                        <FilePlus2 aria-hidden /> Montar orçamento
                      </Link>
                    </Button>
                    <Button variant="ghost" className="h-10 rounded-[10px] text-muted-foreground" onClick={() => setDispensando(v)}>
                      Dispensar
                    </Button>
                    <span className="text-xs text-muted-foreground">Sai daqui sozinha quando o orçamento deste cliente for criado.</span>
                  </>
                }
              />
            </li>
          ))}
        </ul>
      )}

      <ConfirmarDispensa visita={dispensando} onFechar={() => setDispensando(null)} />
    </div>
  );
}

function ConfirmarDispensa({ visita, onFechar }: { visita: VisitaTecnica | null; onFechar: () => void }) {
  const clienteConsultas = useQueryClient();
  const [erro, setErro] = useState<string | null>(null);
  const dispensar = useMutation({
    mutationFn: (id: string) => api.post(`/api/visitas/${id}/dispensar`, {}),
    meta: { erroTratadoNoFormulario: true },
    onSuccess: () => {
      toast.success(`Visita de ${visita?.cliente?.nome} dispensada. Ela continua na ficha do cliente.`);
      void clienteConsultas.invalidateQueries({ queryKey: CHAVE_VISITAS });
      onFechar();
    },
    onError: (e) => setErro(e instanceof ErroApi ? e.message : 'Não foi possível dispensar. Tente de novo.'),
  });
  return (
    <Dialog open={visita !== null} onOpenChange={(a) => !a && !dispensar.isPending && (setErro(null), onFechar())}>
      {visita && (
        <DialogContent className="bg-card sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Dispensar a visita de {visita.cliente?.nome}?</DialogTitle>
            <DialogDescription>
              Use quando a visita não vai virar proposta. Ela sai desta lista, mas continua na ficha do cliente, com as fotos e as observações.
            </DialogDescription>
          </DialogHeader>
          {erro && (
            <p role="alert" className="text-sm text-destructive">
              {erro}
            </p>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" className="h-11 rounded-[10px]" onClick={onFechar} disabled={dispensar.isPending}>
              Voltar
            </Button>
            <Button className="h-11 rounded-[10px] font-semibold" onClick={() => dispensar.mutate(visita.id)} disabled={dispensar.isPending}>
              {dispensar.isPending && <Loader2 className="animate-spin" aria-hidden />}
              Dispensar
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
}
