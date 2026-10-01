import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useBlocker } from 'react-router';
import { FormProvider, useForm, useWatch, type FieldPath } from 'react-hook-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Lock, Save } from 'lucide-react';
import { toast } from 'sonner';
import { calcularOrcamento, ROTULO_STATUS_ORCAMENTO } from '@guarusolar/compartilhado';
import { api, ErroApi, tokenSalvo, urlDaApi } from '@guarusolar/web/api';
import { enviarPeloWhatsApp } from '@/lib/whatsapp';
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
import { CartaoCliente } from './CartaoCliente';
import { CartaoItens } from './CartaoItens';
import { ResumoOrcamento, type Totais } from './ResumoOrcamento';
import {
  caminhoDoPdf,
  campoDoFormulario,
  entradaDoCalculo,
  ESTILO_SOMENTE_LEITURA,
  paraApi,
  validarParaSalvar,
  valoresIniciais,
  type FormularioOrcamento,
  type OrcamentoSalvo,
  cartaoDoSalvo,
  type ProblemaFormulario,
} from './formulario';

const horaCurta =(data: Date) => data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

export type OrcamentoInicial = {
  valores: FormularioOrcamento;
  salvo: OrcamentoSalvo;
};

/**
 * O gerador de orçamentos: cria (sem `inicial`) ou edita um orçamento salvo.
 * Orçamento APROVADO abre só para leitura: a API não aceita alterá-lo.
 */
