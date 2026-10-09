import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router/dom';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';

// Fontes empacotadas no app: ele precisa abrir sem internet (o service worker guarda tudo).
import '@fontsource-variable/bricolage-grotesque';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-mono/400.css';
import './estilos/app.css';

import { configurarApi } from '@guarusolar/web/api';
import { Toaster } from 'sonner';
import { clienteConsultas, OPCOES_DE_PERSISTENCIA } from '@/lib/consultas';
import { iniciarFila } from '@/fotos/fila';
import { roteador } from '@/app/rotas';

configurarApi({ chaveToken: 'guarusolar.tecnico.token', aparelho: 'celular' });
void iniciarFila();

createRoot(document.getElementById('raiz')!).render(
  <StrictMode>
    <PersistQueryClientProvider client={clienteConsultas} persistOptions={OPCOES_DE_PERSISTENCIA}>
      <RouterProvider router={roteador} />
      <Toaster position="top-center" richColors closeButton />
    </PersistQueryClientProvider>
  </StrictMode>,
);
