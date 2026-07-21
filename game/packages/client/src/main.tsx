/** @spec All declarations and algorithms in this file implement: docs/BACKLOG.md §P1 “Monorepo/app scaffolding” and §P2.codex; docs/DAT.md §2/§4; docs/DESIGN_SYSTEM.md §5. */
import '@fontsource/orbitron/500.css';
import '@fontsource/orbitron/700.css';
import '@fontsource-variable/inter';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import './theme.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('Élément #root introuvable');
}

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
