import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { FilePlus2, Loader2, Pencil } from 'lucide-react';
import { formatarData, ROTULO_STATUS_PROJETO } from '@guarusolar/compartilhado';
import { api, ErroApi } from '@guarusolar/web/api';
import type { FichaDoCliente } from '@/lib/tipos';
import { formatarBRL, mascararCep, mascararDocumento, mascararTelefone } from '@/lib/formatar';
import { Button } from '@/components/ui/button';
import { Selo } from '@/components/Selo';
import { DialogCliente } from '@/components/DialogCliente';
import { SeloStatus } from '@/paginas/orcamentos/MenuStatus';
import { useAtivacaoDeCliente } from './ativarCliente';

export function FichaCliente() {
  const { id = '' } = useParams();
  const navegar = useNavigate();
  const [editando, setEditando] = useState(false);
  const ativacao = useAtivacaoDeCliente();

  const ficha = useQuery({
    queryKey: ['clientes', 'ficha', id],
    queryFn: ({ signal }) => api.get<FichaDoCliente>(`/api/clientes/${id}`, { signal }),
  });

  if (ficha.isPending) {
    return (
      <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden /> Carregando cliente…
      </p>
    );
  }
  if (ficha.isError) {
    const naoExiste = ficha.error instanceof ErroApi && ficha.error.status === 404;
    return (
      <div className="flex flex-col items-start gap-3">
        <h1 className="text-2xl font-bold">{naoExiste ? 'Cliente não encontrado' : 'Não foi possível abrir o cliente'}</h1>
        <Button asChild variant="outline" className="h-11 rounded-[10px]">
          <Link to="/clientes">Voltar para a lista</Link>
        </Button>
      </div>
    );
  }

  const c = ficha.data;
  const tipoDocumento = c.documento.length === 14 ? 'CNPJ' : 'CPF';
  const rua = [c.logradouro, c.numero].filter(Boolean).join(', ');
  const endereco = [rua, c.complemento, c.bairro].filter(Boolean).join(' — ');
  const cidade = [c.cidade, c.uf].filter(Boolean).join('/');

  return (
    <div className="flex flex-col gap-[22px]">
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div className="flex min-w-0 flex-col gap-1">
          <nav aria-label="Caminho" className="text-[13px] text-muted-foreground">
            <Link to="/clientes" className="hover:underline">
              Clientes
            </Link>{' '}
            <span aria-hidden>/</span> <span aria-current="page">{c.nome}</span>
          </nav>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-[34px] font-bold tracking-[-0.02em] break-words">{c.nome}</h1>
            {!c.ativo && <Selo>Desativado</Selo>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <Button variant="outline" className="h-11 rounded-[10px] bg-card" onClick={() => setEditando(true)}>
            <Pencil aria-hidden /> Editar dados
          </Button>
          <Button
            className="h-11 rounded-[10px] font-semibold"
            disabled={!c.ativo}
            onClick={() => navegar(`/orcamentos/novo?cliente=${c.id}`)}
            aria-describedby={!c.ativo ? 'dica-desativado' : undefined}
          >
            <FilePlus2 aria-hidden /> Novo orçamento para este cliente
          </Button>
        </div>
      </header>
      {!c.ativo && (
        <p id="dica-desativado" className="-mt-3 text-[13px] text-muted-foreground">
          Cliente desativado: reative para criar novos orçamentos para ele.
        </p>
      )}

      <section aria-labelledby="titulo-dados" className="grid gap-5 rounded-[14px] border bg-card px-6 py-[22px] md:grid-cols-3">
        <h2 id="titulo-dados" className="sr-only">
          Dados do cliente
        </h2>
        <Dado rotulo={c.tipoPessoa === 'FISICA' ? 'Pessoa física' : 'Pessoa jurídica'}>
          <span className="font-mono">
            {tipoDocumento} {mascararDocumento(c.documento)}
          </span>
        </Dado>
        <Dado rotulo="Contato">
          <span>WhatsApp {mascararTelefone(c.whatsapp)}</span>
          <span className="text-muted-foreground">{c.email || 'Sem e-mail'}</span>
        </Dado>
        <Dado rotulo="Endereço da instalação">
          <span>{endereco || 'Endereço não informado'}</span>
          <span className="text-muted-foreground">
            {[cidade, c.cep ? `CEP ${mascararCep(c.cep)}` : null].filter(Boolean).join(' · ')}
          </span>
        </Dado>
      </section>

      <section aria-labelledby="titulo-orcamentos" className="relative min-w-0 overflow-x-auto rounded-[14px] border bg-card">
        <h2 id="titulo-orcamentos" className="px-5 pt-5 pb-3 text-xl font-bold">
          Orçamentos <span className="font-mono text-base font-normal text-muted-foreground">({c.orcamentos.length})</span>
        </h2>
        {c.orcamentos.length === 0 ? (
          <p className="px-5 pb-6 text-sm text-muted-foreground">Nenhum orçamento para este cliente ainda.</p>
        ) : (
          <div role="table" aria-label="Orçamentos do cliente" className="min-w-[620px]">
            <div
              role="row"
              className="grid grid-cols-[140px_110px_110px_minmax(0,1fr)_230px] gap-4 border-y px-5 py-3 text-xs font-semibold tracking-[0.06em] text-muted-foreground uppercase"
            >
              <span role="columnheader">Código</span>
              <span role="columnheader">Criado em</span>
              <span role="columnheader">Validade</span>
              <span role="columnheader" className="text-right">
                Valor
              </span>
              <span role="columnheader">Status</span>
            </div>
            <div role="rowgroup">
              {c.orcamentos.map((o) => (
                <div
                  key={o.id}
                  role="row"
                  onClick={() => navegar(`/orcamentos/${o.id}`)}
                  className="grid min-h-14 cursor-pointer grid-cols-[140px_110px_110px_minmax(0,1fr)_230px] items-center gap-4 border-b px-5 py-2 last:border-b-0 hover:bg-background"
                >
                  <span role="cell">
                    <Link
                      to={`/orcamentos/${o.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="font-mono text-[13px] underline-offset-2 hover:underline"
                    >
                      {o.codigo}
                    </Link>
                  </span>
                  <span role="cell" className="text-sm">
                    {formatarData(o.criadoEm)}
                  </span>
                  <span role="cell" className="text-sm">
                    {formatarData(o.validade)}
                  </span>
                  <span role="cell" className="text-right font-mono text-sm">
                    {formatarBRL(Number(o.valorTotal))}
                  </span>
                  <span role="cell" className="flex flex-wrap items-center gap-2">
                    <SeloStatus status={o.status} />
                    {o.projeto && (
                      <Link
                        to={`/projetos/${o.projeto.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="font-mono text-xs text-primary underline-offset-2 hover:underline"
                        aria-label={`Projeto ${o.projeto.codigo}: ${ROTULO_STATUS_PROJETO[o.projeto.status]}`}
                      >
                        {o.projeto.codigo}
                      </Link>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* ação discreta, com confirmação: desativar não apaga nada */}
      <div className="flex flex-wrap items-center gap-3 border-t pt-4 text-[13px] text-muted-foreground">
        {c.ativo ? (
          <>
            <Button
              variant="ghost"
              size="sm"
              className="h-10 px-2 text-muted-foreground hover:text-foreground"
              disabled={ativacao.pendenteId === c.id}
              onClick={() => ativacao.pedir(c)}
            >
              Desativar cliente
            </Button>
            <span>Sai das buscas de novos orçamentos; os orçamentos dele continuam.</span>
          </>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="h-10 rounded-[10px]"
            disabled={ativacao.pendenteId === c.id}
            onClick={() => ativacao.pedir(c)}
          >
            Reativar cliente
          </Button>
        )}
      </div>

      <DialogCliente aberto={editando} onAbertoChange={setEditando} cliente={c} onSalvo={() => undefined} />
      {ativacao.dialogo}
    </div>
  );
}

function Dado({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 text-sm">
      <span className="text-xs text-muted-foreground">{rotulo}</span>
      {children}
    </div>
  );
}
