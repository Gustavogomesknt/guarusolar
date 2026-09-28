import { useEffect, useState } from 'react';

/** Devolve o valor só depois de `atraso` ms sem mudar (debounce das buscas). */
export function useValorAtrasado<T>(valor: T, atraso = 300): T {
  const [atrasado, setAtrasado] = useState(valor);
  useEffect(() => {
    const espera = setTimeout(() => setAtrasado(valor), atraso);
    return () => clearTimeout(espera);
  }, [valor, atraso]);
  return atrasado;
}
