/** @spec All declarations and algorithms in this file implement: docs/BACKLOG.md §P1 “Monorepo/app scaffolding” and §P2.codex; docs/DAT.md §2/§4; docs/DESIGN_SYSTEM.md §5. */
import { t } from './i18n/en.js';
import { AppStateProvider, useAppState } from './state.tsx';
import { LoginScreen } from './screens/LoginScreen.tsx';
import { GameShell } from './screens/GameShell.tsx';
import './styles/shell.css';

function Root() {
  const { me, authChecked } = useAppState();
  if (!authChecked) {
    return (
      <main className="ls-bootstrap" aria-live="polite">
        <div className="ls-bootstrap__signal" aria-hidden="true">
          <span />
        </div>
        <p>{t.status.loading}</p>
      </main>
    );
  }
  return me ? <GameShell /> : <LoginScreen />;
}

export function App() {
  return (
    <AppStateProvider>
      <Root />
    </AppStateProvider>
  );
}
