import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router/dom';
import { QueryClientProvider } from '@tanstack/react-query';

// Fontes empacotadas no app (não dependem do Google Fonts): carregam junto com o site, do mesmo servidor.
import '@fontsource-variable/bricolage-grotesque';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-mono/400.css';
import './estilos/tema.css';

import { configurarApi } from '@guarusolar/web/api';
import { AvisoServidorAcordando } from '@guarusolar/web/AvisoServidorAcordando';
import { clienteConsultas } from '@/lib/consultas';
import { Toaster } from '@/components/ui/sonner';
import { roteador } from '@/app/rotas';

configurarApi({ chaveToken: 'guarusolar.escritorio.token' });

createRoot(document.getElementById('raiz')!).render(
  <StrictMode>
    <QueryClientProvider client={clienteConsultas}>
      <RouterProvider router={roteador} />
      <AvisoServidorAcordando />
      <Toaster position="top-right" />
    </QueryClientProvider>
  </StrictMode>,
);
