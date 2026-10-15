import { useFormContext, useWatch } from 'react-hook-form';
import { Link } from 'react-router';
import { Campo, ariaDoCampo } from '@/components/Campo';
import { useTiposDeServico } from '@/lib/tiposDeServico';
import type { FormularioOrcamento } from './formulario';

const CLASSE_SELECT =
  'h-11 w-full rounded-[10px] border border-input bg-card px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30';

/**
 * Tipo de serviço VENDIDO (obrigatório): separa os números do painel. Só os ativos aparecem; o
 * desativado continua no orçamento que já o tinha. Não entra no PDF: o título da proposta é o
 * campo "Serviço", texto livre, nas condições.
 */
export function CartaoTipoDeServico() {
  const { register, clearErrors, control, formState: { errors } } = useFormContext<FormularioOrcamento>();
  const escolhido = useWatch({ control, name: 'tipoDeServicoId' });
  const tipos = useTiposDeServico();
  const opcoes = (tipos.data ?? []).filter((t) => t.ativo || t.id === escolhido);
  const erro = errors.tipoDeServicoId?.message;
  return (
    <section aria-label="Tipo de serviço" className="flex flex-col gap-2 rounded-[14px] border bg-card px-6 py-[18px]">
      <Campo
        id="tipo-de-servico"
        rotulo="Tipo de serviço"
        obrigatorio
        erro={erro}
        ajuda={
          <>
            O que este orçamento vende; separa os números do painel. A lista é mantida em{' '}
            <Link to="/tipos-de-servico" className="text-primary underline-offset-2 hover:underline">
              Tipos de serviço
            </Link>
            .
          </>
        }
      >
        <select
          {...ariaDoCampo('tipo-de-servico', erro)}
          {...register('tipoDeServicoId', { onChange: () => clearErrors('tipoDeServicoId') })}
          className={CLASSE_SELECT}
        >
          <option value="">{tipos.isPending ? 'Carregando…' : 'Escolha o tipo de serviço'}</option>
          {opcoes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nome}
              {t.ativo ? '' : ' (desativado)'}
            </option>
          ))}
        </select>
      </Campo>
    </section>
  );
}
