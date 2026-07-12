import { t } from './i18n/en.js';
import { AppStateProvider, useAppState } from './state.tsx';
import { LoginScreen } from './screens/LoginScreen.tsx';
import { GameShell } from './screens/GameShell.tsx';

function Root() {
  const { me, authChecked } = useAppState();
  if (!authChecked) {
    return (
      <main
        style={{
          height: '100%',
          display: 'grid',
          placeItems: 'center',
          color: 'var(--text-secondary)',
        }}
      >
        {t.status.loading}
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
