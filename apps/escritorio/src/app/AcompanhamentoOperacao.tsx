import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useFilaDeValidacao, useVersaoDaOperacao } from '@/paginas/validacao/fila';
import type { ServicoNaFila } from '@/lib/tipos';

/** Sem mexer no sistema por este tempo, para de perguntar (PC esquecido ligado não mantém a Render acordada). */
const PAUSA_SEM_USO = 30 * 60_000;
const TITULO = document.title;

/**
 * Fila de validação quase em tempo real para o gestor (montado no Layout, só GESTOR e ADMIN):
 * - pergunta a versão da operação a cada 20 s; quando muda, recarrega a validação, a agenda e
 *   os projetos (só as consultas em tela vão ao servidor);
 * - título da aba com quantos aguardam: "(2) Guarusolar — Escritório";
 * - aviso de chegada, sem som, UMA vez por envio (o reenvio depois de uma devolução é um envio
 *   novo), e só fora da tela de Validação (lá a própria fila mostra).
 * Para depois de 30 min sem uso; o primeiro movimento ou a volta à aba retoma na hora.
 */
export function AcompanhamentoOperacao() {
  const emUso = useEmUso();
  const versao = useVersaoDaOperacao(emUso);
  const fila = useFilaDeValidacao();
  const consultas = useQueryClient();
  const navegar = useNavigate();
  const { pathname } = useLocation();

  // volta ao uso: confere na hora, sem esperar os 20 s
  const pausado = useRef(false);
  const { refetch } = versao;
  useEffect(() => {
    if (emUso && pausado.current) void refetch();
    pausado.current = !emUso;
  }, [emUso, refetch]);

  // versão mudou: recarrega o que mostra a operação
  const versaoAnterior = useRef<string | null>(null);
  const atual = versao.data?.versao;
  useEffect(() => {
    if (!atual) return;
    if (versaoAnterior.current && versaoAnterior.current !== atual) {
      for (const chave of [['validacao'], ['agenda'], ['projetos']]) void consultas.invalidateQueries({ queryKey: chave });
    }
    versaoAnterior.current = atual;
  }, [atual, consultas]);

  // título da aba
  const quantos = (fila.data ?? []).filter((s) => s.status === 'AGUARDANDO_VALIDACAO').length;
  useEffect(() => {
    document.title = quantos > 0 ? `(${quantos}) ${TITULO}` : TITULO;
  }, [quantos]);
  useEffect(
    () => () => {
      document.title = TITULO;
    },
    [],
  );

  // aviso de chegada: a primeira carga só registra o que já estava na fila
  const vistos = useRef<Set<string> | null>(null);
  const naValidacao = useRef(false);
  naValidacao.current = pathname.startsWith('/validacao');
  useEffect(() => {
    if (!fila.data) return;
    const chave = (s: ServicoNaFila) => `${s.id}:${s.enviadoEm ?? ''}`;
    const chegados = fila.data.filter((s) => s.status === 'AGUARDANDO_VALIDACAO');
    if (!vistos.current) {
      vistos.current = new Set(chegados.map(chave));
      return;
    }
    const jaVistos = vistos.current;
    const novos = chegados.filter((s) => !jaVistos.has(chave(s)));
    for (const s of novos) jaVistos.add(chave(s));
    if (novos.length === 0 || naValidacao.current) return;
    const abrir = (id?: string) => navegar(id ? `/validacao?servico=${id}` : '/validacao');
    if (novos.length === 1) {
      const s = novos[0];
      toast.info(`Novo serviço para validar: ${s.projeto.cliente.nome}`, {
        description: `${s.projeto.codigo}${s.reenviado ? ' · reenviado após devolução' : ''}`,
        action: { label: 'Abrir', onClick: () => abrir(s.id) },
        duration: 15_000,
      });
    } else {
      toast.info(`${novos.length} serviços novos para validar`, {
        action: { label: 'Abrir', onClick: () => abrir() },
        duration: 15_000,
      });
    }
  }, [fila.data, navegar]);

  return null;
}

/** Em uso = mexeu no sistema (mouse, teclado, toque, voltou à aba) nos últimos 30 minutos. */
function useEmUso() {
  const [emUso, setEmUso] = useState(true);
  const ultimoUso = useRef(Date.now());
  useEffect(() => {
    const marcar = () => {
      ultimoUso.current = Date.now();
      setEmUso(true);
    };
    const aoMudarAba = () => {
      if (document.visibilityState === 'visible') marcar();
    };
    const eventos = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'focus'] as const;
    for (const e of eventos) window.addEventListener(e, marcar, { passive: true });
    document.addEventListener('visibilitychange', aoMudarAba);
    const relogio = window.setInterval(() => {
      if (Date.now() - ultimoUso.current > PAUSA_SEM_USO) setEmUso(false);
    }, 30_000);
    return () => {
      for (const e of eventos) window.removeEventListener(e, marcar);
      document.removeEventListener('visibilitychange', aoMudarAba);
      window.clearInterval(relogio);
    };
  }, []);
  return emUso;
}
