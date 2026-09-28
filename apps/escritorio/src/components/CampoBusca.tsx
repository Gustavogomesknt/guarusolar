import { useId, useRef, useState, type KeyboardEvent, type ReactNode, type Ref } from 'react';
import { Loader2, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

type Props<T> = {
  rotulo: string;
  placeholder: string;
  termo: string;
  onTermoChange: (termo: string) => void;
  /** undefined enquanto não houve busca para o termo atual */
  resultados: T[] | undefined;
  carregando: boolean;
  /** Caracteres mínimos para buscar e abrir a lista. */
  minimo?: number;
  chave: (item: T) => string;
  renderItem: (item: T, ativo: boolean) => ReactNode;
  onEscolher: (item: T) => void;
  /** Conteúdo mostrado quando a busca não encontra nada. */
  vazio: ReactNode;
  /** Texto curto à direita do campo (ex.: "Enter adiciona"). */
  dica?: ReactNode;
  destacado?: boolean;
  inputRef?: Ref<HTMLInputElement>;
};

/**
 * Campo de busca com lista suspensa no padrão combobox do ARIA 1.2:
 * setas movem, Enter escolhe, Esc fecha; o primeiro resultado já vem destacado.
 */
export function CampoBusca<T>({
  rotulo,
  placeholder,
  termo,
  onTermoChange,
  resultados,
  carregando,
  minimo = 2,
  chave,
  renderItem,
  onEscolher,
  vazio,
  dica,
  destacado = false,
  inputRef,
}: Props<T>) {
  const id = useId();
  const idLista = `${id}-lista`;
  const [aberto, setAberto] = useState(false);
  const [ativo, setAtivo] = useState(0);
  const lista = useRef<HTMLUListElement>(null);
  const raiz = useRef<HTMLDivElement>(null);

  const buscando = termo.trim().length >= minimo;
  const itens = resultados ?? [];
  const mostraLista = aberto && buscando && itens.length > 0;
  const mostraVazio = aberto && buscando && !carregando && resultados !== undefined && itens.length === 0;
  const indiceAtivo = Math.min(ativo, Math.max(itens.length - 1, 0));
  const idAtivo = mostraLista ? `${id}-opcao-${indiceAtivo}` : undefined;

  function escolher(item: T) {
    onEscolher(item);
    setAtivo(0);
  }

  function moverPara(indice: number) {
    setAtivo(indice);
    lista.current
      ?.querySelector<HTMLElement>(`[data-indice="${indice}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }

  function aoTeclar(evento: KeyboardEvent<HTMLInputElement>) {
    if (evento.key === 'ArrowDown') {
      evento.preventDefault();
      if (!aberto) return setAberto(true);
      if (itens.length) moverPara((indiceAtivo + 1) % itens.length);
    } else if (evento.key === 'ArrowUp') {
      evento.preventDefault();
      if (itens.length) moverPara((indiceAtivo - 1 + itens.length) % itens.length);
    } else if (evento.key === 'Enter') {
      evento.preventDefault();
      if (mostraLista) escolher(itens[indiceAtivo]);
    } else if (evento.key === 'Escape') {
      if (aberto && buscando) {
        evento.preventDefault();
        setAberto(false);
      }
    }
  }

  return (
    <div ref={raiz} className="relative">
      <label htmlFor={id} className="sr-only">
        {rotulo}
      </label>
      <div
        className={cn(
          'flex h-12 items-center gap-2.5 rounded-lg border bg-card px-3 text-muted-foreground',
          'focus-within:ring-[3px] focus-within:ring-ring/30',
          destacado ? 'border-2 border-primary text-primary' : 'border-input focus-within:border-ring',
        )}
      >
        {carregando ? (
          <Loader2 className="size-[18px] shrink-0 animate-spin" aria-hidden />
        ) : (
          <Search className="size-[18px] shrink-0" aria-hidden />
        )}
        <input
          ref={inputRef}
          id={id}
          type="text"
          role="combobox"
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={mostraLista}
          aria-controls={idLista}
          aria-activedescendant={idAtivo}
          placeholder={placeholder}
          value={termo}
          onChange={(e) => {
            onTermoChange(e.target.value);
            setAtivo(0);
            setAberto(true);
          }}
          onFocus={() => setAberto(true)}
          onBlur={(e) => {
            // o foco foi para um link/botão do próprio aviso: deixa aberto para o clique valer
            if (raiz.current?.contains(e.relatedTarget as Node | null)) return;
            setAberto(false);
          }}
          onKeyDown={aoTeclar}
          className="h-full min-w-0 flex-1 bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted-foreground"
        />
        {dica && (
          <span className="hidden shrink-0 rounded-md border border-input px-1.5 py-0.5 font-mono text-xs text-muted-foreground sm:inline">
            {dica}
          </span>
        )}
      </div>

      <ul
        ref={lista}
        id={idLista}
        role="listbox"
        aria-label={rotulo}
        hidden={!mostraLista}
        className="absolute inset-x-0 top-[calc(100%+6px)] z-30 max-h-80 overflow-y-auto rounded-xl border bg-popover p-1.5 shadow-[0_16px_40px_rgba(16,36,61,0.18)]"
      >
        {mostraLista &&
          itens.map((item, indice) => (
            <li
              key={chave(item)}
              id={`${id}-opcao-${indice}`}
              data-indice={indice}
              role="option"
              aria-selected={indice === indiceAtivo}
              // mousedown em vez de click: o campo não perde o foco antes da escolha
              onMouseDown={(e) => {
                e.preventDefault();
                escolher(item);
              }}
              onMouseMove={() => indice !== indiceAtivo && setAtivo(indice)}
              className={cn(
                'min-h-12 cursor-pointer rounded-lg px-3 py-2 text-foreground',
                indice === indiceAtivo && 'bg-secondary',
              )}
            >
              {renderItem(item, indice === indiceAtivo)}
            </li>
          ))}
      </ul>

      {mostraVazio && (
        <div
          role="status"
          className="absolute inset-x-0 top-[calc(100%+6px)] z-30 rounded-xl border bg-popover p-4 text-sm text-muted-foreground shadow-[0_16px_40px_rgba(16,36,61,0.18)]"
          // clique fora de links/botões não tira o foco do campo
          onMouseDown={(e) => {
            if (!(e.target as HTMLElement).closest('a,button')) e.preventDefault();
          }}
        >
          {vazio}
        </div>
      )}
    </div>
  );
}
