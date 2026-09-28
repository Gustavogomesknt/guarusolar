import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Plus, Search, Users } from 'lucide-react';
import { api } from '@/lib/api';
import type { ClienteNaLista } from '@/lib/tipos';
import { mascararDocumento, mascararTelefone } from '@/lib/formatar';
import { useValorAtrasado } from '@/hooks/useValorAtrasado';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Selo } from '@/components/Selo';
import { DialogCliente } from '@/components/DialogCliente';
import { useAtivacaoDeCliente } from './ativarCliente';

const COLUNAS = 'grid-cols-[minmax(0,1fr)_170px_150px_160px_110px_110px]';
const LIMITE = 200;

export function ListaClientes() {
  const navegar = useNavigate();
  const [busca, setBusca] = useState('');
  const [incluirInativos, setIncluirInativos] = useState(false);
  const [novoAberto, setNovoAberto] = useState(false);
  const buscaAtrasada = useValorAtrasado(busca.trim(), 300);
  const ativacao = useAtivacaoDeCliente();

  const parametros = useMemo(() => {
    const p = new URLSearchParams({ limite: String(LIMITE) });
    if (buscaAtrasada) p.set('q', buscaAtrasada);
    if (incluirInativos) p.set('incluirInativos', 'true');
    return p.toString();
  }, [buscaAtrasada, incluirInativos]);

  const clientes = useQuery({
    queryKey: ['clientes', 'lista', parametros],
    queryFn: ({ signal }) => api.get<ClienteNaLista[]>(`/api/clientes?${parametros}`, { signal }),
  });

  return (
    <div className="flex flex-col gap-[22px]">
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div className="flex flex-col gap-1">
          <p className="text-[13px] text-muted-foreground">Comercial</p>
          <h1 className="text-4xl font-bold tracking-[-0.02em]">Clientes</h1>
        </div>
        <Button className="h-11 rounded-[10px] px-[18px] font-semibold" onClick={() => setNovoAberto(true)}>
          <Plus aria-hidden />
          Novo cliente
        </Button>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex h-10 w-full max-w-[340px] items-center gap-2 rounded-[10px] border border-input bg-card px-3 text-muted-foreground focus-within:ring-[3px] focus-within:ring-ring/30">
          <Search className="size-4 shrink-0" aria-hidden />
          <span className="sr-only">Buscar por nome, CPF/CNPJ ou WhatsApp</span>
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, CPF/CNPJ ou WhatsApp"
            className="h-full min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
        </label>
        <label htmlFor="clientes-desativados" className="flex h-10 cursor-pointer items-center gap-2 text-[13px] text-foreground/80">
          <Switch id="clientes-desativados" checked={incluirInativos} onCheckedChange={setIncluirInativos} />
          Mostrar desativados
        </label>
      </div>

      {/* só o quadro da tabela rola de lado em janelas estreitas, nunca a página */}
      <section aria-label="Lista de clientes" className="relative min-w-0 overflow-x-auto rounded-[14px] border bg-card">
        <div role="table" aria-label="Clientes" className="min-w-[860px]">
          <div
            role="row"
            className={`grid ${COLUNAS} gap-4 border-b px-5 py-3 text-xs font-semibold tracking-[0.06em] text-muted-foreground uppercase`}
          >
            <span role="columnheader">Cliente</span>
            <span role="columnheader">CPF/CNPJ</span>
            <span role="columnheader">WhatsApp</span>
            <span role="columnheader">Cidade/UF</span>
            <span role="columnheader" className="text-right">
              Orçamentos
            </span>
            <span role="columnheader">
              <span className="sr-only">Ações</span>
            </span>
          </div>
          <div role="rowgroup">
            {clientes.data?.map((c) => (
              <div
                key={c.id}
                role="row"
                onClick={() => navegar(`/clientes/${c.id}`)}
                className={cn(
                  `grid min-h-[60px] cursor-pointer ${COLUNAS} items-center gap-4 border-b px-5 py-2.5 transition-colors hover:bg-background`,
                  !c.ativo && 'bg-background/60',
                )}
              >
                <span role="cell" className={cn('flex min-w-0 flex-col gap-0.5', !c.ativo && 'opacity-60')}>
                  <span className="flex min-w-0 items-center gap-2">
                    <Link
                      to={`/clientes/${c.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="truncate text-sm font-semibold underline-offset-2 hover:underline"
                    >
                      {c.nome}
                    </Link>
                    {!c.ativo && <Selo className="shrink-0">Desativado</Selo>}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {c.tipoPessoa === 'FISICA' ? 'Pessoa física' : 'Pessoa jurídica'}
                  </span>
                </span>
                <span role="cell" className={cn('font-mono text-[13px]', !c.ativo && 'opacity-60')}>
                  {mascararDocumento(c.documento)}
                </span>
                <span role="cell" className={cn('font-mono text-[13px]', !c.ativo && 'opacity-60')}>
                  {mascararTelefone(c.whatsapp)}
                </span>
                <span role="cell" className={cn('truncate text-sm', !c.ativo && 'opacity-60')}>
                  {[c.cidade, c.uf].filter(Boolean).join('/') || '—'}
                </span>
                <span role="cell" className={cn('text-right font-mono text-sm', !c.ativo && 'opacity-60')}>
                  {c.quantidadeOrcamentos}
                </span>
                <span role="cell" className="flex justify-end">
                  {!c.ativo && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-10 rounded-[10px]"
                      disabled={ativacao.pendenteId === c.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        ativacao.pedir(c);
                      }}
                      aria-label={`Reativar ${c.nome}`}
                    >
                      Reativar
                    </Button>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>

        {clientes.isPending && (
          <p role="status" className="flex items-center justify-center gap-2 px-5 py-10 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Carregando clientes…
          </p>
        )}
        {clientes.data?.length === 0 && (
          <div className="flex flex-col items-center gap-3 px-5 py-12 text-center">
            <Users className="size-8 text-destaque" aria-hidden />
            <p className="text-sm text-muted-foreground">
              {buscaAtrasada ? 'Nenhum cliente encontrado com essa busca.' : 'Nenhum cliente cadastrado ainda.'}
            </p>
            <Button className="h-11 rounded-[10px]" onClick={() => setNovoAberto(true)}>
              <Plus aria-hidden /> Cadastrar cliente
            </Button>
          </div>
        )}
        {clientes.data && clientes.data.length >= LIMITE && (
          <p className="px-5 py-3.5 text-[13px] text-muted-foreground">
            Mostrando os {LIMITE} primeiros em ordem alfabética. Use a busca para encontrar os demais.
          </p>
        )}
      </section>

      <DialogCliente aberto={novoAberto} onAbertoChange={setNovoAberto} buscaAtual={busca} onSalvo={(c) => navegar(`/clientes/${c.id}`)} />
      {ativacao.dialogo}
    </div>
  );
}
