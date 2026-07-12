import { useState, type FormEvent } from 'react';
import { Rocket, Satellite } from 'lucide-react';
import { ARCHETYPES, type Archetype } from '@atg/shared';
import { api, type ApiError } from '../api.js';
import { t } from '../i18n/en.js';
import { useAppState } from '../state.tsx';

const field: React.CSSProperties = {
  display: 'grid',
  gap: 4,
  textAlign: 'left',
};
const input: React.CSSProperties = {
  background: 'var(--bg-overlay)',
  border: '1px solid var(--stroke-subtle)',
  borderRadius: 'var(--radius-button)',
  color: 'var(--text-primary)',
  padding: '8px 12px',
  fontSize: 14,
  fontFamily: 'var(--font-body)',
};

export function LoginScreen() {
  const { refreshMe } = useAppState();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [politics, setPolitics] = useState<Archetype>('industrialist');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'login') {
        await api.login({ email, password });
      } else {
        await api.register({ email, password, displayName, politics });
      }
      await refreshMe();
    } catch (err) {
      const apiErr = err as ApiError;
      if (apiErr.error === 'bad_credentials') setError(t.auth.badCredentials);
      else if (apiErr.error === 'email_taken') setError(t.auth.emailTaken);
      else if (apiErr.error === 'invalid_input' || apiErr.status === 400)
        setError(t.auth.invalidInput);
      else setError(t.auth.genericError);
    } finally {
      setBusy(false);
    }
  };

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
      <form
        onSubmit={submit}
        aria-label={mode === 'login' ? t.auth.login : t.auth.register}
        style={{
          background: 'var(--bg-raised)',
          borderRadius: 'var(--radius-card)',
          boxShadow: 'var(--elevation-raised)',
          padding: 'var(--space-6)',
          width: 420,
          display: 'grid',
          gap: 'var(--space-4)',
          textAlign: 'center',
        }}
      >
        <div style={{ display: 'grid', justifyItems: 'center', gap: 8 }}>
          {mode === 'login' ? (
            <Satellite size={36} color="var(--accent-400)" aria-hidden />
          ) : (
            <Rocket size={36} color="var(--accent-400)" aria-hidden />
          )}
          <h1 style={{ fontSize: 20, letterSpacing: '0.08em' }}>{t.appName}</h1>
          <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: 13 }}>
            {t.tagline}
          </p>
        </div>

        <label style={field}>
          <span>{t.auth.email}</span>
          <input
            style={input}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </label>
        <label style={field}>
          <span>{t.auth.password}</span>
          <input
            style={input}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            minLength={mode === 'register' ? 10 : 1}
            required
          />
        </label>

        {mode === 'register' && (
          <>
            <label style={field}>
              <span>{t.auth.displayName}</span>
              <input
                style={input}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                minLength={2}
                required
              />
            </label>
            <fieldset
              style={{
                border: '1px solid var(--stroke-subtle)',
                borderRadius: 'var(--radius-button)',
                padding: 'var(--space-3)',
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr',
                gap: 6,
              }}
            >
              <legend
                style={{
                  fontSize: 12,
                  color: 'var(--text-secondary)',
                  padding: '0 6px',
                }}
              >
                {t.auth.politics}
              </legend>
              {ARCHETYPES.map((a) => (
                <label
                  key={a}
                  style={{
                    display: 'flex',
                    gap: 6,
                    alignItems: 'center',
                    fontSize: 12,
                    cursor: 'pointer',
                    color:
                      politics === a
                        ? 'var(--accent-200)'
                        : 'var(--text-secondary)',
                  }}
                >
                  <input
                    type="radio"
                    name="politics"
                    value={a}
                    checked={politics === a}
                    onChange={() => setPolitics(a)}
                  />
                  {t.archetypes[a]}
                </label>
              ))}
            </fieldset>
          </>
        )}

        {error && (
          <p role="alert" style={{ color: 'var(--danger-500)', margin: 0 }}>
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          style={{
            background: busy ? 'var(--primary-600)' : 'var(--primary-400)',
            color: 'var(--text-primary)',
            border: 'none',
            borderRadius: 'var(--radius-button)',
            padding: '10px 16px',
            cursor: busy ? 'wait' : 'pointer',
            fontSize: 14,
            fontFamily: 'var(--font-display)',
            letterSpacing: '0.06em',
          }}
        >
          {mode === 'login' ? t.auth.submitLogin : t.auth.submitRegister}
        </button>

        <button
          type="button"
          onClick={() => {
            setMode(mode === 'login' ? 'register' : 'login');
            setError(null);
          }}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--primary-300)',
            cursor: 'pointer',
            fontSize: 13,
          }}
        >
          {mode === 'login' ? t.auth.switchToRegister : t.auth.switchToLogin}
        </button>
      </form>
    </main>
  );
}
