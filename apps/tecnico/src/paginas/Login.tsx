import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { Info, Loader2 } from 'lucide-react';
import { ErroApi } from '@guarusolar/web/api';
import { useSessao, type EstadoLogin } from '@guarusolar/web/sessao';
import { Button } from '@/components/ui/button';
import { TelaCheia } from '@/components/TelaCheia';
import { AVISO_PERFIL_COMERCIAL, ENDERECO_DO_ESCRITORIO } from '@/app/acesso';

const CLASSE_CAMPO =
  'h-12 w-full rounded-xl border border-input bg-card px-3.5 text-base outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30 aria-invalid:border-destructive';

/** Para quem entrou no app errado (perfil Comercial): o caminho do escritório. */
const LinkDoEscritorio = () => (
  <a href={ENDERECO_DO_ESCRITORIO} className="mt-1.5 block font-semibold text-primary underline underline-offset-2">
    Abrir o sistema do escritório
  </a>
);

export function Login() {
  const { usuario, aviso, entrar } = useSessao();
  const navegar = useNavigate();
  const estado = (useLocation().state ?? {}) as EstadoLogin;
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [entrando, setEntrando] = useState(false);

  if (usuario) return <Navigate to={estado.de ?? '/'} replace />;

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (!email.trim() || !senha) return setErro('Informe o e-mail e a senha.');
    setErro(null);
    setEntrando(true);
    try {
      await entrar(email.trim(), senha);
      navegar(estado.de ?? '/', { replace: true });
    } catch (falha) {
      setErro(falha instanceof ErroApi ? falha.message : 'Não foi possível entrar. Tente novamente.');
    } finally {
      setEntrando(false);
    }
  }

  return (
    <TelaCheia>
      <div className="flex flex-col gap-5 rounded-2xl border bg-card p-5">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold">Entrar</h1>
          <p className="text-muted-foreground">Agenda e fotos dos serviços, para o técnico em campo.</p>
        </div>

        {aviso && (
          <p role="status" className="flex gap-2 rounded-xl border border-primary/30 bg-secondary px-3 py-2.5 text-secondary-foreground">
            <Info className="mt-0.5 size-5 shrink-0" aria-hidden />
            <span>
              {aviso}
              {aviso === AVISO_PERFIL_COMERCIAL && <LinkDoEscritorio />}
            </span>
          </p>
        )}

        <form onSubmit={enviar} noValidate className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 font-medium">
            E-mail
            <input
              type="email"
              inputMode="email"
              autoComplete="username"
              autoCapitalize="none"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={erro !== null && !email.trim()}
              className={CLASSE_CAMPO}
            />
          </label>
          <label className="flex flex-col gap-1.5 font-medium">
            Senha
            <input
              type="password"
              autoComplete="current-password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              aria-invalid={erro !== null && !senha}
              className={CLASSE_CAMPO}
            />
          </label>

          {erro && (
            <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-destructive">
              {erro}
              {erro === AVISO_PERFIL_COMERCIAL && <LinkDoEscritorio />}
            </p>
          )}

          <Button type="submit" className="h-14 rounded-2xl text-base font-semibold" disabled={entrando}>
            {entrando && <Loader2 className="animate-spin" aria-hidden />}
            {entrando ? 'Entrando…' : 'Entrar'}
          </Button>
        </form>
      </div>
    </TelaCheia>
  );
}
