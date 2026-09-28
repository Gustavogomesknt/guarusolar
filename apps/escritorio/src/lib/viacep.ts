import { somenteDigitos } from './formatar';

export type EnderecoCep = {
  logradouro: string;
  bairro: string;
  cidade: string;
  uf: string;
};

/**
 * Busca o endereço no ViaCEP. Devolve null quando o CEP não existe ou o serviço falha;
 * nesse caso quem chama deixa o usuário preencher o endereço à mão.
 */
export async function buscarCep(cep: string, signal?: AbortSignal): Promise<EnderecoCep | null> {
  const digitos = somenteDigitos(cep);
  if (digitos.length !== 8) return null;
  try {
    const resposta = await fetch(`https://viacep.com.br/ws/${digitos}/json/`, { signal });
    if (!resposta.ok) return null;
    const dados = (await resposta.json()) as {
      erro?: boolean | string;
      logradouro?: string;
      bairro?: string;
      localidade?: string;
      uf?: string;
    };
    if (dados.erro) return null;
    return {
      logradouro: dados.logradouro ?? '',
      bairro: dados.bairro ?? '',
      cidade: dados.localidade ?? '',
      uf: dados.uf ?? '',
    };
  } catch (erro) {
    if (erro instanceof DOMException && erro.name === 'AbortError') throw erro;
    return null;
  }
}
