import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { WifiOff } from 'lucide-react';
import { acordarServidor, conexaoAtual, ouvirConexao, reconectar, TEMPO_PARA_ACORDAR } from './api';
import { useSessao } from './sessao';

/** Abaixo disso o "conectando" nem aparece: servidor acordado responde em bem menos. */
const ESPERA_ANTES_DE_MOSTRAR = 1500;

/**
 * O que a pessoa vê enquanto o app não fala com o servidor (packages/web/src/api.ts explica os
 * estados). Fica dentro do SessaoProvider, nos dois apps.
 *
 * - Sem o app na tela (login, primeira abertura): TELA de espera, com o progresso dos 90 s e,
 *   se passar disso, "Não foi possível conectar ao servidor" com "Tentar de novo".
 * - Com o app na tela (o técnico abre na hora com o que já estava carregado): FAIXA discreta no
 *   topo, só enquanto não está conectado.
 * - Sem internet no aparelho é outra mensagem (a ação é procurar sinal, não esperar), sempre em
 *   faixa: o que há por baixo (login, agenda guardada) continua utilizável.
 */
export function AvisoDeConexao({ aparelho = 'computador' }: { aparelho?: 'computador' | 'celular' }) {
  const { estado, desde } = useSyncExternalStore(ouvirConexao, conexaoAtual);
  const { usuario, tentarNovamente } = useSessao();
  const consultas = useQueryClient();
  const [agora, setAgora] = useState(() => Date.now());

  // ao abrir o app, já vai acordando o servidor (antes mesmo de a pessoa digitar a senha)
  useEffect(() => {
    acordarServidor().catch(() => undefined);
  }, []);

  // relógio da barra de progresso, só enquanto conecta
  useEffect(() => {
    if (estado !== 'conectando') return;
    setAgora(Date.now());
    const relogio = setInterval(() => setAgora(Date.now()), 500);
    return () => clearInterval(relogio);
  }, [estado, desde]);

  // voltou depois de um problema: busca de novo o que ficou sem resposta
  const houveProblema = useRef(false);
  useEffect(() => {
    if (estado === 'offline' || estado === 'falhou') houveProblema.current = true;
    if (estado !== 'conectado' || !houveProblema.current) return;
    houveProblema.current = false;
    if (!usuario) tentarNovamente();
    void consultas.invalidateQueries();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só quando o estado da conexão muda
  }, [estado]);

  if (estado === 'conectado') return null;
  const decorrido = Math.max(0, agora - desde);
  if (estado === 'conectando' && decorrido < ESPERA_ANTES_DE_MOSTRAR) return null;

  const tentarDeNovo = () => {
    reconectar().catch(() => undefined);
  };

  if (estado === 'offline') {
    return (
      <Faixa>
        <WifiOff className="size-4 shrink-0" aria-hidden />
        <span>
          <strong className="font-semibold">Sem conexão.</strong> Verifique a internet do {aparelho}.
        </span>
      </Faixa>
    );
  }

  if (usuario) {
    return estado === 'conectando' ? (
      <Faixa>
        <Girando />
        <span>
          <strong className="font-semibold">Conectando ao servidor…</strong> pode levar até um minuto.
        </span>
      </Faixa>
    ) : (
      <Faixa>
        <span className="font-semibold">Não foi possível conectar ao servidor.</span>
        <button type="button" onClick={tentarDeNovo} className="shrink-0 rounded-lg bg-white/15 px-3 py-1.5 font-semibold hover:bg-white/25">
          Tentar de novo
        </button>
      </Faixa>
    );
  }

  const progresso = Math.min(1, decorrido / TEMPO_PARA_ACORDAR);
  return (
    <div className="fixed inset-0 z-[70] flex flex-col items-center justify-center gap-5 bg-background px-6 text-center">
      {estado === 'conectando' ? (
        <>
          <h1 className="text-2xl font-bold">Conectando ao servidor…</h1>
          <p role="status" className="max-w-sm text-[15px] leading-relaxed text-foreground/80">Isso pode levar até um minuto na primeira vez do dia.</p>
          <div
            role="progressbar"
            aria-label="Tempo de espera pelo servidor"
            aria-valuemin={0}
            aria-valuemax={Math.round(TEMPO_PARA_ACORDAR / 1000)}
            aria-valuenow={Math.round(decorrido / 1000)}
            className="h-2 w-full max-w-xs overflow-hidden rounded-full bg-border"
          >
            <div className="h-2 rounded-full bg-primary transition-[width] duration-500 ease-linear" style={{ width: `${Math.max(4, progresso * 100)}%` }} />
          </div>
          <p className="font-mono text-xs text-muted-foreground">{Math.round(decorrido / 1000)} s</p>
        </>
      ) : (
        <>
          <h1 className="text-2xl font-bold">Não foi possível conectar ao servidor</h1>
          <p role="alert" className="max-w-sm text-[15px] leading-relaxed text-foreground/80">
            O servidor não respondeu em {Math.round(TEMPO_PARA_ACORDAR / 1000)} segundos. A internet do {aparelho} está funcionando; o problema é no
            servidor.
          </p>
          <button
            type="button"
            onClick={tentarDeNovo}
            className="h-12 rounded-xl bg-primary px-6 text-base font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none"
          >
            Tentar de novo
          </button>
        </>
      )}
    </div>
  );
}

const Girando = () => <span aria-hidden className="size-4 shrink-0 animate-spin rounded-full border-2 border-white/30 border-t-white" />;

/** Faixa do topo. role="status": leitores de tela anunciam sem roubar o foco. */
function Faixa({ children }: { children: React.ReactNode }) {
  return (
    <div role="status" className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex justify-center px-3 pt-[max(0.5rem,env(safe-area-inset-top))]">
      <p className="pointer-events-auto flex max-w-md items-center gap-2.5 rounded-xl bg-sidebar px-4 py-2 text-sm text-white shadow-lg">{children}</p>
    </div>
  );
}
