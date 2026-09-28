import { Navigate, Route, Routes } from 'react-router';
import { Login } from '@/paginas/Login';
import { Inicio } from '@/paginas/Inicio';
import { Layout } from './Layout';
import { RotaProtegida } from './RotaProtegida';
import { PAPEIS_DO_ESCRITORIO } from './permissoes';

/*
 * Toda tela nova entra dentro do <Layout>, envolvida por uma <RotaProtegida> com os papéis
 * dela (os mesmos do item em menu.ts). Exemplo:
 *   <Route element={<RotaProtegida papeis={['COMERCIAL']} />}>
 *     <Route path="orcamentos" element={<Orcamentos />} />
 *   </Route>
 */
export function Rotas() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route element={<RotaProtegida papeis={PAPEIS_DO_ESCRITORIO} />}>
        <Route element={<Layout />}>
          <Route index element={<Inicio />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
