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
            {tecnico ? 'Use o app dos técnicos' : 'Sem acesso'}
          </CardTitle>
          <CardDescription>
            {tecnico
              ? 'Este programa é do escritório. A sua agenda e o envio das fotos ficam no site dos técnicos, pelo navegador do celular.'
              : 'Seu usuário não tem acesso a esta tela.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {!tecnico && (
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
