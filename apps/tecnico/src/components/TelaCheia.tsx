import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { Logo } from './Logo';

/** Tela centralizada: login, espera inicial e avisos. */
export function TelaCheia({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-8 bg-background px-4 py-10">
      <Logo />
      <div className="w-full max-w-sm">{children}</div>
    </main>
  );
}

export function TelaCarregando() {
  return (
    <TelaCheia>
      <p className="flex items-center justify-center gap-2 text-muted-foreground" role="status">
        <Loader2 className="size-5 animate-spin" aria-hidden />
        Carregando…
      </p>
    </TelaCheia>
  );
}
