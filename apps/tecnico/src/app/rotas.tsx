import { useEffect } from 'react';
import { createBrowserRouter, createRoutesFromElements, Navigate, Outlet, Route } from 'react-router';
import { SessaoProvider, useSessao } from '@guarusolar/web/sessao';
import { Login } from '@/paginas/Login';
import { Agenda } from '@/paginas/Agenda';
import { Servico } from '@/paginas/Servico';
import { CAMINHO_TROCAR_SENHA, TrocarSenha } from '@/paginas/TrocarSenha';
import { definirUsuarioDaFila } from '@/fotos/fila';
import { AvisoAtualizacao } from '@/components/AvisoAtualizacao';
import { ErroDeRota } from '@guarusolar/web/recarga';
import { RotaProtegida } from './RotaProtegida';

// Só o técnico entra aqui; os demais papéis recebem este aviso no login.
const PAPEIS_ACEITOS = ['TECNICO'] as const;
const AVISO_OUTROS_PAPEIS =
  'Este aplicativo é para os técnicos em campo. Use o sistema do escritório.';

/** A fila de fotos acompanha quem está logado (sem ninguém, ela pausa). */
function FilaDoUsuario() {
  const { usuario } = useSessao();
  useEffect(() => definirUsuarioDaFila(usuario?.id ?? null), [usuario?.id]);
  return null;
}

function RaizDoApp() {
  return (
    <SessaoProvider papeisAceitos={PAPEIS_ACEITOS} avisoPapelRecusado={AVISO_OUTROS_PAPEIS} abrirSemConexao>
      <FilaDoUsuario />
      <AvisoAtualizacao />
      <Outlet />
    </SessaoProvider>
  );
}

export const roteador = createBrowserRouter(
  createRoutesFromElements(
    <Route element={<RaizDoApp />} errorElement={<ErroDeRota />}>
      <Route path="/login" element={<Login />} />
      <Route element={<RotaProtegida />}>
        <Route index element={<Navigate to="/agenda" replace />} />
        <Route path="agenda" element={<Agenda />} />
        <Route path="servico/:id" element={<Servico />} />
        <Route path={CAMINHO_TROCAR_SENHA} element={<TrocarSenha />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Route>,
  ),
  // o app mora em /campo/ em produção (mesmo endereço do escritório); em desenvolvimento, na raiz
  { basename: import.meta.env.BASE_URL.replace(/\/$/, '') || '/' },
);
