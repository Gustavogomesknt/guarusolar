import { useQuery } from '@tanstack/react-query';
import { HardDrive, TriangleAlert } from 'lucide-react';
import { api } from '@guarusolar/web/api';

type Uso =
  | { provedor: string; recebendo?: boolean; limitado: false }
  | { provedor: string; recebendo?: boolean; limitado: true; usadoBytes: number; limiteBytes: number; percentual: number; nivel: 'ok' | 'atencao' | 'cheio'; recusaEm: number; fotosRestantes: number };

const mb = (bytes: number) => `${Math.round(bytes / 1024 / 1024)} MB`;

/**
 * Aviso do espaço das fotos para o gestor e o admin (montado no Layout, em todas as telas deles).
 * As fotos ficam no Supabase Storage, em definitivo, com um teto (cerca de 1 GB no plano
 * gratuito; variável SUPABASE_STORAGE_LIMITE_MB na API). Aparece a partir de 70% de uso, bem
 * antes de a API começar a recusar fotos novas (95%): dá tempo de decidir (README, "Espaço das fotos").
 */
export function AvisoDoArmazenamento() {
  const uso = useQuery({
    queryKey: ['armazenamento', 'uso'],
    queryFn: ({ signal }) => api.get<Uso>('/api/armazenamento/uso', { signal }),
    staleTime: 5 * 60_000,
    refetchInterval: 10 * 60_000,
    retry: false,
    meta: { erroNaTela: true }, // sem aviso flutuante: se não der para medir, não há o que mostrar
  });
  const d = uso.data;
  // Produção sem armazenamento (STORAGE_PROVIDER fora de "supabase"): a API recusa as fotos dos
  // técnicos. Faixa vermelha em todas as telas do gestor e do admin, até ser corrigido.
  if (d && d.recebendo === false) {
    return (
      <div role="alert" className="mb-6 flex items-start gap-3 rounded-[12px] border border-destructive bg-destructive px-4 py-3 text-sm text-white">
        <TriangleAlert className="mt-0.5 size-5 shrink-0" aria-hidden />
        <p>
          <strong className="font-semibold">As fotos não estão sendo armazenadas.</strong> Os técnicos não conseguem enviar fotos. Verifique
          STORAGE_PROVIDER.
        </p>
      </div>
    );
  }
  if (!d || !d.limitado || d.nivel === 'ok') return null;
  const cheio = d.nivel === 'cheio';
  return (
    <div
      role={cheio ? 'alert' : 'status'}
      className="mb-6 flex items-start gap-3 rounded-[12px] border border-destaque bg-destaque-suave px-4 py-3 text-sm text-destaque-texto"
    >
      <HardDrive className="mt-0.5 size-4 shrink-0" aria-hidden />
      <p>
        <strong className="font-semibold">
          {cheio ? 'O espaço das fotos acabou: os técnicos não conseguem enviar fotos novas.' : `O espaço das fotos está em ${d.percentual.toLocaleString('pt-BR')}%.`}
        </strong>{' '}
        {mb(d.usadoBytes)} de {mb(d.limiteBytes)} em uso
        {cheio ? '.' : `; cabem cerca de ${d.fotosRestantes.toLocaleString('pt-BR')} fotos até o sistema recusar novas (em ${d.recusaEm}%).`} Avise o
        responsável pelo sistema: é hora de ampliar o espaço das fotos.
      </p>
    </div>
  );
}
