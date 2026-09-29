import { createBrowserRouter, createRoutesFromElements, Navigate, Outlet, Route } from 'react-router';
import { SessaoProvider } from '@guarusolar/web/sessao';
import { Login } from '@/paginas/Login';
import { Agenda } from '@/paginas/Agenda';
import { RotaProtegida } from './RotaProtegida';

// Só o técnico entra aqui; os demais papéis recebem este aviso no login.
const PAPEIS_ACEITOS = ['TECNICO'] as const;
const AVISO_OUTROS_PAPEIS =
  'Este aplicativo é para os técnicos em campo. Use o sistema do escritório.';

function RaizDoApp() {
  return (
    <SessaoProvider papeisAceitos={PAPEIS_ACEITOS} avisoPapelRecusado={AVISO_OUTROS_PAPEIS}>
      <Outlet />
    </SessaoProvider>
  );
}

export const roteador = createBrowserRouter(
  createRoutesFromElements(
    <Route element={<RaizDoApp />}>
      <Route path="/login" element={<Login />} />
      <Route element={<RotaProtegida />}>
        <Route index element={<Navigate to="/agenda" replace />} />
        <Route path="agenda" element={<Agenda />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Route>,
  ),
);
