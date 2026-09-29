import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Como no escritório: no desenvolvimento o Vite repassa /api e /arquivos para a API local.
const API_LOCAL = 'http://localhost:3333';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
  server: {
    port: 5174,
    strictPort: true,
    proxy: {
      '/api': API_LOCAL,
      '/arquivos': API_LOCAL,
    },
  },
});
