import { FileText, Loader2, MessageCircle, TriangleAlert } from 'lucide-react';
import { CondicoesDaProposta } from './CondicoesDaProposta';
import { useCapas } from './capa';
import { AVISO_SEM_PRAZO, type PagamentoCartao } from '@guarusolar/compartilhado';
import { formatarBRL } from '@/lib/formatar';
import { Button } from '@/components/ui/button';
import { CartaoCondicoes } from './CartaoCondicoes';
import { ESTILO_SOMENTE_LEITURA } from './formulario';

export type Totais = {
  /** soma dos itens, sem a margem */
  subtotalItens: number;
  margem: number;
  /** itens + margem */
  subtotal: number;
  descontoAplicado: number;
  /** imposto em R$, sobre o valor já com os descontos */
  impostoAplicado: number;
  /** com o imposto */
  valorTotal: number;
  resumoPagamento: string;
  entrada: number;
  /** o que o cliente paga (com a taxa do cartão, se repassada) */
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
  semPrazo,
  enviandoWhatsApp,
  avisoDaCapa = null,
  onWhatsApp,
  onPdf,
}: {
  totais: Totais;
  confirmado: boolean;
  salvo: boolean;
  somenteLeitura?: boolean;
  alteradoDepoisDeSalvar: boolean;
  /** o prazo de execução está em branco: a proposta não é gerada nem enviada */
  semPrazo: boolean;
  enviandoWhatsApp: boolean;
  /** o tipo do orçamento não tem capa própria (capa.tsx): avisa aqui e confirma no clique */
  avisoDaCapa?: string | null;
  onWhatsApp: () => void;
  onPdf: () => void;
}) {
  const modeloNovo = useCapas().data?.ativa ?? false;
  // PDF e WhatsApp mostram o que está gravado: só com o orçamento salvo e sem alterações
  // e só com o prazo de execução preenchido (o rascunho pode ficar sem; a proposta, não)
  const podeEnviar = salvo && !alteradoDepoisDeSalvar && !semPrazo;
  const dicaAcoes = semPrazo
    ? AVISO_SEM_PRAZO
    : !salvo
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
        {/* informação, não aviso: com a taxa sempre absorvida, aparece em todo orçamento de cartão */}
        {totais.cartao && totais.cartao.valorAbsorvido > 0 && (
          <p className="text-[13px] leading-snug text-[#CBDBF0]">Taxa do cartão absorvida: {formatarBRL(totais.cartao.valorAbsorvido)}</p>
        )}
        <p className="pt-1 text-xs text-[#9DB6D6]">
          {confirmado ? 'Valores confirmados pelo sistema.' : 'Prévia. O valor final é confirmado pelo sistema ao salvar.'}
        </p>
      </section>

      {/* só com o modelo novo da proposta ligado: é ele que mostra as três condições no PDF */}
      {modeloNovo && (
        <fieldset disabled={somenteLeitura} className={`min-w-0 ${ESTILO_SOMENTE_LEITURA}`}>
          <legend className="sr-only">Três condições da proposta</legend>
          <CondicoesDaProposta />
        </fieldset>
      )}

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
        <p id="dica-acoes" className={`text-center text-[13px] ${semPrazo ? 'text-destaque-texto' : 'text-muted-foreground'}`}>
          {dicaAcoes}
        </p>
        {avisoDaCapa && (
          <p className="flex gap-2 rounded-[10px] border border-destaque bg-destaque-suave px-3 py-2.5 text-[13px] text-destaque-texto">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            {avisoDaCapa}
          </p>
        )}
      </div>
    </aside>
  );
}
