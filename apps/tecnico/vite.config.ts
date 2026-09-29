import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

// Como no escritório: no desenvolvimento o Vite repassa /api para a API local (inclusive as
// fotos, que só saem por /api/fotos com login).
const API_LOCAL = 'http://localhost:3333';
const REPASSE = { '/api': API_LOCAL };

// Teste no celular pelo Cloudflare Tunnel (túnel rápido, sem conta): o endereço muda a cada
// execução (https://<aleatório>.trycloudflare.com). O ponto no início libera qualquer um deles;
// sem isso o Vite responde 403 ("Blocked request") para o nome desconhecido.
const HOSTS_DO_TUNEL = ['.trycloudflare.com'];

/*
 * Base: em produção o app mora em /campo/ (a mesma API entrega o escritório na raiz e este app
 * em /campo/). No `vite dev` fica na raiz (localhost:5174). BASE_TECNICO troca, se um dia o app
 * ganhar endereço próprio (ex.: BASE_TECNICO=/ para campo.guarusolar.com.br).
 */
export default defineConfig(({ command }) => {
  const base = command === 'build' ? (process.env.BASE_TECNICO ?? '/campo/') : '/';
  return {
  base,
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
        // relativos ao manifest: valem com qualquer base (/campo/ hoje, / com domínio próprio)
        id: './',
        start_url: './agenda',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#0b2f5e',
        background_color: '#f4f6fa',
        icons: [
          { src: 'icone-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icone-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icone-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Só woff2 (todo navegador que roda o app entende) e só os alfabetos usados:
        // o português cabe no subconjunto "latin".
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        globIgnores: ['**/*cyrillic*', '**/*greek*', '**/*vietnamese*', '**/*latin-ext*'],
        navigateFallback: `${base}index.html`,
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
  server: { port: 5174, strictPort: true, proxy: REPASSE, allowedHosts: HOSTS_DO_TUNEL },
  // `vite preview` serve o build com o service worker ativo (no `vite dev` ele fica desligado).
  // Em 127.0.0.1 (IPv4) fixo: com "localhost" o Node escuta só no IPv6 (::1) e o cloudflared,
  // que tenta o IPv4, receberia "conexão recusada". O navegador do PC segue em localhost:5175.
  preview: { host: '127.0.0.1', port: 5175, strictPort: true, proxy: REPASSE, allowedHosts: HOSTS_DO_TUNEL },
  };
});
