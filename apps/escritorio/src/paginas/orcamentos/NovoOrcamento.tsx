import { useEffect, useMemo, useState } from 'react';
import { useBlocker } from 'react-router';
import { FormProvider, useForm, useWatch, type FieldPath } from 'react-hook-form';
import { useMutation } from '@tanstack/react-query';
import { Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { calcularOrcamento } from '@guarusolar/compartilhado';
import { api, ErroApi, tokenSalvo } from '@/lib/api';
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
  campoDoFormulario,
  entradaDoCalculo,
  paraApi,
  ROTULO_STATUS,
  validarParaSalvar,
  valoresIniciais,
  type FormularioOrcamento,
  type OrcamentoSalvo,
  type ProblemaFormulario,
} from './formulario';

const horaCurta = (data: Date) => data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

export function NovoOrcamento() {
  const formulario = useForm<FormularioOrcamento>({ defaultValues: valoresIniciais() });
  const { control, formState, getValues, reset, setError, clearErrors } = formulario;
  const [salvo, setSalvo] = useState<OrcamentoSalvo | null>(null);
  const [salvoEm, setSalvoEm] = useState<Date | null>(null);
  const [enviandoWhatsApp, setEnviandoWhatsApp] = useState(false);

  // Recalcula a cada digitação. É só a prévia: a API recalcula com a mesma função ao salvar.
  const valores = useWatch({ control }) as FormularioOrcamento;
  const previa = useMemo(() => calcularOrcamento(entradaDoCalculo(valores)), [valores]);

  const alterado = formState.isDirty;
  // Salvo e sem alterações depois disso: mostra os valores que a API gravou, que são os que valem.
  const confirmado = salvo !== null && !alterado;
  const totais: Totais = confirmado
    ? {
        subtotal: Number(salvo.subtotal),
        descontoAplicado: Number(salvo.descontoAplicado),
        valorTotal: Number(salvo.valorTotal),
        resumoPagamento: salvo.resumoPagamento,
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
      setSalvo(resposta);
      setSalvoEm(new Date());
      // o que foi salvo vira a nova referência: isDirty volta a false
      reset(dados);
      toast.success(`Orçamento ${resposta.codigo} salvo`);
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
    // abre a aba já no clique: aberta depois do await, o navegador bloquearia como pop-up
    const janela = window.open('', '_blank');
    setEnviandoWhatsApp(true);
    try {
      // a API também passa o rascunho para ENVIADO; o selo do cabeçalho acompanha
      const { link, status } = await api.post<{ link: string; mensagem: string; status: OrcamentoSalvo['status'] }>(
        `/api/orcamentos/${salvo.id}/whatsapp`,
      );
      setSalvo((atual) => (atual ? { ...atual, status } : atual));
      if (janela) {
        janela.opener = null;
        janela.location.href = link;
      } else {
        window.open(link, '_blank', 'noopener');
      }
    } catch (erro) {
      janela?.close();
      if (!(erro instanceof ErroApi && erro.status === 401)) {
        toast.error(erro instanceof ErroApi ? erro.message : 'Não foi possível montar a mensagem do WhatsApp.');
      }
    } finally {
      setEnviandoWhatsApp(false);
    }
  }

  // Sair da tela com alterações não salvas: confirma antes (menu, voltar do navegador...).
  // Saída forçada por sessão expirada não pergunta: o token já foi apagado e não daria para salvar.
  const bloqueio = useBlocker(
    ({ currentLocation, nextLocation }) =>
      alterado && currentLocation.pathname !== nextLocation.pathname && tokenSalvo.ler() !== null,
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

  const situacao = salvo
    ? alterado
      ? 'Alterações não salvas'
      : `Salvo às ${horaCurta(salvoEm!)}`
    : alterado
      ? 'Ainda não salvo'
      : '';

  return (
    <FormProvider {...formulario}>
      <div className="flex flex-col gap-[22px]">
        <header className="flex flex-wrap items-end justify-between gap-6">
          <div className="flex flex-col gap-1">
            <nav aria-label="Caminho" className="text-[13px] text-muted-foreground">
              <span>Orçamentos</span> <span aria-hidden>/</span> <span aria-current="page">Novo orçamento</span>
            </nav>
            <div className="flex flex-wrap items-center gap-3.5">
              <h1 className="text-[34px] font-bold tracking-[-0.02em]">Novo orçamento</h1>
              <span className="rounded-full bg-[#E7EBF2] px-2.5 py-1 font-mono text-[13px] text-[#414F60]">
                {salvo ? `${salvo.codigo} · ${ROTULO_STATUS[salvo.status]}` : 'Código gerado ao salvar · Rascunho'}
              </span>
            </div>
          </div>
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
        </header>

        {/* Duas colunas só a partir de 1360px: abaixo disso a tabela de itens fica sem espaço
            para o nome (1366px, comum no escritório, já pega as duas colunas). */}
        <div className="grid items-start gap-6 min-[1360px]:grid-cols-[minmax(0,1fr)_368px]">
          <div className="flex min-w-0 flex-col gap-5">
            <CartaoCliente />
            <CartaoItens subtotal={totais.subtotal} />
          </div>
          <ResumoOrcamento
            totais={totais}
            confirmado={confirmado}
            salvo={salvo !== null}
            alteradoDepoisDeSalvar={salvo !== null && alterado}
            enviandoWhatsApp={enviandoWhatsApp}
            onWhatsApp={aoEnviarWhatsApp}
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
