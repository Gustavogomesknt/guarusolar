import { Suspense } from 'react';
import { Link, NavLink, Outlet } from 'react-router';
import { Loader2, LogOut } from 'lucide-react';
import { useSessao } from '@/lib/sessao';
import { cn } from '@/lib/utils';
import { Logo } from '@/components/Logo';
import { Selo } from '@/components/Selo';
import { MENU } from './menu';
import { NOME_DO_PAPEL, podeAcessar } from './permissoes';

export function Layout() {
  const { usuario } = useSessao();
  if (!usuario) return null;

  const itens = MENU.filter((item) => podeAcessar(usuario.papel, item.papeis));

  return (
    <div className="flex min-h-svh">
      <aside className="flex w-60 shrink-0 flex-col bg-sidebar text-sidebar-foreground">
        <Logo claro className="px-5 py-6" />

        <nav className="flex-1 space-y-0.5 px-3" aria-label="Menu principal">
          {itens.map(({ rotulo, caminho, icone: Icone, disponivel }) =>
            disponivel ? (
              <NavLink
                key={caminho}
                to={caminho}
                end
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                    'hover:bg-sidebar-accent focus-visible:outline-2 focus-visible:outline-sidebar-ring',
                    isActive && 'bg-sidebar-primary',
                  )
                }
              >
                <Icone className="size-4" aria-hidden />
                {rotulo}
              </NavLink>
            ) : (
              <span
                key={caminho}
                aria-disabled
                className="flex cursor-default items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground/60"
              >
                <Icone className="size-4" aria-hidden />
                {rotulo}
                <Selo className="ml-auto border-sidebar-border bg-transparent text-sidebar-foreground/70">
                  Em breve
                </Selo>
              </span>
            ),
          )}
        </nav>

        <div className="border-t border-sidebar-border px-5 py-4">
          <p className="truncate text-sm font-medium">{usuario.nome}</p>
          <p className="text-xs text-sidebar-foreground/70">{NOME_DO_PAPEL[usuario.papel]}</p>
          {/* Link para /sair (e não sair() direto): passa pela confirmação de alterações não salvas */}
          <Link
            to="/sair"
            className="mt-3 flex min-h-10 items-center gap-2 text-sm text-sidebar-foreground/80 hover:text-white focus-visible:outline-2 focus-visible:outline-sidebar-ring"
          >
            <LogOut className="size-4" aria-hidden />
            Sair
          </Link>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-8 py-8">
        {/* telas carregadas sob demanda (lazy) mostram isto enquanto o arquivo chega */}
        <Suspense
          fallback={
            <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden /> Carregando…
            </p>
          }
        >
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
}
