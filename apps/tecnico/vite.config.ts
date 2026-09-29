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
      // os ícones já entram pelo globPatterns; incluí-los de novo duplica a entrada no cache
      includeManifestIcons: false,
      // Instalação na tela inicial. Ícones gerados de icones/app.svg (npm run icones).
      manifest: {
        name: 'Guarusolar Técnico',
        short_name: 'Guarusolar',
        description: 'Agenda e fotos dos serviços, para o técnico em campo.',
        lang: 'pt-BR',
        id: '/',
        start_url: '/agenda',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#0b2f5e',
        background_color: '#f4f6fa',
        icons: [
          { src: '/icone-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icone-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icone-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
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
