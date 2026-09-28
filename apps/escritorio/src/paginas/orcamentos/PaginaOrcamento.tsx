import { useRef } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { calcularOrcamento } from '@guarusolar/compartilhado';
import { api, ErroApi } from '@/lib/api';
import type { Cliente, OrcamentoCompleto } from '@/lib/tipos';
import { Button } from '@/components/ui/button';
import { GeradorOrcamento, type OrcamentoInicial } from './GeradorOrcamento';
import { entradaDoCalculo, salvoDoOrcamento, valoresDoOrcamento } from './formulario';

/**
 * /orcamentos/novo e /orcamentos/:id são a mesma rota: assim, depois de salvar um
 * orçamento novo, a URL troca para /orcamentos/:id sem desmontar o gerador (a tela
 * continua como está) e um F5 depois disso carrega o orçamento pelo id.
 */
export function PaginaOrcamento() {
  const { id = 'novo' } = useParams();
  const navegar = useNavigate();
  // id que o gerador montado acabou de criar: a troca de URL não carrega nem remonta nada
  const criadoAqui = useRef<string | null>(null);
  // chave do gerador montado; muda a cada navegação, menos a feita pelo próprio salvamento
  const novaChave = () => `novo-${crypto.randomUUID()}`;
  const chave = useRef(id === 'novo' ? novaChave() : id);
  const ultimoId = useRef(id);
  if (id !== ultimoId.current) {
    if (id !== criadoAqui.current) {
      criadoAqui.current = null;
      chave.current = id === 'novo' ? novaChave() : id;
    }
    ultimoId.current = id;
  }

  const emEdicaoLocal = id === 'novo' || id === criadoAqui.current;

  // /orcamentos/novo?cliente=<id>: novo orçamento já com o cliente selecionado
  const [parametros] = useSearchParams();
  const clienteId = id === 'novo' ? parametros.get('cliente') : null;
  const cliente = useQuery({
    queryKey: ['clientes', 'ficha', clienteId],
    queryFn: ({ signal }) => api.get<Cliente>(`/api/clientes/${clienteId}`, { signal }),
    enabled: clienteId !== null,
  });

  const consulta = useQuery({
    queryKey: ['orcamentos', 'detalhe', id],
    queryFn: ({ signal }) => api.get<OrcamentoCompleto>(`/api/orcamentos/${id}`, { signal }),
    enabled: !emEdicaoLocal,
    // Sem cache: o gerador só lê os valores ao montar, então abrir sempre busca a versão
    // atual (ex.: status mudado pela lista). Enquanto a tela está aberta, o formulário manda.
    gcTime: 0,
    staleTime: Infinity,
  });

  if (emEdicaoLocal) {
    // vindo da ficha do cliente: espera o cliente chegar para já abrir com ele selecionado
    if (id === 'novo' && clienteId && cliente.isPending) {
      return (
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden /> Carregando cliente…
        </p>
      );
    }
    return (
      <GeradorOrcamento
        key={chave.current}
        clienteInicial={cliente.data}
        onCriado={(novoId) => {
          criadoAqui.current = novoId;
          navegar(`/orcamentos/${novoId}`, { replace: true });
        }}
      />
    );
  }

  if (consulta.isPending) {
    return (
      <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden /> Carregando orçamento…
      </p>
    );
  }

  if (consulta.isError) {
    const naoExiste = consulta.error instanceof ErroApi && consulta.error.status === 404;
    return (
      <div className="flex flex-col items-start gap-3">
        <h1 className="text-2xl font-bold">{naoExiste ? 'Orçamento não encontrado' : 'Não foi possível abrir o orçamento'}</h1>
        <p className="text-sm text-muted-foreground">
          {naoExiste ? 'O link pode estar errado ou o orçamento não existe mais.' : consulta.error.message}
        </p>
        <Button asChild variant="outline" className="h-11 rounded-[10px]">
          <Link to="/orcamentos">Voltar para a lista</Link>
        </Button>
      </div>
    );
  }

  const orcamento = consulta.data;
  const valores = valoresDoOrcamento(orcamento);
  const inicial: OrcamentoInicial = {
    valores,
    // resumo do pagamento gravado pela API; orçamentos antigos, sem ele, usam o mesmo cálculo
    salvo: salvoDoOrcamento(
      orcamento,
      orcamento.resumoPagamento ?? calcularOrcamento(entradaDoCalculo(valores)).resumoPagamento,
    ),
  };

  return <GeradorOrcamento key={chave.current} inicial={inicial} />;
}
