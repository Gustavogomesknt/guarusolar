import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { useSessao } from '@guarusolar/web/sessao';
import { FormularioTrocaSenha } from '@guarusolar/web/FormularioTrocaSenha';
import { Cabecalho } from '@/components/Cabecalho';

export const CAMINHO_TROCAR_SENHA = '/senha';

/** Troca da própria senha; obrigatória no primeiro acesso com senha temporária. */
export function TrocarSenha() {
  const { usuario } = useSessao();
  const navegar = useNavigate();
  const obrigatoria = Boolean(usuario?.senhaTemporaria);

  return (
    <div className="min-h-svh bg-background">
      <Cabecalho titulo={obrigatoria ? 'Crie a sua senha' : 'Trocar senha'} subtitulo={usuario?.nome} voltarPara={obrigatoria ? undefined : '/agenda'} />
      <main className="px-4 pt-5 pb-10">
        <FormularioTrocaSenha
          grande
          obrigatoria={obrigatoria}
          onConcluido={() => {
            toast.success('Senha trocada.');
            navegar('/agenda', { replace: true });
          }}
        />
      </main>
    </div>
  );
}
