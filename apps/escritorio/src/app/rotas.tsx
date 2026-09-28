import { createBrowserRouter, createRoutesFromElements, Navigate, Outlet, Route } from 'react-router';
import { SessaoProvider } from '@/lib/sessao';
import { Login } from '@/paginas/Login';
import { Inicio } from '@/paginas/Inicio';
import { Sair } from '@/paginas/Sair';
import { NovoOrcamento } from '@/paginas/orcamentos/NovoOrcamento';
import { Layout } from './Layout';
import { RotaProtegida } from './RotaProtegida';
import { PAPEIS_DO_ESCRITORIO } from './permissoes';

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
          <Route index element={<Inicio />} />
          <Route element={<RotaProtegida papeis={['COMERCIAL', 'GESTOR']} />}>
            <Route path="orcamentos/novo" element={<NovoOrcamento />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Route>,
  ),
);
