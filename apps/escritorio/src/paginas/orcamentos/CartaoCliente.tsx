import { useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { useQuery } from '@tanstack/react-query';
import { History, Plus } from 'lucide-react';
import { formatarData } from '@guarusolar/compartilhado';
import { api } from '@guarusolar/web/api';
import type { Cliente } from '@/lib/tipos';
import { documentoParaExibir, mascararCep, mascararTelefone } from '@/lib/formatar';
import { useValorAtrasado } from '@/hooks/useValorAtrasado';
import { Button } from '@/components/ui/button';
import { CampoBusca } from '@/components/CampoBusca';
import { DialogCliente } from '@/components/DialogCliente';
import { copiaDoSalvo, diferencasDoCadastro, type DadosClienteDocumento, type FormularioOrcamento, type OrcamentoSalvo } from './formulario';

const MINIMO_BUSCA = 2;

export function CartaoCliente({ gravado, somenteLeitura = false }: { gravado: OrcamentoSalvo | null; somenteLeitura?: boolean }) {
  const {
    control,
    setValue,
    clearErrors,
    formState: { errors },
  } = useFormContext<FormularioOrcamento>();
  const cliente = useWatch({ control, name: 'cliente' });
  const atualizar = useWatch({ control, name: 'atualizarDadosCliente' });
  const erroCliente = errors.root?.cliente?.message;
  const [termo, setTermo] = useState('');
  const [dialogAberto, setDialogAberto] = useState(false);

  const termoBusca = useValorAtrasado(termo.trim(), 300);
  const busca = useQuery({
    queryKey: ['clientes', 'busca', termoBusca],
    queryFn: ({ signal }) =>
      api.get<Cliente[]>(`/api/clientes?q=${encodeURIComponent(termoBusca)}`, { signal }),
    enabled: termoBusca.length >= MINIMO_BUSCA,
    staleTime: 60_000,
  });
  const atualizando = termo.trim() !== termoBusca || busca.isFetching;

  function selecionar(escolhido: Cliente | null) {
    setValue('cliente', escolhido, { shouldDirty: true });
    if (escolhido) clearErrors('root.cliente');
    setTermo('');
  }

  return (
    <section aria-labelledby="titulo-cliente" className="@container flex flex-col gap-3.5 rounded-[14px] border bg-card px-6 py-[22px]">
      <div className="flex items-center justify-between gap-3">
        <h2 id="titulo-cliente" className="text-xl font-bold">
          1. Cliente
        </h2>
        <Button variant="outline" className="h-10 rounded-[10px] px-3.5" onClick={() => setDialogAberto(true)}>
          <Plus aria-hidden />
          Cadastrar novo cliente
        </Button>
      </div>

      {cliente ? (
        <OrigemDosDados
          cliente={cliente}
          gravado={gravado}
          somenteLeitura={somenteLeitura}
          atualizar={atualizar}
          onAtualizar={(sim) => setValue('atualizarDadosCliente', sim, { shouldDirty: true })}
          onTrocar={() => selecionar(null)}
        />
      ) : (
        <CampoBusca<Cliente>
          rotulo="Buscar cliente"
          placeholder="Buscar por nome, CPF/CNPJ ou WhatsApp"
          termo={termo}
          onTermoChange={setTermo}
          resultados={termoBusca === termo.trim() ? busca.data : undefined}
          carregando={termo.trim().length >= MINIMO_BUSCA && atualizando}
          minimo={MINIMO_BUSCA}
          chave={(c) => c.id}
          onEscolher={selecionar}
          renderItem={(c) => (
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium">{c.nome}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {documentoParaExibir(c.documento)} · {mascararTelefone(c.whatsapp)}
                </span>
              </span>
              <span className="text-xs text-muted-foreground">
                {[c.cidade, c.uf].filter(Boolean).join(' · ')}
              </span>
            </div>
          )}
          vazio={
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>Nenhum cliente encontrado.</span>
              <Button variant="outline" className="h-10 rounded-[10px]" onClick={() => setDialogAberto(true)}>
                <Plus aria-hidden />
                Cadastrar novo cliente
              </Button>
            </div>
          }
        />
      )}

      {erroCliente && (
        <p role="alert" className="text-[13px] text-destructive">
          {erroCliente}
        </p>
      )}

      <DialogCliente
        aberto={dialogAberto}
        onAbertoChange={setDialogAberto}
        buscaAtual={cliente ? '' : termo}
        onSalvo={selecionar}
        descricao="Cadastro rápido. Ao salvar, o cliente já entra selecionado no orçamento."
        rotuloSalvar="Salvar e usar no orçamento"
        mensagemAoCriar={(nome) => `${nome} cadastrado e selecionado no orçamento`}
      />
    </section>
  );
}

/**
 * O PDF e o WhatsApp usam a CÓPIA do cliente gravada no orçamento (regra 2), não o cadastro.
 * Mostra de onde vêm os dados e, se o cadastro mudou depois, avisa e oferece atualizar a cópia.
 */
function OrigemDosDados({
  cliente,
  gravado,
  somenteLeitura,
  atualizar,
  onAtualizar,
  onTrocar,
}: {
  cliente: Cliente;
  gravado: OrcamentoSalvo | null;
  somenteLeitura: boolean;
  atualizar: boolean;
  onAtualizar: (sim: boolean) => void;
  onTrocar: () => void;
}) {
  const copia = gravado && gravado.clienteId === cliente.id ? copiaDoSalvo(gravado) : null;
  if (!copia) {
    return (
      <ClienteSelecionado
        dados={cliente}
        titulo="Cliente selecionado"
        origem="Dados do cadastro. São copiados para o orçamento ao salvar e é com eles que o PDF sai."
        onTrocar={onTrocar}
      />
    );
  }
  const mudou = diferencasDoCadastro(copia, cliente);
  const quando = copia.copiadoEm ? ` em ${formatarData(copia.copiadoEm)}` : '';
  if (atualizar) {
    return (
      <div className="flex flex-col gap-2">
        <ClienteSelecionado
          dados={cliente}
          titulo="Cliente do orçamento"
          origem="Dados atuais do cadastro: substituem os gravados no orçamento quando você salvar."
          onTrocar={onTrocar}
        />
        <p role="status" className="flex flex-wrap items-center gap-2 text-[13px] text-foreground/80">
          O PDF e o WhatsApp passam a usar estes dados depois de salvar.
          <button type="button" className="font-medium text-primary underline underline-offset-2" onClick={() => onAtualizar(false)}>
            Manter os dados gravados
          </button>
        </p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <ClienteSelecionado
        dados={copia}
        titulo="Cliente do orçamento"
        origem={`Dados gravados no orçamento${quando}. É o que sai no PDF e no WhatsApp, mesmo que o cadastro mude.`}
        onTrocar={onTrocar}
      />
      {/* aprovado não muda: o aviso e a troca da cópia só valem para orçamento editável */}
      {mudou.length > 0 && !somenteLeitura && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destaque/40 bg-destaque-suave px-4 py-3 text-[13px] text-destaque-texto">
          <span className="flex items-start gap-2">
            <History className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              O cadastro de {cliente.nome} mudou depois que este orçamento foi salvo ({mudou.join(', ')}). O PDF continua
              com os dados gravados.
            </span>
          </span>
          <Button type="button" variant="outline" className="h-10 rounded-[10px] bg-card" onClick={() => onAtualizar(true)}>
            Usar dados atuais do cadastro
          </Button>
        </div>
      )}
    </div>
  );
}

function ClienteSelecionado({
  dados: cliente,
  titulo,
  origem,
  onTrocar,
}: {
  dados: DadosClienteDocumento;
  titulo: string;
  origem: string;
  onTrocar: () => void;
}) {
  const rua = [cliente.logradouro, cliente.numero].filter(Boolean).join(', ');
  const linhaEndereco = [rua, cliente.bairro].filter(Boolean).join(' — ');
  const linhaCidade = [cliente.cidade, cliente.uf, cliente.cep ? mascararCep(cliente.cep) : null]
    .filter(Boolean)
    .join(' · ');

  return (
    // três colunas conforme a largura do próprio cartão (container query), não da janela
    <div className="flex flex-col gap-2.5 rounded-xl border border-[#C3D8F0] bg-[#EAF2FB] px-[18px] py-4">
    <div className="grid grid-cols-2 gap-4 @xl:grid-cols-[repeat(3,minmax(0,1fr))_auto]">
      <div className="flex min-w-0 flex-col gap-0.5">
        <div className="text-xs text-[#2C5484]">{titulo}</div>
        <div className="truncate text-[15px] font-semibold">{cliente.nome}</div>
        <div className="text-[13px] text-foreground/80">{documentoParaExibir(cliente.documento)}</div>
      </div>
      <div className="flex min-w-0 flex-col gap-0.5">
        <div className="text-xs text-[#2C5484]">Contato</div>
        <div className="text-sm">{mascararTelefone(cliente.whatsapp)}</div>
        <div className="truncate text-[13px] text-foreground/80">{cliente.email || 'Sem e-mail'}</div>
      </div>
      <div className="flex min-w-0 flex-col gap-0.5">
        <div className="text-xs text-[#2C5484]">Endereço da instalação</div>
        <div className="truncate text-sm">{linhaEndereco || 'Endereço não informado'}</div>
        <div className="text-[13px] text-foreground/80">{linhaCidade}</div>
      </div>
      <Button
        variant="outline"
        className="h-10 self-center rounded-[10px] bg-card"
        onClick={onTrocar}
        aria-label={`Trocar cliente (${cliente.nome})`}
      >
        Trocar
      </Button>
    </div>
    <p className="text-xs text-[#2C5484]">{origem}</p>
    </div>
  );
}
