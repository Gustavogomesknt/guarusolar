import { lazy } from 'react';
import { createBrowserRouter, createRoutesFromElements, Navigate, Outlet, Route } from 'react-router';
import { SessaoProvider } from '@/lib/sessao';
import { Login } from '@/paginas/Login';
import { Sair } from '@/paginas/Sair';
import { ListaOrcamentos } from '@/paginas/orcamentos/ListaOrcamentos';
import { Layout } from './Layout';
import { RotaProtegida } from './RotaProtegida';
import { PAPEIS_DO_ESCRITORIO } from './permissoes';

// Telas carregadas sob demanda: ficam fora do JavaScript inicial (a lista é a tela de entrada).
// O <Suspense> fica no Layout.
const PaginaOrcamento = lazy(() => import('@/paginas/orcamentos/PaginaOrcamento').then((m) => ({ default: m.PaginaOrcamento })));
const Pipeline = lazy(() => import('@/paginas/orcamentos/Pipeline').then((m) => ({ default: m.Pipeline })));
const PaginaCatalogo = lazy(() => import('@/paginas/catalogo/PaginaCatalogo').then((m) => ({ default: m.PaginaCatalogo })));

/** A sessão fica dentro do roteador porque usa useNavigate para voltar ao login. */
function RaizDoApp() {
  return (
    <SessaoProvider>
      <Outlet />
    </SessaoProvider>
  );
}

/*
 * Roteador de dados (createBrowserRouter): necessário para o useBlocker, que confirma a
 * saída de telas com alterações não salvas.
 *
 * Toda tela nova entra dentro do <Layout>, envolvida por uma <RotaProtegida> com os papéis
 * dela (os mesmos do item em menu.ts).
 */
export const roteador = createBrowserRouter(
  createRoutesFromElements(
    <Route element={<RaizDoApp />}>
      <Route path="/login" element={<Login />} />
      <Route path="/sair" element={<Sair />} />

      <Route element={<RotaProtegida papeis={PAPEIS_DO_ESCRITORIO} />}>
        <Route element={<Layout />}>
          <Route index element={<Navigate to="/orcamentos" replace />} />
          <Route element={<RotaProtegida papeis={['COMERCIAL', 'GESTOR']} />}>
            <Route path="orcamentos" element={<ListaOrcamentos />} />
            {/* "novo" e o id de um orçamento salvo usam a mesma rota (ver PaginaOrcamento) */}
            <Route path="orcamentos/:id" element={<PaginaOrcamento />} />
            <Route path="pipeline" element={<Pipeline />} />
            <Route path="catalogo" element={<PaginaCatalogo />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Route>,
  ),
);
