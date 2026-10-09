import { lazy, type ComponentType } from 'react';
import { useRouteError } from 'react-router';

/*
 * Tela aberta durante uma publicação: o index.html que o navegador tem aponta para arquivos
 * (assets/Tela-<hash>.js) do build anterior, que não existem mais. Ao entrar numa tela carregada
 * sob demanda, o import falha com "Failed to fetch dynamically imported module".
 *
 * `lazyComRecarga` recarrega a página UMA vez (o index.html nunca fica em cache: vem o novo). A
 * marca no sessionStorage impede o loop: se depois de recarregar o import falhar de novo, o erro
 * segue para a tela de erro (`ErroDeRota`), que pede a recarga manual. Import que dá certo limpa
 * a marca.
 */

const MARCA = 'guarusolar.recarregou-por-modulo';

/** Chrome/Edge, Safari e Firefox escrevem a falha de um import() cada um do seu jeito. */
export const ehErroDeModulo = (erro: unknown) =>
  /dynamically imported module|Importing a module script failed|Failed to fetch/i.test(erro instanceof Error ? erro.message : String(erro));

const jaRecarregou = () => {
  try {
    return sessionStorage.getItem(MARCA) !== null;
  } catch {
    return true; // sem sessionStorage não há como saber: não arrisca recarregar em loop
  }
};
const marcarRecarga = () => {
  try {
    sessionStorage.setItem(MARCA, String(Date.now()));
    return true;
  } catch {
    return false;
  }
};
const limparMarca = () => {
  try {
    sessionStorage.removeItem(MARCA);
  } catch {
    /* sem sessionStorage: nada a limpar */
  }
};

/** No lugar de React.lazy, nas telas carregadas sob demanda. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyComRecarga<T extends ComponentType<any>>(importar: () => Promise<{ default: T }>) {
  return lazy(async () => {
    try {
      const modulo = await importar();
      limparMarca();
      return modulo;
    } catch (erro) {
      // sem internet, recarregar trocaria a tela pela página de erro do navegador
      if (ehErroDeModulo(erro) && navigator.onLine !== false && !jaRecarregou() && marcarRecarga()) {
        location.reload();
        // a página está recarregando: fica no "Carregando…" em vez de piscar a tela de erro
        return new Promise<{ default: T }>(() => {});
      }
      throw erro;
    }
  });
}

/**
 * Tela de erro das rotas (errorElement da raiz, nos dois apps). Erro de import depois de a
 * recarga automática já ter sido tentada: pede a recarga forçada. Nunca mostra o stack trace.
 */
export function ErroDeRota() {
  const erro = useRouteError();
  const atualizado = ehErroDeModulo(erro);
  if (!atualizado) console.error(erro);
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 bg-background px-6 py-10 text-center">
      <h1 className="text-2xl font-bold">{atualizado ? 'O sistema foi atualizado' : 'Algo deu errado nesta tela'}</h1>
      <p role="alert" className="max-w-md text-[15px] leading-relaxed text-foreground/80">
        {atualizado
          ? 'O sistema foi atualizado. Recarregue a página (Ctrl+Shift+R).'
          : 'Recarregue a página. Se o erro continuar, avise o suporte dizendo o que você estava fazendo.'}
      </p>
      <button
        type="button"
        onClick={() => location.reload()}
        className="h-11 rounded-[10px] bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none"
      >
        Recarregar agora
      </button>
    </main>
  );
}
