import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Em desenvolvimento o front chama /api no próprio Vite, que repassa para a API (as fotos também:
// só saem por /api/fotos, com login).
// Assim não há CORS no dev. No executável, a URL da API vem de VITE_API_URL.
const API_LOCAL = 'http://localhost:3333';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': API_LOCAL,
    },
  },
});
