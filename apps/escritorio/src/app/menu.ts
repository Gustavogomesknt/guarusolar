import {
  CalendarDays,
  ClipboardCheck,
  FileText,
  FolderKanban,
  House,
  KanbanSquare,
  Package,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { Papel } from '@guarusolar/compartilhado';

export type ItemMenu = {
  rotulo: string;
  caminho: string;
  icone: LucideIcon;
  papeis: readonly Papel[];
  /** false enquanto a tela ainda não existe: aparece no menu com o selo "Em breve". */
  disponivel: boolean;
};

// A ordem segue os próximos passos do CLAUDE.md. Ao criar uma tela, marque disponivel: true
// e registre a rota em rotas.tsx com os mesmos papéis.
export const MENU: ItemMenu[] = [
  { rotulo: 'Início', caminho: '/', icone: House, papeis: ['COMERCIAL', 'GESTOR'], disponivel: true },
  { rotulo: 'Orçamentos', caminho: '/orcamentos', icone: FileText, papeis: ['COMERCIAL'], disponivel: false },
  { rotulo: 'Pipeline', caminho: '/pipeline', icone: KanbanSquare, papeis: ['COMERCIAL'], disponivel: false },
  { rotulo: 'Clientes', caminho: '/clientes', icone: Users, papeis: ['COMERCIAL'], disponivel: false },
  { rotulo: 'Catálogo', caminho: '/catalogo', icone: Package, papeis: ['COMERCIAL'], disponivel: false },
  { rotulo: 'Agenda', caminho: '/agenda', icone: CalendarDays, papeis: ['GESTOR'], disponivel: false },
  { rotulo: 'Validação', caminho: '/validacao', icone: ClipboardCheck, papeis: ['GESTOR'], disponivel: false },
  { rotulo: 'Projetos', caminho: '/projetos', icone: FolderKanban, papeis: ['GESTOR'], disponivel: false },
];
