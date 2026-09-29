import {
  CalendarDays,
  ClipboardCheck,
  FilePlus2,
  FileText,
  FolderKanban,
  KanbanSquare,
  Package,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { ComponentType } from 'react';
import type { Papel } from '@guarusolar/compartilhado';
import { ContadorValidacao } from './ContadorValidacao';

export type ItemMenu = {
  rotulo: string;
  caminho: string;
  icone: LucideIcon;
  papeis: readonly Papel[];
  /** false enquanto a tela ainda não existe: aparece no menu com o selo "Em breve". */
  disponivel: boolean;
  /** número ao lado do item (ex.: serviços aguardando validação) */
  contador?: ComponentType;
  /** seção do menu: o comercial vende, a operação executa */
  grupo: 'Comercial' | 'Operação';
};

// A ordem segue os próximos passos do CLAUDE.md. Ao criar uma tela, marque disponivel: true
// e registre a rota em rotas.tsx com os mesmos papéis.
export const MENU: ItemMenu[] = [
  { rotulo: 'Orçamentos', caminho: '/orcamentos', icone: FileText, papeis: ['COMERCIAL', 'GESTOR'], disponivel: true, grupo: 'Comercial' },
  { rotulo: 'Novo orçamento', caminho: '/orcamentos/novo', icone: FilePlus2, papeis: ['COMERCIAL', 'GESTOR'], disponivel: true, grupo: 'Comercial' },
  { rotulo: 'Pipeline', caminho: '/pipeline', icone: KanbanSquare, papeis: ['COMERCIAL', 'GESTOR'], disponivel: true, grupo: 'Comercial' },
  { rotulo: 'Clientes', caminho: '/clientes', icone: Users, papeis: ['COMERCIAL', 'GESTOR'], disponivel: true, grupo: 'Comercial' },
  { rotulo: 'Catálogo', caminho: '/catalogo', icone: Package, papeis: ['COMERCIAL', 'GESTOR'], disponivel: true, grupo: 'Comercial' },
  { rotulo: 'Agenda', caminho: '/agenda', icone: CalendarDays, papeis: ['GESTOR'], disponivel: true, grupo: 'Operação' },
  { rotulo: 'Validação', caminho: '/validacao', icone: ClipboardCheck, papeis: ['GESTOR'], disponivel: true, grupo: 'Operação', contador: ContadorValidacao },
  { rotulo: 'Projetos', caminho: '/projetos', icone: FolderKanban, papeis: ['GESTOR'], disponivel: false, grupo: 'Operação' },
];
