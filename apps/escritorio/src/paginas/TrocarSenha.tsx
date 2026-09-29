import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { useSessao } from '@guarusolar/web/sessao';
import { FormularioTrocaSenha } from '@guarusolar/web/FormularioTrocaSenha';
import { TelaCheia } from '@/components/TelaCheia';

export const CAMINHO_TROCAR_SENHA = '/conta/senha';

/**
 * Troca da própria senha. Com senha temporária (usuário criado por `npm run usuario`), a
 * RotaProtegida traz a pessoa para cá antes de qualquer outra tela.
 */
export function TrocarSenha() {
  const { usuario } = useSessao();
  const navegar = useNavigate();
  const obrigatoria = Boolean(usuario?.senhaTemporaria);

  return (
    <TelaCheia>
      <div className="flex flex-col gap-5 rounded-2xl border bg-card p-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold">{obrigatoria ? 'Crie a sua senha' : 'Trocar senha'}</h1>
          <p className="text-sm text-muted-foreground">{usuario?.nome}</p>
        </div>
        <FormularioTrocaSenha
          obrigatoria={obrigatoria}
          onConcluido={() => {
            toast.success('Senha trocada.');
            navegar('/', { replace: true });
          }}
        />
        {!obrigatoria && (
          <Link to="/" className="self-center text-sm font-medium text-primary hover:underline">
            Voltar sem trocar
          </Link>
        )}
      </div>
    </TelaCheia>
  );
}
