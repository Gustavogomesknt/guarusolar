import { useId, useState, type FormEvent } from 'react';
import { ErroApi } from './api';
import { useSessao } from './sessao';

/**
 * Troca da própria senha, igual no escritório e no app do técnico (`grande` = campos e botão
 * maiores, para o celular). As regras da senha nova ficam na API (lib/senha.ts); aqui só a
 * confirmação e o tamanho mínimo, para avisar antes de enviar.
 */
export function FormularioTrocaSenha({
  obrigatoria = false,
  grande = false,
  onConcluido,
}: {
  /** primeiro acesso com senha temporária: explica por que a troca é necessária */
  obrigatoria?: boolean;
  grande?: boolean;
  onConcluido: () => void;
}) {
  const { trocarSenha } = useSessao();
  const id = useId();
  const [atual, setAtual] = useState('');
  const [nova, setNova] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [mostrar, setMostrar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const confirmacaoDiferente = confirmacao.length > 0 && confirmacao !== nova;

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    if (!atual) return setErro('Informe a senha atual.');
    if (nova.length < 8) return setErro('A senha nova precisa ter pelo menos 8 caracteres.');
    if (nova !== confirmacao) return setErro('A confirmação não é igual à senha nova.');
    setEnviando(true);
    try {
      await trocarSenha(atual, nova);
      onConcluido();
    } catch (falha) {
      setErro(falha instanceof ErroApi ? falha.message : 'Não foi possível trocar a senha. Tente de novo.');
    } finally {
      setEnviando(false);
    }
  }

  const campo = `w-full rounded-xl border border-input bg-card px-3.5 outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30 aria-invalid:border-destructive ${grande ? 'h-12 text-base' : 'h-11 text-sm'}`;
  const rotulo = 'flex flex-col gap-1.5 text-sm font-medium';

  return (
    <form onSubmit={enviar} noValidate className="flex flex-col gap-4">
      {obrigatoria && (
        <p role="status" className="rounded-xl border border-primary/30 bg-secondary px-3 py-2.5 text-sm text-secondary-foreground">
          Você entrou com uma senha temporária. Crie a sua senha pessoal para continuar.
        </p>
      )}

      <label className={rotulo} htmlFor={`${id}-atual`}>
        {obrigatoria ? 'Senha temporária' : 'Senha atual'}
        <input
          id={`${id}-atual`}
          type={mostrar ? 'text' : 'password'}
          autoComplete="current-password"
          value={atual}
          onChange={(e) => setAtual(e.target.value)}
          className={campo}
        />
      </label>
      <label className={rotulo} htmlFor={`${id}-nova`}>
        Senha nova
        <input
          id={`${id}-nova`}
          type={mostrar ? 'text' : 'password'}
          autoComplete="new-password"
          value={nova}
          onChange={(e) => setNova(e.target.value)}
          aria-describedby={`${id}-regras`}
          className={campo}
        />
        <span id={`${id}-regras`} className="text-xs font-normal text-muted-foreground">
          Pelo menos 8 caracteres. Uma frase curta é mais fácil de lembrar e mais difícil de adivinhar.
        </span>
      </label>
      <label className={rotulo} htmlFor={`${id}-confirmacao`}>
        Repita a senha nova
        <input
          id={`${id}-confirmacao`}
          type={mostrar ? 'text' : 'password'}
          autoComplete="new-password"
          value={confirmacao}
          onChange={(e) => setConfirmacao(e.target.value)}
          aria-invalid={confirmacaoDiferente || undefined}
          className={campo}
        />
        {confirmacaoDiferente && <span className="text-xs font-normal text-destructive">Ainda não está igual à senha nova.</span>}
      </label>

      <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm">
        <input type="checkbox" checked={mostrar} onChange={(e) => setMostrar(e.target.checked)} className="size-5 accent-primary" />
        Mostrar as senhas
      </label>

      {erro && (
        <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
          {erro}
        </p>
      )}

      <button
        type="submit"
        disabled={enviando}
        className={`rounded-xl bg-primary font-semibold text-primary-foreground disabled:opacity-60 ${grande ? 'h-14 text-base' : 'h-11 text-sm'}`}
      >
        {enviando ? 'Salvando…' : 'Salvar senha nova'}
      </button>
    </form>
  );
}
