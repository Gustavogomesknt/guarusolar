import { Link } from 'react-router';
import { ShieldAlert, Smartphone } from 'lucide-react';
import { useSessao } from '@guarusolar/web/sessao';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { TelaCheia } from '@/components/TelaCheia';

export function SemAcesso() {
  const { usuario, sair } = useSessao();
  const tecnico = usuario?.papel === 'TECNICO';

  return (
    <TelaCheia>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {tecnico ? (
              <Smartphone className="size-5 text-destaque" aria-hidden />
            ) : (
              <ShieldAlert className="size-5 text-destaque" aria-hidden />
            )}
            {tecnico ? 'Esta área é do escritório' : 'Sem acesso'}
          </CardTitle>
          <CardDescription>
            {tecnico ? 'Esta área é do escritório. Acesse o aplicativo de campo.' : 'Seu usuário não tem acesso a esta tela.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {tecnico ? (
            // o app de campo mora em /campo/, no mesmo endereço (outra aplicação: link comum, não <Link>)
            <Button asChild>
              <a href="/campo/">Abrir o aplicativo de campo</a>
            </Button>
          ) : (
            <Button asChild>
              <Link to="/">Voltar ao início</Link>
            </Button>
          )}
          <Button variant="outline" onClick={() => sair()}>
            Sair e entrar com outro usuário
          </Button>
        </CardContent>
      </Card>
    </TelaCheia>
  );
}
