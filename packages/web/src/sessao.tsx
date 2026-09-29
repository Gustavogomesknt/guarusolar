import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import type { Papel } from '@guarusolar/compartilhado';
import { api, ErroApi, quandoSessaoExpirar, SEM_CONEXAO, tokenSalvo, usuarioSalvo } from './api';

export type Usuario = {
  id: string;
  nome: string;
  papel: Papel;
  equipeId: string | null;
};

/** Estado de navegação da tela de login: para onde voltar depois de entrar. */
export type EstadoLogin = { de?: string };

type Sessao = {
  usuario: Usuario | null;
  /**
   * Motivo da última saída forçada (ex.: sessão expirada), mostrado no login.
   * Fica na sessão, não no estado da navegação: o redirecionamento da RotaProtegida
   * pode acontecer antes e sobrescreveria o estado.
   */
  aviso: string | null;
  /** Conferindo o token salvo ao abrir o app. */
  carregando: boolean;
  /** Mensagem quando não foi possível falar com a API ao abrir o app. */
  falhaAoConectar: string | null;
  entrar: (email: string, senha: string) => Promise<Usuario>;
  sair: (aviso?: string) => void;
  tentarNovamente: () => void;
};

const ContextoSessao = createContext<Sessao | null>(null);

/**
 * `papeisAceitos`: quando informado, só esses papéis entram neste app. Os demais recebem
 * `avisoPapelRecusado` e o token nem chega a ser guardado. É conveniência de interface: quem
 * protege os dados é o servidor (autorizar() em cada rota).
 *
 * `abrirSemConexao`: o app abre com o último usuário confirmado quando a API não responde ao
 * abrir (técnico em campo sem sinal). O token continua indo em cada requisição; se tiver
 * vencido, o primeiro 401 encerra a sessão como sempre.
 */
export function SessaoProvider({
  children,
  papeisAceitos,
  avisoPapelRecusado = 'Seu usuário não tem acesso a este aplicativo.',
  abrirSemConexao = false,
}: {
  children: ReactNode;
  papeisAceitos?: readonly Papel[];
  avisoPapelRecusado?: string;
  abrirSemConexao?: boolean;
}) {
  const navegar = useNavigate();
  const clienteConsultas = useQueryClient();
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(() => tokenSalvo.ler() !== null);
  const [falhaAoConectar, setFalhaAoConectar] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);

  const sair = useCallback(
    (aviso?: string) => {
      tokenSalvo.apagar();
      setAviso(aviso ?? null);
      setUsuario(null);
      clienteConsultas.clear();
      navegar('/login', { replace: true });
    },
    [clienteConsultas, navegar],
  );

  // Qualquer 401 da API (token vencido ou inválido) encerra a sessão.
  useEffect(() => quandoSessaoExpirar((mensagem) => sair(mensagem)), [sair]);

  // Ao abrir o app, confirma na API se o token salvo ainda vale.
  useEffect(() => {
    // O token pode sumir antes deste efeito (ex.: abrir /sair direto: o efeito da tela filha
    // roda primeiro). Sem esta linha, "carregando" ficaria verdadeiro para sempre.
    if (!tokenSalvo.ler()) return setCarregando(false);
    const controle = new AbortController();
    setCarregando(true);
    setFalhaAoConectar(null);
    api
      .get<Usuario>('/api/auth/eu', { signal: controle.signal })
      .then((dados) => {
        if (papeisAceitos && !papeisAceitos.includes(dados.papel)) return sair(avisoPapelRecusado);
        const confirmado = { id: dados.id, nome: dados.nome, papel: dados.papel, equipeId: dados.equipeId };
        if (abrirSemConexao) usuarioSalvo.gravar(confirmado);
        setUsuario(confirmado);
      })
      .catch((erro) => {
        if (controle.signal.aborted) return;
        // 401 já foi tratado por quandoSessaoExpirar; aqui só a falta de conexão ou erro do servidor.
        if (!(erro instanceof ErroApi) || erro.status === 401) return;
        const semServidor = erro.status === SEM_CONEXAO || erro.status >= 500;
        const salvo = abrirSemConexao && semServidor ? usuarioSalvo.ler<Usuario>() : null;
        if (salvo) setUsuario(salvo);
        else setFalhaAoConectar(erro.message);
      })
      .finally(() => {
        if (!controle.signal.aborted) setCarregando(false);
      });
    return () => controle.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- confere o token só ao abrir e ao tentar de novo
  }, [tentativa]);

  const entrar = useCallback(async (email: string, senha: string) => {
    const resposta = await api.post<{ token: string; usuario: Usuario }>(
      '/api/auth/login',
      { email, senha },
      { semRedirecionarEm401: true },
    );
    if (papeisAceitos && !papeisAceitos.includes(resposta.usuario.papel)) {
      throw new ErroApi(403, avisoPapelRecusado);
    }
    tokenSalvo.gravar(resposta.token);
    if (abrirSemConexao) usuarioSalvo.gravar(resposta.usuario);
    setAviso(null);
    setFalhaAoConectar(null);
    setUsuario(resposta.usuario);
    return resposta.usuario;
  }, [papeisAceitos, avisoPapelRecusado, abrirSemConexao]);

  const valor = useMemo<Sessao>(
    () => ({
      usuario,
      aviso,
      carregando,
      falhaAoConectar,
      entrar,
      sair,
      tentarNovamente: () => setTentativa((n) => n + 1),
    }),
    [usuario, aviso, carregando, falhaAoConectar, entrar, sair],
  );

  return <ContextoSessao.Provider value={valor}>{children}</ContextoSessao.Provider>;
}

export function useSessao() {
  const sessao = useContext(ContextoSessao);
  if (!sessao) throw new Error('useSessao precisa estar dentro de <SessaoProvider>');
  return sessao;
}
