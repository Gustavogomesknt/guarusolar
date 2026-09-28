import { Navigate, Outlet, useLocation } from 'react-router';
import { WifiOff } from 'lucide-react';
import type { Papel } from '@guarusolar/compartilhado';
import { useSessao, type EstadoLogin } from '@/lib/sessao';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { TelaCarregando, TelaCheia } from '@/components/TelaCheia';
import { SemAcesso } from '@/paginas/SemAcesso';
import { podeAcessar } from './permissoes';

/** Exige login e um dos papéis informados (ADMIN sempre passa, como na API). */
export function RotaProtegida({ papeis }: { papeis: readonly Papel[] }) {
  const { usuario, carregando, falhaAoConectar, tentarNovamente } = useSessao();
  const local = useLocation();

  if (carregando) return <TelaCarregando />;

  if (falhaAoConectar) {
    return (
      <TelaCheia>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <WifiOff className="size-5 text-destaque" aria-hidden />
              Sem conexão
            </CardTitle>
            <CardDescription>{falhaAoConectar}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" onClick={tentarNovamente}>
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      </TelaCheia>
    );
  }

  if (!usuario) {
    return <Navigate to="/login" replace state={{ de: local.pathname } satisfies EstadoLogin} />;
  }

  if (!podeAcessar(usuario.papel, papeis)) return <SemAcesso />;

  return <Outlet />;
}
