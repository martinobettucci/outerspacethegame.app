/** @spec All declarations and algorithms in this file implement: docs/BACKLOG.md §P1 “Auth + account lifecycle”; GAME_BOOK.md §19; docs/DAT.md §5. */
import { useState, type FormEvent } from 'react';
import {
  Atom,
  BadgeDollarSign,
  Factory,
  Handshake,
  Landmark,
  LoaderCircle,
  LogIn,
  Orbit,
  Rocket,
  Satellite,
  Shield,
  type LucideIcon,
} from 'lucide-react';
import { ARCHETYPES, type Archetype } from '@atg/shared';
import { api, type ApiError } from '../api.js';
import { t } from '../i18n/en.js';
import { useAppState } from '../state.tsx';

const ARCHETYPE_ICONS: Record<Archetype, LucideIcon> = {
  militarist: Shield,
  industrialist: Factory,
  mercantile: BadgeDollarSign,
  scientific: Atom,
  civic: Landmark,
  diplomatic: Handshake,
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
    <main className={`ls-auth ls-auth--${mode}`}>
      <div className="ls-auth__ambience" aria-hidden="true">
        <img
          className="ls-auth__vista"
          src="/generated/command-vista.webp"
          alt=""
          width={1672}
          height={941}
          decoding="sync"
          loading="eager"
          fetchPriority="high"
          draggable={false}
        />
        <div className="ls-auth__stars ls-auth__stars--near" />
        <div className="ls-auth__stars ls-auth__stars--far" />
        <div className="ls-auth__nebula" />
        <div className="ls-auth__orbit ls-auth__orbit--outer" />
        <div className="ls-auth__orbit ls-auth__orbit--inner" />
        <div className="ls-auth__planet">
          <span className="ls-auth__planet-glow" />
          <span className="ls-auth__planet-shade" />
        </div>
        <div className="ls-auth__vessel">
          <Rocket size={32} strokeWidth={1.25} />
          <span />
        </div>
      </div>

      <section className="ls-auth__story" aria-hidden="true">
        <div className="ls-auth__story-mark">
          <Orbit size={18} strokeWidth={1.5} />
          <span>OUTERSPACE / COMMAND</span>
        </div>
        <p className="ls-auth__coordinates">ORBITAL RELAY · 07 / 34.82 PC</p>
        <h2>
          THE LUMINOUS
          <span>SILENCE</span>
        </h2>
        <p>{t.tagline}</p>
        <div className="ls-auth__signal-line">
          <span />
          <span />
          <span />
        </div>
      </section>

      <section className="ls-auth__deck">
        <div className="ls-auth__deck-edge" aria-hidden="true" />
        <form
          className={`ls-auth-form ls-auth-form--${mode}`}
          onSubmit={submit}
          aria-label={mode === 'login' ? t.auth.login : t.auth.register}
          aria-busy={busy}
        >
          <header className="ls-auth-form__header">
            <span className="ls-auth-form__emblem" aria-hidden="true">
              {mode === 'login' ? (
                <Satellite size={27} strokeWidth={1.5} />
              ) : (
                <Rocket size={27} strokeWidth={1.5} />
              )}
            </span>
            <div>
              <p>{mode === 'login' ? t.auth.login : t.auth.register}</p>
              <h1>{t.appName}</h1>
            </div>
          </header>

          <p className="ls-auth-form__tagline">{t.tagline}</p>

          <div className="ls-auth-form__fields">
            <label className="ls-auth-field">
              <span>{t.auth.email}</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </label>
            <label className="ls-auth-field">
              <span>{t.auth.password}</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                minLength={mode === 'register' ? 10 : 1}
                required
              />
            </label>

            {mode === 'register' && (
              <label className="ls-auth-field ls-auth-field--wide">
                <span>{t.auth.displayName}</span>
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  minLength={2}
                  required
                />
              </label>
            )}
          </div>

          {mode === 'register' && (
            <fieldset className="ls-archetypes">
              <legend>{t.auth.politics}</legend>
              <div className="ls-archetypes__grid">
                {ARCHETYPES.map((a) => {
                  const ArchetypeIcon = ARCHETYPE_ICONS[a];
                  return (
                    <label key={a} className="ls-archetype" data-archetype={a}>
                      <input
                        type="radio"
                        name="politics"
                        value={a}
                        checked={politics === a}
                        onChange={() => setPolitics(a)}
                      />
                      <span className="ls-archetype__surface">
                        <span className="ls-archetype__icon" aria-hidden="true">
                          <ArchetypeIcon size={19} strokeWidth={1.6} />
                        </span>
                        <span>{t.archetypes[a]}</span>
                        <span className="ls-archetype__check" aria-hidden="true" />
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          )}

          {error && (
            <p className="ls-auth-form__error" role="alert">
              {error}
            </p>
          )}

          <div className="ls-auth-form__actions">
            <button className="ls-auth-form__submit" type="submit" disabled={busy}>
              {busy ? (
                <LoaderCircle className="ls-spin" size={17} aria-hidden="true" />
              ) : mode === 'login' ? (
                <LogIn size={17} aria-hidden="true" />
              ) : (
                <Rocket size={17} aria-hidden="true" />
              )}
              <span>{mode === 'login' ? t.auth.submitLogin : t.auth.submitRegister}</span>
            </button>

            <button
              className="ls-auth-form__switch"
              type="button"
              onClick={() => {
                setMode(mode === 'login' ? 'register' : 'login');
                setError(null);
              }}
            >
              {mode === 'login' ? t.auth.switchToRegister : t.auth.switchToLogin}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
