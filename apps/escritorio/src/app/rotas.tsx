import { ErroDeRota, lazyComRecarga } from '@guarusolar/web/recarga';
import { createBrowserRouter, createRoutesFromElements, Navigate, Outlet, Route } from 'react-router';
import { SessaoProvider } from '@guarusolar/web/sessao';
import { AvisoDeConexao } from '@guarusolar/web/AvisoDeConexao';
import { Login } from '@/paginas/Login';
import { Sair } from '@/paginas/Sair';
import { CAMINHO_TROCAR_SENHA, TrocarSenha } from '@/paginas/TrocarSenha';
import { ListaOrcamentos } from '@/paginas/orcamentos/ListaOrcamentos';
import { Layout } from './Layout';
import { RotaProtegida } from './RotaProtegida';
import { PAPEIS_DO_ESCRITORIO } from './permissoes';

// Telas carregadas sob demanda: ficam fora do JavaScript inicial (a lista é a tela de entrada).
// O <Suspense> fica no Layout. lazyComRecarga: depois de uma publicação, os arquivos antigos somem e a
// página se recarrega sozinha uma vez (packages/web/src/recarga.tsx).
const PaginaOrcamento = lazyComRecarga(() => import('@/paginas/orcamentos/PaginaOrcamento').then((m) => ({ default: m.PaginaOrcamento })));
const Pipeline = lazyComRecarga(() => import('@/paginas/orcamentos/Pipeline').then((m) => ({ default: m.Pipeline })));
const ListaClientes = lazyComRecarga(() => import('@/paginas/clientes/ListaClientes').then((m) => ({ default: m.ListaClientes })));
const FichaCliente = lazyComRecarga(() => import('@/paginas/clientes/FichaCliente').then((m) => ({ default: m.FichaCliente })));
const PaginaCatalogo = lazyComRecarga(() => import('@/paginas/catalogo/PaginaCatalogo').then((m) => ({ default: m.PaginaCatalogo })));
const PaginaAgenda = lazyComRecarga(() => import('@/paginas/agenda/PaginaAgenda').then((m) => ({ default: m.PaginaAgenda })));
const ListaProjetos = lazyComRecarga(() => import('@/paginas/projetos/ListaProjetos').then((m) => ({ default: m.ListaProjetos })));
const FichaProjeto = lazyComRecarga(() => import('@/paginas/projetos/FichaProjeto').then((m) => ({ default: m.FichaProjeto })));
const PaginaUsuarios = lazyComRecarga(() => import('@/paginas/usuarios/PaginaUsuarios').then((m) => ({ default: m.PaginaUsuarios })));
const PaginaValidacao = lazyComRecarga(() =>
  import('@/paginas/validacao/PaginaValidacao').then((m) => ({ default: m.PaginaValidacao })),
);

/** A sessão fica dentro do roteador porque usa useNavigate para voltar ao login. */
function RaizDoApp() {
  return (
    <SessaoProvider>
      <AvisoDeConexao />
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
    <Route element={<RaizDoApp />} errorElement={<ErroDeRota />}>
      <Route path="/login" element={<Login />} />
      <Route path="/sair" element={<Sair />} />

      <Route element={<RotaProtegida papeis={PAPEIS_DO_ESCRITORIO} />}>
        <Route path={CAMINHO_TROCAR_SENHA} element={<TrocarSenha />} />
        <Route element={<Layout />}>
          <Route index element={<Navigate to="/orcamentos" replace />} />
          <Route element={<RotaProtegida papeis={['COMERCIAL', 'GESTOR']} />}>
            <Route path="orcamentos" element={<ListaOrcamentos />} />
            {/* "novo" e o id de um orçamento salvo usam a mesma rota (ver PaginaOrcamento) */}
            <Route path="orcamentos/:id" element={<PaginaOrcamento />} />
            <Route path="pipeline" element={<Pipeline />} />
            <Route path="clientes" element={<ListaClientes />} />
            <Route path="clientes/:id" element={<FichaCliente />} />
            <Route path="catalogo" element={<PaginaCatalogo />} />
            {/* comercial consulta; as ações da ficha são só do gestor (a API confere) */}
            <Route path="projetos" element={<ListaProjetos />} />
            <Route path="projetos/:id" element={<FichaProjeto />} />
          </Route>
          {/* Operação: só gestor (e ADMIN) */}
          <Route element={<RotaProtegida papeis={['GESTOR']} />}>
            <Route path="agenda" element={<PaginaAgenda />} />
            <Route path="validacao" element={<PaginaValidacao />} />
          </Route>
          {/* Administração: papeis vazio = só ADMIN */}
          <Route element={<RotaProtegida papeis={[]} />}>
            <Route path="usuarios" element={<PaginaUsuarios />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Route>,
  ),
);
