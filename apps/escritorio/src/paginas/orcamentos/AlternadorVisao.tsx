import { NavLink } from 'react-router';
import { KanbanSquare, Table2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/** "Tabela / Kanban": troca entre a lista (/orcamentos) e o pipeline (/pipeline). */
export function AlternadorVisao() {
  const classe = ({ isActive }: { isActive: boolean }) =>
    cn(
      'inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors',
      isActive ? 'bg-card text-foreground shadow-sm' : 'text-foreground/70 hover:text-foreground',
    );
  return (
    <nav aria-label="Modo de visualização" className="flex gap-1 rounded-xl bg-[#E7EBF2] p-1">
      <NavLink to="/orcamentos" end className={classe}>
        <Table2 className="size-4" aria-hidden />
        Tabela
      </NavLink>
      <NavLink to="/pipeline" className={classe}>
        <KanbanSquare className="size-4" aria-hidden />
        Kanban
      </NavLink>
    </nav>
  );
}
