/** @spec All declarations and algorithms in this file implement: docs/BACKLOG.md §P1 “Monorepo/app scaffolding”; docs/DAT.md §2/§6. */
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      // L'API et les assets de jeu (stubs GIF servis depuis assets/game/)
      // passent par le même origin en dev.
      '/api': {
        // ATG_API_PORT : permet de décaler la pile dev/E2E quand 8080
        // est squatté par un service étranger (défaut inchangé).
        target: `http://localhost:${process.env.ATG_API_PORT ?? 8080}`,
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ''),
      },
    },
    fs: {
      // Autorise l'accès aux sprites du dépôt (assets/game) en dev.
      allow: ['..', '../../..'],
    },
  },
});
