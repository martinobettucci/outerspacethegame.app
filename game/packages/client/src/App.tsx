import { useCallback, useEffect, useState } from 'react';
import { Satellite } from 'lucide-react';
import { t } from './i18n/en.js';

type ServerState = 'checking' | 'ready' | 'down';

/**
 * Coquille applicative (chunk A) : vérifie la liaison avec l'API et affiche
 * les états chargement / erreur explicitement (CLAUDE.md §4). Les scènes de
 * jeu (galaxie, planète) arrivent au chunk D.
 */
export function App() {
  const [server, setServer] = useState<ServerState>('checking');

  const check = useCallback(async () => {
    setServer('checking');
    try {
      const res = await fetch('/api/ready');
      setServer(res.ok ? 'ready' : 'down');
    } catch {
      setServer('down');
    }
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  return (
    <main
      style={{
        height: '100%',
        display: 'grid',
        placeItems: 'center',
        background:
          'radial-gradient(ellipse at 30% 20%, rgba(42,27,82,.55), transparent 60%), radial-gradient(ellipse at 75% 80%, rgba(35,70,140,.25), transparent 55%), var(--bg-space)',
      }}
    >
      <section
        aria-live="polite"
        style={{
          background: 'var(--bg-raised)',
          borderRadius: 'var(--radius-card)',
          boxShadow: 'var(--elevation-raised)',
          padding: 'var(--space-6)',
          maxWidth: 480,
          textAlign: 'center',
          display: 'grid',
          gap: 'var(--space-4)',
          justifyItems: 'center',
        }}
      >
        <Satellite size={40} color="var(--accent-400)" aria-hidden />
        <h1 style={{ fontSize: 24, letterSpacing: '0.08em' }}>{t.appName}</h1>
        <p style={{ color: 'var(--text-secondary)', margin: 0 }}>{t.tagline}</p>
        {server === 'checking' && (
          <p style={{ margin: 0 }}>{t.status.checkingServer}</p>
        )}
        {server === 'ready' && (
          <p style={{ margin: 0, color: 'var(--success-500)' }}>
            {t.status.serverReady}
          </p>
        )}
        {server === 'down' && (
          <>
            <p style={{ margin: 0, color: 'var(--danger-500)' }}>
              {t.status.serverDown}
            </p>
            <button
              type="button"
              onClick={() => void check()}
              style={{
                background: 'var(--primary-400)',
                color: 'var(--text-primary)',
                border: 'none',
                borderRadius: 'var(--radius-button)',
                padding: 'var(--space-2) var(--space-4)',
                cursor: 'pointer',
                fontSize: 14,
              }}
            >
              {t.status.retry}
            </button>
          </>
        )}
      </section>
    </main>
  );
}
