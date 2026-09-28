import { useMemo } from 'react';
import { FormProvider, useForm, useWatch } from 'react-hook-form';
import { calcularOrcamento } from '@guarusolar/compartilhado';
import { CartaoCliente } from './CartaoCliente';
import { CartaoItens } from './CartaoItens';
import { ResumoOrcamento } from './ResumoOrcamento';
import { entradaDoCalculo, VALORES_INICIAIS, type FormularioOrcamento } from './formulario';

export function NovoOrcamento() {
  const formulario = useForm<FormularioOrcamento>({ defaultValues: VALORES_INICIAIS });

  // Recalcula a cada digitação. É só a prévia: a API recalcula com a mesma função ao salvar.
  const valores = useWatch({ control: formulario.control }) as FormularioOrcamento;
  const resultado = useMemo(() => calcularOrcamento(entradaDoCalculo(valores)), [valores]);

  return (
    <FormProvider {...formulario}>
      <div className="flex flex-col gap-[22px]">
        <header className="flex flex-col gap-1">
          <nav aria-label="Caminho" className="text-[13px] text-muted-foreground">
            <span>Orçamentos</span> <span aria-hidden>/</span> <span aria-current="page">Novo orçamento</span>
          </nav>
          <div className="flex flex-wrap items-center gap-3.5">
            <h1 className="text-[34px] font-bold tracking-[-0.02em]">Novo orçamento</h1>
            <span className="rounded-full bg-[#E7EBF2] px-2.5 py-1 font-mono text-[13px] text-[#414F60]">
              Código gerado ao salvar · Rascunho
            </span>
          </div>
        </header>

        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_368px]">
          <div className="flex min-w-0 flex-col gap-5">
            <CartaoCliente />
            <CartaoItens subtotal={resultado.subtotal} />
          </div>
          <ResumoOrcamento resultado={resultado} />
        </div>
      </div>
    </FormProvider>
  );
}
