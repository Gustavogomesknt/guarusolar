import { Navigate, Outlet, useLocation } from 'react-router';
import { WifiOff } from 'lucide-react';
import { useSessao, type EstadoLogin } from '@guarusolar/web/sessao';
import { Button } from '@/components/ui/button';
import { TelaCarregando, TelaCheia } from '@/components/TelaCheia';

/** Exige login. O papel já foi conferido pela sessão (papeisAceitos) e é garantido pela API. */
export function RotaProtegida() {
  const { usuario, carregando, falhaAoConectar, tentarNovamente } = useSessao();
  const local = useLocation();

  if (carregando) return <TelaCarregando />;

  if (falhaAoConectar) {
    return (
      <TelaCheia>
        <div className="flex flex-col gap-4 rounded-2xl border bg-card p-5">
          <h1 className="flex items-center gap-2 text-xl font-bold">
            <WifiOff className="size-5 text-destaque" aria-hidden />
            Sem conexão
          </h1>
          <p className="text-muted-foreground">{falhaAoConectar}</p>
          <Button className="h-12 rounded-xl text-base" onClick={tentarNovamente}>
            Tentar novamente
          </Button>
        </div>
      </TelaCheia>
    );
  }

  if (!usuario) return <Navigate to="/login" replace state={{ de: local.pathname } satisfies EstadoLogin} />;

  return <Outlet />;
}
