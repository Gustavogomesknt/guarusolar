import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, Copy, KeyRound, Loader2, Pencil, Plus, TriangleAlert } from 'lucide-react';
import { PAPEIS, type Papel } from '@guarusolar/compartilhado';
import { api, ErroApi } from '@guarusolar/web/api';
import { useSessao } from '@guarusolar/web/sessao';
import type { ListaDeUsuarios, UsuarioComSenha, UsuarioNaLista } from '@/lib/tipos';
import { NOME_DO_PAPEL } from '@/app/permissoes';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Selo } from '@/components/Selo';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

// ações com largura fixa: todas as linhas alinham, mesmo sem o botão Desativar (a do próprio ADMIN)
const COLUNAS = 'grid-cols-[minmax(0,1.2fr)_minmax(0,1.4fr)_120px_110px_150px_310px]';
const CHAVE = ['usuarios'];
const CLASSE_SELECT =
  'h-11 w-full rounded-[10px] border border-input bg-card px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30';

/**
 * Usuários (só ADMIN): criar, trocar papel e equipe, nova senha temporária, ativar e desativar.
 * Nada é apagado. A API garante as proteções (não se desativar nem se rebaixar; sempre um ADMIN
 * ativo); a tela só esconde o que não faz sentido.
 */
export function PaginaUsuarios() {
  const { usuario: eu } = useSessao();
  const consultas = useQueryClient();
  const [editando, setEditando] = useState<UsuarioNaLista | 'novo' | null>(null);
  const [senha, setSenha] = useState<UsuarioComSenha | null>(null);
  const [confirmando, setConfirmando] = useState<UsuarioNaLista | null>(null);

  const lista = useQuery({ queryKey: CHAVE, queryFn: ({ signal }) => api.get<ListaDeUsuarios>('/api/usuarios', { signal }) });
  const equipes = lista.data?.equipes ?? [];
  const nomeDaEquipe = (id: string | null) => equipes.find((e) => e.id === id)?.nome ?? id ?? '—';
  const atualizar = () => consultas.invalidateQueries({ queryKey: CHAVE });

  const novaSenha = useMutation({
    mutationFn: (u: UsuarioNaLista) => api.post<UsuarioComSenha>(`/api/usuarios/${u.id}/nova-senha`),
    onSuccess: (resposta) => {
      setSenha(resposta);
      void atualizar();
    },
  });
  const ativacao = useMutation({
    mutationFn: (u: UsuarioNaLista) => api.patch<UsuarioNaLista>(`/api/usuarios/${u.id}`, { ativo: !u.ativo }),
    onSuccess: (u) => {
      toast.success(u.ativo ? `${u.nome} reativado` : `${u.nome} desativado: não entra mais no sistema`);
      setConfirmando(null);
      void atualizar();
    },
  });

  return (
    <div className="flex flex-col gap-[22px]">
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div className="flex flex-col gap-1">
          <p className="text-[13px] text-muted-foreground">Administração</p>
          <h1 className="text-4xl font-bold tracking-[-0.02em]">Usuários</h1>
        </div>
        <Button className="h-11 rounded-[10px] px-[18px] font-semibold" onClick={() => setEditando('novo')}>
          <Plus aria-hidden /> Novo usuário
        </Button>
      </header>

      <section aria-label="Usuários" className="relative min-w-0 overflow-x-auto rounded-[14px] border bg-card">
        <div role="table" aria-label="Lista de usuários" className="min-w-[1000px]">
          <div role="row" className={`grid ${COLUNAS} gap-4 border-b px-5 py-3 text-xs font-semibold tracking-[0.06em] text-muted-foreground uppercase`}>
            <span role="columnheader">Nome</span>
            <span role="columnheader">E-mail</span>
            <span role="columnheader">Papel</span>
            <span role="columnheader">Equipe</span>
            <span role="columnheader">Situação</span>
            <span role="columnheader" className="text-right">
              Ações
            </span>
          </div>
          {lista.isPending ? (
            <p role="status" className="flex items-center gap-2 px-5 py-8 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden /> Carregando usuários…
            </p>
          ) : lista.isError ? (
            <p role="alert" className="px-5 py-8 text-sm text-destructive">
              Não foi possível carregar os usuários.
            </p>
          ) : (
            <div role="rowgroup">
              {lista.data.usuarios.map((u) => {
                const proprio = u.id === eu?.id;
                return (
                  <div key={u.id} role="row" className={cn(`grid min-h-[60px] ${COLUNAS} items-center gap-4 border-b px-5 py-2.5 last:border-b-0`, !u.ativo && 'bg-background/60')}>
                    <span role="cell" className={cn('flex min-w-0 flex-col', !u.ativo && 'opacity-60')}>
                      <span className="truncate text-sm font-semibold">
                        {u.nome}
                        {proprio && <span className="font-normal text-muted-foreground"> (você)</span>}
                      </span>
                    </span>
                    <span role="cell" className={cn('truncate text-sm', !u.ativo && 'opacity-60')}>
                      {u.email}
                    </span>
                    <span role="cell" className="text-sm">
                      {NOME_DO_PAPEL[u.papel]}
                    </span>
                    <span role="cell" className="truncate text-sm">
                      {u.papel === 'TECNICO' ? nomeDaEquipe(u.equipeId) : '—'}
                    </span>
                    <span role="cell" className="flex flex-wrap gap-1.5">
                      {u.ativo ? <Selo className="border-[#9FD3B4] bg-[#DCF0E3] text-[#17653E]">Ativo</Selo> : <Selo>Desativado</Selo>}
                      {u.ativo && u.senhaTemporaria && <Selo variante="destaque">Senha temporária</Selo>}
                    </span>
                    <span role="cell" className="flex flex-wrap justify-end gap-1.5">
                      <Button variant="outline" size="sm" className="h-9 rounded-[8px] bg-card" onClick={() => setEditando(u)} aria-label={`Editar ${u.nome}`}>
                        <Pencil aria-hidden /> Editar
                      </Button>
                      {u.ativo && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-9 rounded-[8px] bg-card"
                          disabled={novaSenha.isPending}
                          onClick={() => novaSenha.mutate(u)}
                          aria-label={`Gerar nova senha para ${u.nome}`}
                        >
                          <KeyRound aria-hidden /> Nova senha
                        </Button>
                      )}
                      {!proprio && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-9 text-muted-foreground hover:text-foreground"
                          onClick={() => (u.ativo ? setConfirmando(u) : ativacao.mutate(u))}
                          disabled={ativacao.isPending}
                        >
                          {u.ativo ? 'Desativar' : 'Reativar'}
                        </Button>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
      <p className="text-[13px] text-muted-foreground">
        Nada é apagado: desativar tira o acesso na hora e mantém o histórico (orçamentos, fotos, validações) com o nome da pessoa.
      </p>

      <DialogUsuario
        alvo={editando}
        eu={eu?.id}
        equipes={equipes}
        onFechar={() => setEditando(null)}
        onCriado={(resposta) => {
          setEditando(null);
          // abre a senha depois que o cadastro terminou de fechar (as duas janelas não se sobrepõem)
          window.setTimeout(() => setSenha(resposta), 200);
          void atualizar();
        }}
        onSalvo={() => {
          setEditando(null);
          void atualizar();
        }}
      />
      <DialogSenha resposta={senha} onFechar={() => setSenha(null)} />

      <Dialog open={confirmando !== null} onOpenChange={(abrir) => !abrir && setConfirmando(null)}>
        <DialogContent className="bg-card sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Desativar {confirmando?.nome}?</DialogTitle>
            <DialogDescription>
              A pessoa sai do sistema na hora e não consegue mais entrar. Nada é apagado: dá para reativar depois.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" className="h-11 rounded-[10px]" onClick={() => setConfirmando(null)}>
              Voltar
            </Button>
            <Button variant="destructive" className="h-11 rounded-[10px]" disabled={ativacao.isPending} onClick={() => confirmando && ativacao.mutate(confirmando)}>
              {ativacao.isPending && <Loader2 className="animate-spin" aria-hidden />} Desativar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Criar (nome, e-mail, papel, equipe) ou editar (nome, papel, equipe; o e-mail não muda aqui). */
function DialogUsuario({
  alvo,
  eu,
  equipes,
  onFechar,
  onCriado,
  onSalvo,
}: {
  alvo: UsuarioNaLista | 'novo' | null;
  eu: string | undefined;
  equipes: { id: string; nome: string }[];
  onFechar: () => void;
  onCriado: (resposta: UsuarioComSenha) => void;
  onSalvo: () => void;
}) {
  // durante a animação de fechar, `alvo` já é null: mostra o último aberto, sem "Editar undefined"
  const [ultimo, setUltimo] = useState(alvo);
  useEffect(() => {
    if (alvo) setUltimo(alvo);
  }, [alvo]);
  const mostrado = alvo ?? ultimo;
  const novo = mostrado === 'novo';
  const existente = mostrado && mostrado !== 'novo' ? mostrado : null;
  const proprio = existente?.id === eu;
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [papel, setPapel] = useState<Papel>('COMERCIAL');
  const [equipeId, setEquipeId] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!alvo) return;
    setNome(existente?.nome ?? '');
    setEmail(existente?.email ?? '');
    setPapel(existente?.papel ?? 'COMERCIAL');
    setEquipeId(existente?.equipeId ?? equipes[0]?.id ?? '');
    setErro(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alvo]);

  const salvar = useMutation({
    mutationFn: (): Promise<UsuarioComSenha | UsuarioNaLista> => {
      const corpo = { nome: nome.trim(), papel, equipeId: papel === 'TECNICO' ? equipeId : null };
      return novo
        ? api.post<UsuarioComSenha>('/api/usuarios', { ...corpo, email: email.trim() })
        : api.patch<UsuarioNaLista>(`/api/usuarios/${existente!.id}`, corpo);
    },
    meta: { erroTratadoNoFormulario: true },
    onSuccess: (resposta) => {
      if (novo) onCriado(resposta as UsuarioComSenha);
      else {
        toast.success('Usuário atualizado');
        onSalvo();
      }
    },
    onError: (e) => setErro(e instanceof ErroApi ? (e.detalhes[0]?.mensagem ?? e.message) : 'Não foi possível salvar.'),
  });

  return (
    <Dialog open={alvo !== null} onOpenChange={(abrir) => !abrir && onFechar()}>
      <DialogContent className="bg-card sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{novo ? 'Novo usuário' : `Editar ${existente?.nome}`}</DialogTitle>
          <DialogDescription>
            {novo
              ? 'O sistema gera uma senha temporária para você entregar à pessoa. Ela troca no primeiro acesso.'
              : 'Mudar o papel ou a equipe encerra o login atual da pessoa: ela entra de novo com o acesso novo.'}
          </DialogDescription>
        </DialogHeader>
        <form
          id="form-usuario"
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            setErro(null);
            salvar.mutate();
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="usuario-nome">Nome</Label>
            <Input id="usuario-nome" value={nome} onChange={(e) => setNome(e.target.value)} required minLength={3} className="h-11 rounded-[10px]" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="usuario-email">E-mail (é o login)</Label>
            <Input
              id="usuario-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={!novo}
              aria-describedby={!novo ? 'usuario-email-ajuda' : undefined}
              className="h-11 rounded-[10px]"
            />
            {!novo && (
              <p id="usuario-email-ajuda" className="text-xs text-muted-foreground">
                O e-mail não muda por aqui (comando no SOCORRO.md).
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="usuario-papel">Papel</Label>
              <select
                id="usuario-papel"
                value={papel}
                onChange={(e) => setPapel(e.target.value as Papel)}
                disabled={proprio}
                aria-describedby={proprio ? 'usuario-papel-ajuda' : undefined}
                className={CLASSE_SELECT}
              >
                {PAPEIS.map((p) => (
                  <option key={p} value={p}>
                    {NOME_DO_PAPEL[p]}
                  </option>
                ))}
              </select>
            </div>
            {papel === 'TECNICO' && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="usuario-equipe">Equipe</Label>
                <select id="usuario-equipe" value={equipeId} onChange={(e) => setEquipeId(e.target.value)} className={CLASSE_SELECT}>
                  {equipes.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.nome}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          {proprio && (
            <p id="usuario-papel-ajuda" className="-mt-2 text-xs text-muted-foreground">
              Você não pode mudar o seu próprio papel.
            </p>
          )}
          {erro && (
            <p role="alert" className="text-[13px] text-destructive">
              {erro}
            </p>
          )}
        </form>
        <DialogFooter>
          <Button variant="outline" className="h-11 rounded-[10px]" onClick={onFechar}>
            Cancelar
          </Button>
          <Button type="submit" form="form-usuario" className="h-11 rounded-[10px] font-semibold" disabled={salvar.isPending}>
            {salvar.isPending && <Loader2 className="animate-spin" aria-hidden />} {novo ? 'Criar e gerar senha' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** A senha temporária, mostrada UMA vez (o banco só guarda o hash). */
function DialogSenha({ resposta, onFechar }: { resposta: UsuarioComSenha | null; onFechar: () => void }) {
  const [copiada, setCopiada] = useState(false);
  useEffect(() => setCopiada(false), [resposta]);
  const copiar = async () => {
    if (!resposta) return;
    try {
      await navigator.clipboard.writeText(resposta.senhaTemporaria);
      setCopiada(true);
    } catch {
      toast.error('Não foi possível copiar. Selecione a senha e copie com Ctrl+C.');
    }
  };
  return (
    <Dialog open={resposta !== null} onOpenChange={(abrir) => !abrir && onFechar()}>
      {resposta && (
        <DialogContent className="bg-card sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="pr-8">Senha temporária de {resposta.usuario.nome}</DialogTitle>
            <DialogDescription>
              Login: <strong className="text-foreground">{resposta.usuario.email}</strong>. No primeiro acesso, o sistema pede para a pessoa criar a própria senha.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 rounded-xl border bg-background px-4 py-3">
            <output aria-label="Senha temporária" className="flex-1 font-mono text-xl tracking-[0.08em] select-all">
              {resposta.senhaTemporaria}
            </output>
            <Button variant="outline" className="h-10 rounded-[10px] bg-card" onClick={() => void copiar()}>
              {copiada ? <Check aria-hidden /> : <Copy aria-hidden />} {copiada ? 'Copiada' : 'Copiar'}
            </Button>
          </div>
          <p role="note" className="flex items-start gap-2 rounded-xl border border-destaque/40 bg-destaque-suave px-3.5 py-2.5 text-[13px] text-destaque-texto">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            Esta senha não aparece de novo. Copie agora e entregue à pessoa por mensagem particular. Se perder, gere outra com "Nova senha".
          </p>
          <DialogFooter>
            <Button className="h-11 rounded-[10px] font-semibold" onClick={onFechar}>
              Já copiei, fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
}
