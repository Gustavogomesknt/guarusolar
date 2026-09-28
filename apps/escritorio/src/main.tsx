import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router/dom';
import { QueryClientProvider } from '@tanstack/react-query';

// Fontes empacotadas no app: o executável precisa funcionar sem internet.
import '@fontsource-variable/bricolage-grotesque';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-mono/400.css';
import './estilos/tema.css';

import { clienteConsultas } from '@/lib/consultas';
import { Toaster } from '@/components/ui/sonner';
import { roteador } from '@/app/rotas';

createRoot(document.getElementById('raiz')!).render(
  <StrictMode>
    <QueryClientProvider client={clienteConsultas}>
      <RouterProvider router={roteador} />
      <Toaster position="top-right" />
    </QueryClientProvider>
  </StrictMode>,
);
