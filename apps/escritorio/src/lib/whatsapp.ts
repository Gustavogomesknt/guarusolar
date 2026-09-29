import type { StatusOrcamento } from '@guarusolar/compartilhado';
import { api } from '@guarusolar/web/api';

/**
 * Pede à API a mensagem pronta e abre o WhatsApp numa aba nova.
 * A aba é aberta já no clique (antes do await): aberta depois, o navegador a bloquearia
 * como pop-up. A API também passa o rascunho para ENVIADO; o status novo é devolvido.
 * Precisa ser chamada direto no clique do usuário.
 */
export async function enviarPeloWhatsApp(orcamentoId: string): Promise<StatusOrcamento> {
  const janela = window.open('', '_blank');
  try {
    const { link, status } = await api.post<{ link: string; mensagem: string; status: StatusOrcamento }>(
      `/api/orcamentos/${orcamentoId}/whatsapp`,
    );
    if (janela) {
      janela.opener = null;
      janela.location.href = link;
    } else {
      window.open(link, '_blank', 'noopener');
    }
    return status;
  } catch (erro) {
    janela?.close();
    throw erro;
  }
}
