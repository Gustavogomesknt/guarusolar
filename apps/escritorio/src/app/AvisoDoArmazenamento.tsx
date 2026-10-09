import { useQuery } from '@tanstack/react-query';
import { HardDrive } from 'lucide-react';
import { api } from '@guarusolar/web/api';

type Uso =
  | { provedor: string; limitado: false }
  | { provedor: string; limitado: true; usadoBytes: number; limiteBytes: number; percentual: number; nivel: 'ok' | 'atencao' | 'cheio'; recusaEm: number; fotosRestantes: number };

const mb = (bytes: number) => `${Math.round(bytes / 1024 / 1024)} MB`;

/**
 * Aviso do espaço das fotos para o gestor e o admin (montado no Layout). Só aparece com o
 * Supabase Storage (provisório, 1 GB no plano gratuito) e a partir de 80% de uso: antes de a API
 * começar a recusar fotos novas (95%). A saída é migrar as fotos para o SharePoint (README).
 */
export function AvisoDoArmazenamento() {
  const uso = useQuery({
    queryKey: ['armazenamento', 'uso'],
    queryFn: ({ signal }) => api.get<Uso>('/api/armazenamento/uso', { signal }),
    staleTime: 10 * 60_000,
    refetchInterval: 30 * 60_000,
    retry: false,
    meta: { erroNaTela: true }, // sem aviso flutuante: se não der para medir, não há o que mostrar
  });
  const d = uso.data;
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
        responsável pelo sistema: é hora de migrar as fotos para o SharePoint.
      </p>
    </div>
  );
}