export function GeradorOrcamento({
  inicial,
  clienteInicial,
  onCriado,
}: {
  inicial?: OrcamentoInicial;
  /** Orçamento novo já com este cliente selecionado (vindo da ficha do cliente). */
  clienteInicial?: Cliente;
  /** Chamado quando um orçamento novo é salvo pela primeira vez (a página troca a URL). */
  onCriado?: (id: string) => void;
}) {
  const formulario = useForm<FormularioOrcamento>({
    defaultValues: inicial?.valores ?? { ...valoresIniciais(), cliente: clienteInicial ?? null },
  });
  const { control, formState, getValues, reset, setError, clearErrors } = formulario;
  const clienteConsultas = useQueryClient();
  const [salvo, setSalvo] = useState<OrcamentoSalvo | null>(inicial?.salvo ?? null);
  const [salvoEm, setSalvoEm] = useState<Date | null>(null);
  const [enviandoWhatsApp, setEnviandoWhatsApp] = useState(false);
  const somenteLeitura = salvo?.status === 'APROVADO';

  // Recalcula a cada digitação. É só a prévia: a API recalcula com a mesma função ao salvar.
  const valores = useWatch({ control }) as FormularioOrcamento;
  const previa = useMemo(() => calcularOrcamento(entradaDoCalculo(valores)), [valores]);

  const alterado = formState.isDirty;
  // lido pelo bloqueio de navegação, que pode rodar antes da próxima renderização
  const alteradoRef = useRef(alterado);
  alteradoRef.current = alterado;

  // Salvo e sem alterações depois disso: mostra os valores que a API gravou, que são os que valem.
  const confirmado = salvo !== null && !alterado;
  const totais: Totais = confirmado
    ? {
        subtotal: Number(salvo.subtotal),
        descontoAplicado: Number(salvo.descontoAplicado),
        valorTotal: Number(salvo.valorTotal),
        resumoPagamento: salvo.resumoPagamento,
        // o cartão como foi gravado: proposta salva não muda com a tabela de taxas
        entrada: Number(salvo.valorEntrada ?? 0),
        valorTotalCliente: Number(salvo.valorTotalCliente ?? salvo.valorTotal),
        cartao: cartaoDoSalvo(salvo),
      }
    : previa;

  function mostrarProblemas(problemas: ProblemaFormulario[]) {
    problemas.forEach(({ campo, mensagem }, i) =>
      setError(campo as FieldPath<FormularioOrcamento>, { type: 'validacao', message: mensagem }, { shouldFocus: i === 0 }),
    );
    // cliente e itens não são campos focáveis: leva a tela até o cartão
    const primeiro = problemas[0]?.campo;
    if (primeiro === 'root.cliente') document.getElementById('titulo-cliente')?.scrollIntoView({ block: 'center' });
    if (primeiro === 'root.itens') document.getElementById('titulo-itens')?.scrollIntoView({ block: 'center' });
    toast.error(
      problemas.length === 1 ? problemas[0].mensagem : `Corrija ${problemas.length} pontos antes de salvar.`,
    );
  }

  const salvar = useMutation({
    mutationFn: (dados: FormularioOrcamento) =>
      salvo
        ? api.put<OrcamentoSalvo>(`/api/orcamentos/${salvo.id}`, paraApi(dados))
        : api.post<OrcamentoSalvo>('/api/orcamentos', paraApi(dados)),
    meta: { erroTratadoNoFormulario: true },
    onSuccess: (resposta, dados) => {
      const eraNovo = salvo === null;
      setSalvo(resposta);
      setSalvoEm(new Date());
      // o que foi salvo vira a nova referência: isDirty volta a false
      reset(dados);
      alteradoRef.current = false;
      toast.success(`Orçamento ${resposta.codigo} salvo`);
      void clienteConsultas.invalidateQueries({ queryKey: ['orcamentos'] });
      if (eraNovo) onCriado?.(resposta.id);
    },
    onError: (erro) => {
      if (erro instanceof ErroApi && erro.detalhes.length > 0) {
        mostrarProblemas(erro.detalhes.map((d) => ({ campo: campoDoFormulario(d.campo), mensagem: d.mensagem })));
        return;
      }
      if (erro instanceof ErroApi && erro.status === 401) return; // a sessão já leva ao login
      toast.error(erro instanceof ErroApi ? erro.message : 'Não foi possível salvar. Tente novamente.');
    },
  });

  function aoSalvar() {
    clearErrors();
    const dados = getValues();
    const problemas = validarParaSalvar(dados, previa.subtotal);
    if (problemas.length > 0) return mostrarProblemas(problemas);
    salvar.mutate(dados);
  }

  async function aoEnviarWhatsApp() {
    if (!salvo) return;
    setEnviandoWhatsApp(true);
    try {
      // a API também passa o rascunho para ENVIADO; o selo do cabeçalho acompanha
      const status = await enviarPeloWhatsApp(salvo.id);
      setSalvo((atual) => (atual ? { ...atual, status } : atual));
      void clienteConsultas.invalidateQueries({ queryKey: ['orcamentos'] });
    } catch (erro) {
      if (!(erro instanceof ErroApi && erro.status === 401)) {
        toast.error(erro instanceof ErroApi ? erro.message : 'Não foi possível montar a mensagem do WhatsApp.');
      }
    } finally {
      setEnviandoWhatsApp(false);
    }
  }

  // Sair da tela com alterações não salvas: confirma antes (menu, Sair, voltar do navegador).
  // Saída forçada por sessão expirada não pergunta: o token já foi apagado e não daria para salvar.
  const bloqueio = useBlocker(
    ({ currentLocation, nextLocation }) =>
      alteradoRef.current && currentLocation.pathname !== nextLocation.pathname && tokenSalvo.ler() !== null,
  );

  // Fechar ou recarregar a janela: o navegador mostra a confirmação dele.
  useEffect(() => {
    if (!alterado) return;
    const aoSairDaJanela = (evento: BeforeUnloadEvent) => {
      evento.preventDefault();
      evento.returnValue = '';
    };
    window.addEventListener('beforeunload', aoSairDaJanela);
    return () => window.removeEventListener('beforeunload', aoSairDaJanela);
  }, [alterado]);

  const situacao = somenteLeitura
    ? ''
    : salvo
      ? alterado
        ? 'Alterações não salvas'
        : salvoEm
          ? `Salvo às ${horaCurta(salvoEm)}`
          : 'Sem alterações'
      : alterado
        ? 'Ainda não salvo'
        : '';

  return (
    <FormProvider {...formulario}>
      <div className="flex flex-col gap-[22px]">
        <header className="flex flex-wrap items-end justify-between gap-6">
          <div className="flex flex-col gap-1">
            <nav aria-label="Caminho" className="text-[13px] text-muted-foreground">
              <Link to="/orcamentos" className="hover:underline">
                Orçamentos
              </Link>{' '}
              <span aria-hidden>/</span>{' '}
              <span aria-current="page">{salvo ? salvo.codigo : 'Novo orçamento'}</span>
            </nav>
            <div className="flex flex-wrap items-center gap-3.5">
              <h1 className="text-[34px] font-bold tracking-[-0.02em]">
                {inicial ? 'Orçamento' : 'Novo orçamento'}
              </h1>
              <span className="rounded-full bg-[#E7EBF2] px-2.5 py-1 font-mono text-[13px] text-[#414F60]">
                {salvo
                  ? `${salvo.codigo} · ${ROTULO_STATUS_ORCAMENTO[salvo.status]}`
                  : 'Código gerado ao salvar · Rascunho'}
              </span>
            </div>
          </div>
          {!somenteLeitura && (
            <div className="flex items-center gap-3">
              {situacao && (
                <span className="text-[13px] text-muted-foreground" role="status">
                  {situacao}
                </span>
              )}
              <Button
                type="button"
                variant="outline"
                onClick={aoSalvar}
                disabled={salvar.isPending || confirmado}
                className="h-11 rounded-[10px] bg-card px-[18px]"
              >
                {salvar.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />}
                {salvo ? 'Salvar alterações' : 'Salvar rascunho'}
              </Button>
            </div>
          )}
        </header>

        {somenteLeitura && (
          <p
            role="status"
            className="flex items-start gap-2.5 rounded-xl border border-[#9FD3B4] bg-[#DCF0E3] px-4 py-3 text-sm text-[#17653E]"
          >
            <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
            Este orçamento foi aprovado e virou projeto. Ele fica disponível só para consulta: itens,
            valores e condições não podem mais ser alterados.
          </p>
        )}

        {/* Duas colunas só a partir de 1360px: abaixo disso a tabela de itens fica sem espaço
            para o nome (1366px, comum no escritório, já pega as duas colunas). */}
        <div className="grid items-start gap-6 min-[1360px]:grid-cols-[minmax(0,1fr)_368px]">
          {/* fieldset desabilitado trava todos os campos e botões no modo leitura */}
          <fieldset disabled={somenteLeitura} className={`flex min-w-0 flex-col gap-5 ${ESTILO_SOMENTE_LEITURA}`}>
            <legend className="sr-only">Cliente e itens</legend>
            <CartaoCliente />
            <CartaoItens subtotal={totais.subtotal} />
          </fieldset>
          <ResumoOrcamento
            totais={totais}
            confirmado={confirmado}
            salvo={salvo !== null}
            somenteLeitura={somenteLeitura}
            alteradoDepoisDeSalvar={salvo !== null && alterado}
            enviandoWhatsApp={enviandoWhatsApp}
            onWhatsApp={aoEnviarWhatsApp}
            onPdf={() => salvo && window.open(urlDaApi(caminhoDoPdf(salvo)), '_blank', 'noopener')}
          />
        </div>
      </div>

      <Dialog open={bloqueio.state === 'blocked'} onOpenChange={(aberto) => !aberto && bloqueio.reset?.()}>
        <DialogContent className="bg-card sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Sair sem salvar?</DialogTitle>
            <DialogDescription>
              {salvo
                ? 'As alterações feitas depois do último salvamento serão perdidas.'
                : 'Este orçamento ainda não foi salvo e será perdido.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="h-11 rounded-[10px]" onClick={() => bloqueio.reset?.()}>
              Continuar editando
            </Button>
            <Button variant="destructive" className="h-11 rounded-[10px]" onClick={() => bloqueio.proceed?.()}>
              Sair sem salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </FormProvider>
  );
}
