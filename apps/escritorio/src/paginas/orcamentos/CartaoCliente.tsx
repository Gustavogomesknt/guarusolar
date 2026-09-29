import { useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { api } from '@guarusolar/web/api';
import type { Cliente } from '@/lib/tipos';
import { documentoParaExibir, mascararCep, mascararTelefone } from '@/lib/formatar';
import { useValorAtrasado } from '@/hooks/useValorAtrasado';
import { Button } from '@/components/ui/button';
import { CampoBusca } from '@/components/CampoBusca';
import { DialogCliente } from '@/components/DialogCliente';
import type { FormularioOrcamento } from './formulario';

const MINIMO_BUSCA = 2;

export function CartaoCliente() {
  const {
    control,
    setValue,
    clearErrors,
    formState: { errors },
  } = useFormContext<FormularioOrcamento>();
  const cliente = useWatch({ control, name: 'cliente' });
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
        <ClienteSelecionado cliente={cliente} onTrocar={() => selecionar(null)} />
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

function ClienteSelecionado({ cliente, onTrocar }: { cliente: Cliente; onTrocar: () => void }) {
  const rua = [cliente.logradouro, cliente.numero].filter(Boolean).join(', ');
  const linhaEndereco = [rua, cliente.bairro].filter(Boolean).join(' — ');
  const linhaCidade = [cliente.cidade, cliente.uf, cliente.cep ? mascararCep(cliente.cep) : null]
    .filter(Boolean)
    .join(' · ');

  return (
    // três colunas conforme a largura do próprio cartão (container query), não da janela
    <div className="grid grid-cols-2 gap-4 rounded-xl border border-[#C3D8F0] bg-[#EAF2FB] px-[18px] py-4 @xl:grid-cols-[repeat(3,minmax(0,1fr))_auto]">
      <div className="flex min-w-0 flex-col gap-0.5">
        <div className="text-xs text-[#2C5484]">Cliente selecionado</div>
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
  );
}
