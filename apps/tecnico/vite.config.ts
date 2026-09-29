import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

// Como no escritório: no desenvolvimento o Vite repassa /api e /arquivos para a API local.
const API_LOCAL = 'http://localhost:3333';
const REPASSE = { '/api': API_LOCAL, '/arquivos': API_LOCAL };

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Service worker: guarda o app no aparelho para ele abrir sem internet. Os dados (agenda,
    // serviços) ficam no React Query persistido e as fotos na fila do IndexedDB — o service
    // worker não guarda respostas da API.
    VitePWA({
      registerType: 'prompt', // versão nova só entra quando o técnico toca em "Atualizar"
      injectRegister: false, // o registro é feito pelo AvisoAtualizacao (useRegisterSW)
      manifest: false, // manifest e ícones: próxima etapa (instalação na tela inicial)
      workbox: {
        // Só woff2 (todo navegador que roda o app entende) e só os alfabetos usados:
        // o português cabe no subconjunto "latin".
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        globIgnores: ['**/*cyrillic*', '**/*greek*', '**/*vietnamese*', '**/*latin-ext*'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/arquivos\//],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
  server: { port: 5174, strictPort: true, proxy: REPASSE },
  // `vite preview` serve o build com o service worker ativo (no `vite dev` ele fica desligado)
  preview: { port: 5175, strictPort: true, proxy: REPASSE },
});
