import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { TriangleAlert } from 'lucide-react';
import { api } from '@guarusolar/web/api';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

/*
 * Capa da proposta por tipo de serviço (API: lib/capaDaProposta.ts). A capa é uma imagem fixa
 * com o serviço impresso; tipo sem capa própria sai com a padrão (carregador). Antes de gerar o
 * PDF ou enviar pelo WhatsApp, o vendedor vê o aviso e escolhe seguir ou não: é aviso, não trava.
 * Só vale com o PDF que tem capa (`ativa`, modelo novo); no modelo atual nada é avisado.
 */

type Capas = { ativa: boolean; textoDaCapaPadrao: string; tipos: { id: string; nome: string; temCapa: boolean }[] };

export function useCapas() {
  return useQuery({
    queryKey: ['orcamentos', 'capas'],
    queryFn: ({ signal }) => api.get<Capas>('/api/orcamentos/capas', { signal }),
    staleTime: 5 * 60_000,
  });
}

/** Texto do aviso para o tipo do orçamento, ou null quando a capa é a do próprio tipo. */
export function avisoDaCapa(capas: Capas | undefined, tipoDeServicoId: string | null | undefined): string | null {
  if (!capas?.ativa) return null;
  const tipo = capas.tipos.find((t) => t.id === tipoDeServicoId);
  if (tipo?.temCapa) return null;
  const deQue = tipo ? `é de ${tipo.nome}` : 'não tem tipo de serviço';
  return `A capa da proposta diz "${capas.textoDaCapaPadrao}". Este orçamento ${deQue}. Peça a arte da capa para esse tipo antes de enviar ao cliente.`;
}

/**
 * `confirmar(tipoId, rotulo, acao)`: sem aviso, executa na hora; com aviso, abre a confirmação
 * ("Gerar assim mesmo" / "Enviar assim mesmo"). O `dialogo` vai na tela que usa.
 */
export function useConfirmacaoDaCapa(): {
  aviso: (tipoDeServicoId: string | null | undefined) => string | null;
  confirmar: (tipoDeServicoId: string | null | undefined, rotulo: string, acao: () => void) => void;
  dialogo: ReactNode;
} {
  const { data: capas } = useCapas();
  const [pedido, setPedido] = useState<{ texto: string; rotulo: string; acao: () => void } | null>(null);

  const dialogo = (
    <Dialog open={pedido !== null} onOpenChange={(aberto) => !aberto && setPedido(null)}>
      <DialogContent className="bg-card sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TriangleAlert className="size-5 text-destaque" aria-hidden />
            Capa de outro serviço
          </DialogTitle>
          <DialogDescription>{pedido?.texto}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button variant="outline" className="h-11 rounded-[10px]" onClick={() => setPedido(null)}>
            Cancelar
          </Button>
          <Button
            className="h-11 rounded-[10px]"
            onClick={() => {
              // a ação roda no clique (o PDF abre numa aba nova: o navegador exige o gesto)
              pedido?.acao();
              setPedido(null);
            }}
          >
            {pedido?.rotulo}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return {
    aviso: (id) => avisoDaCapa(capas, id),
    confirmar: (id, rotulo, acao) => {
      const texto = avisoDaCapa(capas, id);
      if (!texto) return acao();
      setPedido({ texto, rotulo, acao });
    },
    dialogo,
  };
}
