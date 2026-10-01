import { FileText, Loader2, MessageCircle } from 'lucide-react';
import type { PagamentoCartao } from '@guarusolar/compartilhado';
import { formatarBRL } from '@/lib/formatar';
import { Button } from '@/components/ui/button';
import { CartaoCondicoes } from './CartaoCondicoes';
import { ESTILO_SOMENTE_LEITURA } from './formulario';

export type Totais = {
  subtotal: number;
  descontoAplicado: number;
  valorTotal: number;
  resumoPagamento: string;
  entrada: number;
  /** o que o cliente paga (com a taxa do cartão repassada) */
  valorTotalCliente: number;
  cartao: PagamentoCartao | null;
};

/**
 * Coluna da direita: condições, valor total e ações.
 * `confirmado` = os totais são os que a API calculou e gravou; senão é uma prévia do navegador.
 */
export function ResumoOrcamento({
  totais,
  confirmado,
  salvo,
  somenteLeitura = false,
  alteradoDepoisDeSalvar,
  enviandoWhatsApp,
  onWhatsApp,
  onPdf,
}: {
  totais: Totais;
  confirmado: boolean;
  salvo: boolean;
  somenteLeitura?: boolean;
  alteradoDepoisDeSalvar: boolean;
  enviandoWhatsApp: boolean;
  onWhatsApp: () => void;
  onPdf: () => void;
}) {
  // PDF e WhatsApp mostram o que está gravado: só com o orçamento salvo e sem alterações
  const podeEnviar = salvo && !alteradoDepoisDeSalvar;
  const dicaAcoes = !salvo
    ? 'Salve o orçamento para gerar o PDF e enviar pelo WhatsApp.'
    : alteradoDepoisDeSalvar
      ? 'Há alterações não salvas. Salve antes, para o PDF e o cliente terem a versão atual.'
      : 'O PDF abre numa nova aba, com o mesmo link que o cliente recebe.';

  return (
    <aside aria-label="Resumo do orçamento" className="flex flex-col gap-4">
      <fieldset disabled={somenteLeitura} className={`min-w-0 ${ESTILO_SOMENTE_LEITURA}`}>
        <legend className="sr-only">Condições</legend>
        <CartaoCondicoes totais={totais} />
      </fieldset>

      <section aria-labelledby="titulo-total" className="flex flex-col gap-1.5 rounded-[14px] bg-sidebar p-[22px]">
        <h2 id="titulo-total" className="font-sans text-[13px] font-normal tracking-normal text-[#CBDBF0]">
          Valor total do orçamento
        </h2>
        <p className="font-titulo text-[38px] leading-tight font-bold tracking-[-0.02em] text-white" aria-live="polite">
          {formatarBRL(totais.valorTotal)}
        </p>
        <p className="text-[13px] leading-snug text-destaque-claro">{totais.resumoPagamento}</p>
        <p className="pt-1 text-xs text-[#9DB6D6]">
          {confirmado ? 'Valores confirmados pelo sistema.' : 'Prévia. O valor final é confirmado pelo sistema ao salvar.'}
        </p>
      </section>

      <div className="flex flex-col gap-2.5">
        <Button
          type="button"
          onClick={onWhatsApp}
          disabled={!podeEnviar || enviandoWhatsApp}
          aria-describedby="dica-acoes"
          className="h-[50px] rounded-xl text-[15px] font-semibold"
        >
          {enviandoWhatsApp ? <Loader2 className="animate-spin" aria-hidden /> : <MessageCircle aria-hidden />}
          Enviar via WhatsApp
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={onPdf}
          disabled={!podeEnviar}
          aria-describedby="dica-acoes"
          className="h-12 rounded-xl bg-card text-[15px]"
        >
          <FileText aria-hidden />
          Gerar PDF
        </Button>
        <p id="dica-acoes" className="text-center text-[13px] text-muted-foreground">
          {dicaAcoes}
        </p>
      </div>
    </aside>
  );
}
