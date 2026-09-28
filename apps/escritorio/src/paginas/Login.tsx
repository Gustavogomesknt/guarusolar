import { Navigate, useLocation, useNavigate } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Info, Loader2 } from 'lucide-react';
import { ErroApi } from '@/lib/api';
import { useSessao, type EstadoLogin } from '@/lib/sessao';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TelaCheia } from '@/components/TelaCheia';

const esquemaLogin = z.object({
  email: z.string().trim().min(1, 'Informe o e-mail').email('Informe um e-mail válido'),
  senha: z.string().min(6, 'A senha tem pelo menos 6 caracteres'),
});
type DadosLogin = z.infer<typeof esquemaLogin>;

export function Login() {
  const { usuario, aviso, entrar } = useSessao();
  const navegar = useNavigate();
  const estado = (useLocation().state ?? {}) as EstadoLogin;

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<DadosLogin>({ resolver: zodResolver(esquemaLogin) });

  if (usuario) return <Navigate to={estado.de ?? '/'} replace />;

  const enviar = handleSubmit(async ({ email, senha }) => {
    try {
      await entrar(email, senha);
      navegar(estado.de ?? '/', { replace: true });
    } catch (erro) {
      if (erro instanceof ErroApi && erro.detalhes.length > 0) {
        for (const { campo, mensagem } of erro.detalhes) {
          if (campo === 'email' || campo === 'senha') setError(campo, { message: mensagem });
        }
        return;
      }
      setError('root', {
        message: erro instanceof ErroApi ? erro.message : 'Não foi possível entrar. Tente novamente.',
      });
    }
  });

  return (
    <TelaCheia>
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Entrar</CardTitle>
          <CardDescription>Acesso do comercial e da gestão.</CardDescription>
        </CardHeader>
        <CardContent>
          {aviso && (
            <p
              role="status"
              className="mb-4 flex gap-2 rounded-md border border-primary/30 bg-secondary px-3 py-2 text-sm text-secondary-foreground"
            >
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
              {aviso}
            </p>
          )}

          <form onSubmit={enviar} noValidate className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                autoFocus
                aria-invalid={!!errors.email}
                aria-describedby={errors.email ? 'erro-email' : undefined}
                {...register('email')}
              />
              {errors.email && (
                <p id="erro-email" className="text-sm text-destructive">
                  {errors.email.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="senha">Senha</Label>
              <Input
                id="senha"
                type="password"
                autoComplete="current-password"
                aria-invalid={!!errors.senha}
                aria-describedby={errors.senha ? 'erro-senha' : undefined}
                {...register('senha')}
              />
              {errors.senha && (
                <p id="erro-senha" className="text-sm text-destructive">
                  {errors.senha.message}
                </p>
              )}
            </div>

            {errors.root && (
              <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {errors.root.message}
              </p>
            )}

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="animate-spin" aria-hidden />}
              {isSubmitting ? 'Entrando…' : 'Entrar'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </TelaCheia>
  );
}
