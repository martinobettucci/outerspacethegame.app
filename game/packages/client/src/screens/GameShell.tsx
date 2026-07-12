/**
 * Coquille HUD (DESIGN_SYSTEM §5) : barre supérieure (joueur, politique),
 * rail gauche (navigation compacte, sections futures désactivées AVEC
 * l'explication), zone de scène.
 */
import {
  Map as MapIcon,
  Globe2,
  Rocket,
  Store,
  MessagesSquare,
  Flag,
  LogOut,
  Satellite,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { t } from '../i18n/en.js';
import { useAppState } from '../state.tsx';
import { GalaxyMap } from '../scenes/GalaxyMap.tsx';
import { PlanetView } from '../scenes/PlanetView.tsx';
import { CommsScreen } from './CommsScreen.tsx';

function RailButton({
  icon,
  label,
  active,
  disabledReason,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  active?: boolean;
  disabledReason?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!!disabledReason}
      title={disabledReason}
      aria-label={disabledReason ? `${label} — ${disabledReason}` : label}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        width: '100%',
        background: active ? 'var(--primary-600)' : 'none',
        color: disabledReason
          ? 'var(--text-disabled)'
          : active
            ? 'var(--text-primary)'
            : 'var(--text-secondary)',
        border: 'none',
        borderRadius: 'var(--radius-button)',
        padding: '8px 12px',
        fontSize: 13,
        cursor: disabledReason ? 'not-allowed' : 'pointer',
        textAlign: 'left',
      }}
    >
      {icon}
      {label}
    </button>
  );
}

export function GameShell() {
  const { me, view, setView, logout } = useAppState();
  if (!me) return null;

  return (
    <div
      style={{
        height: '100%',
        display: 'grid',
        gridTemplateRows: '48px 1fr',
        gridTemplateColumns: '200px 1fr',
        gridTemplateAreas: '"top top" "rail main"',
        background: 'var(--bg-base)',
      }}
    >
      <header
        style={{
          gridArea: 'top',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          padding: '0 16px',
          background: 'var(--bg-raised)',
          borderBottom: '1px solid var(--stroke-subtle)',
        }}
      >
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontFamily: 'var(--font-display)',
            fontSize: 14,
            letterSpacing: '0.1em',
          }}
        >
          <Satellite size={16} color="var(--accent-400)" aria-hidden />
          ATG
        </span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          {me.player.displayName}
          <span
            style={{
              marginLeft: 8,
              background: 'var(--violet-700)',
              color: 'var(--accent-200)',
              borderRadius: 'var(--radius-chip)',
              padding: '2px 10px',
              fontSize: 11,
            }}
          >
            {t.archetypes[me.player.politics]}
          </span>
        </span>
        <button
          type="button"
          onClick={() => void logout()}
          aria-label={t.nav.logout}
          title={t.nav.logout}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            display: 'flex',
          }}
        >
          <LogOut size={16} aria-hidden />
        </button>
      </header>

      <nav
        aria-label="Main"
        style={{
          gridArea: 'rail',
          display: 'grid',
          gap: 4,
          alignContent: 'start',
          padding: 10,
          background: 'var(--bg-raised)',
          borderRight: '1px solid var(--stroke-subtle)',
        }}
      >
        <RailButton
          icon={<MapIcon size={15} aria-hidden />}
          label={t.nav.galaxy}
          active={view.kind === 'galaxy'}
          onClick={() => setView({ kind: 'galaxy' })}
        />
        <span
          style={{
            fontSize: 11,
            color: 'var(--text-disabled)',
            padding: '8px 12px 2px',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
          }}
        >
          {t.nav.planets}
        </span>
        {me.planets.map((p) => (
          <RailButton
            key={p.id}
            icon={<Globe2 size={15} aria-hidden />}
            label={p.name}
            active={view.kind === 'planet' && view.planetId === p.id}
            onClick={() => setView({ kind: 'planet', planetId: p.id })}
          />
        ))}
        <span style={{ height: 8 }} />
        <RailButton
          icon={<Rocket size={15} aria-hidden />}
          label={t.nav.fleet}
          disabledReason={t.nav.comingP3}
        />
        <RailButton
          icon={<Store size={15} aria-hidden />}
          label={t.nav.market}
          disabledReason={t.nav.comingP4}
        />
        <RailButton
          icon={<MessagesSquare size={15} aria-hidden />}
          label={t.nav.comms}
          active={view.kind === 'comms'}
          onClick={() => setView({ kind: 'comms' })}
        />
        <RailButton
          icon={<Flag size={15} aria-hidden />}
          label={t.nav.factions}
          disabledReason={t.nav.comingP4}
        />
      </nav>

      <main style={{ gridArea: 'main', minHeight: 0 }}>
        {view.kind === 'galaxy' ? (
          <GalaxyMap />
        ) : view.kind === 'comms' ? (
          <CommsScreen />
        ) : (
          <PlanetView planetId={view.planetId} />
        )}
      </main>
    </div>
  );
}
