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
        target: 'http://localhost:8080',
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
