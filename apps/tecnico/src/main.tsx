import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router/dom';
import { QueryClientProvider } from '@tanstack/react-query';

// Fontes empacotadas no app: ele precisa abrir sem internet (service worker, etapa offline).
import '@fontsource-variable/bricolage-grotesque';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-mono/400.css';
import './estilos/app.css';

import { configurarApi } from '@guarusolar/web/api';
import { Toaster } from 'sonner';
import { clienteConsultas } from '@/lib/consultas';
import { roteador } from '@/app/rotas';

configurarApi({ chaveToken: 'guarusolar.tecnico.token' });

createRoot(document.getElementById('raiz')!).render(
  <StrictMode>
    <QueryClientProvider client={clienteConsultas}>
      <RouterProvider router={roteador} />
      <Toaster position="top-center" richColors closeButton />
    </QueryClientProvider>
  </StrictMode>,
);
