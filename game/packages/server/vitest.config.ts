import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Les scripts npm filtrent par chemin : `test` → test/unit,
    // `test:integration` → test/integration (vraie base locale, CLAUDE.md §15,
    // sans parallélisme de fichiers pour partager la base proprement).
    include: ['test/**/*.test.ts'],
  },
});
