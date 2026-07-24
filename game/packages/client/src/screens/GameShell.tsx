/** @spec All declarations and algorithms in this file implement: docs/BACKLOG.md §P1 “Monorepo/app scaffolding” and §P2.codex; docs/DAT.md §2/§4; docs/DESIGN_SYSTEM.md §5. */
/**
 * Coquille HUD (DESIGN_SYSTEM §5) : barre supérieure (joueur, politique),
 * rail gauche (navigation compacte, sections futures désactivées AVEC
 * l'explication), zone de scène.
 */
import {
  ChevronRight,
  CircleUserRound,
  Map as MapIcon,
  Globe2,
  LockKeyhole,
  Rocket,
  Store,
  MessagesSquare,
  Flag,
  LogOut,
  Satellite,
  BookOpen,
} from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { t } from '../i18n/en.js';
import { useAppState } from '../state.tsx';
import { GalaxyMap } from '../scenes/GalaxyMap.tsx';
import { PlanetView } from '../scenes/PlanetView.tsx';
import { Codex } from '../codex/Codex.tsx';
import { type CodexSectionId, defaultSectionFor } from '../codex/sections.tsx';
import { codexEn } from '../codex/strings.ts';
import { CommsScreen } from './CommsScreen.tsx';
import { MarketScreen } from './MarketScreen.tsx';
import { AudioControls } from '../components/AudioControls.tsx';

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
      className={`ls-rail-button${active ? ' is-active' : ''}${disabledReason ? ' is-disabled' : ''}`}
      type="button"
      onClick={onClick}
      disabled={!!disabledReason}
      title={disabledReason ?? label}
      aria-label={disabledReason ? `${label} — ${disabledReason}` : label}
      aria-current={active ? 'page' : undefined}
    >
      <span className="ls-rail-button__icon" aria-hidden="true">
        {icon}
      </span>
      <span className="ls-rail-button__label">{label}</span>
      {disabledReason ? (
        <LockKeyhole className="ls-rail-button__lock" size={12} aria-hidden="true" />
      ) : (
        <span className="ls-rail-button__signal" aria-hidden="true" />
      )}
    </button>
  );
}

export function GameShell() {
  const { me, view, setView, logout } = useAppState();
  const [codexSection, setCodexSection] = useState<CodexSectionId | null>(null);
  if (!me) return null;

  const currentPlanet =
    view.kind === 'planet'
      ? me.planets.find((planet) => planet.id === view.planetId)
      : null;
  const currentViewLabel =
    view.kind === 'galaxy'
      ? t.nav.galaxy
      : view.kind === 'market'
        ? t.nav.market
        : view.kind === 'comms'
          ? t.nav.comms
          : (currentPlanet?.name ?? t.nav.planets);

  return (
    <div className="ls-shell">
      <a className="ls-skip-link" href="#ls-game-stage">
        Skip to game view
      </a>

      <header className="ls-ribbon">
        <div className="ls-ribbon__brand" aria-label={t.appName}>
          <span className="ls-ribbon__brand-icon" aria-hidden="true">
            <Satellite size={21} strokeWidth={1.5} />
          </span>
          <span className="ls-ribbon__wordmark">
            <strong>ATG</strong>
            <span>ACROSS THE GALAXIES</span>
          </span>
        </div>

        <div className="ls-ribbon__location" aria-label={currentViewLabel}>
          <span>COMMAND</span>
          <ChevronRight size={13} aria-hidden="true" />
          <strong>{currentViewLabel}</strong>
        </div>

        <div className="ls-ribbon__pilot">
          <span className="ls-ribbon__pilot-icon" aria-hidden="true">
            <CircleUserRound size={18} strokeWidth={1.5} />
          </span>
          <span className="ls-ribbon__pilot-copy">
            <strong>{me.player.displayName}</strong>
            <span>{t.archetypes[me.player.politics]}</span>
          </span>
        </div>

        <AudioControls />

        <button
          className="ls-ribbon__logout"
          type="button"
          onClick={() => void logout()}
          aria-label={t.nav.logout}
          title={t.nav.logout}
        >
          <LogOut size={18} aria-hidden="true" />
        </button>
      </header>

      <nav className="ls-command-rail" aria-label="Main">
        <div className="ls-command-rail__beam" aria-hidden="true" />
        <div className="ls-command-rail__group">
          <RailButton
            icon={<MapIcon size={18} />}
            label={t.nav.galaxy}
            active={view.kind === 'galaxy'}
            onClick={() => setView({ kind: 'galaxy' })}
          />
        </div>

        <div className="ls-command-rail__group ls-command-rail__group--worlds">
          <span className="ls-command-rail__heading">{t.nav.planets}</span>
          {me.planets.map((p) => (
            <RailButton
              key={p.id}
              icon={<Globe2 size={18} />}
              label={p.name}
              active={view.kind === 'planet' && view.planetId === p.id}
              onClick={() => setView({ kind: 'planet', planetId: p.id })}
            />
          ))}
        </div>

        <div className="ls-command-rail__group ls-command-rail__group--network">
          <RailButton
            icon={<Rocket size={18} />}
            label={t.nav.fleet}
            disabledReason={t.nav.comingP3}
          />
          <RailButton
            icon={<Store size={18} />}
            label={t.nav.market}
            active={view.kind === 'market'}
            onClick={() => setView({ kind: 'market' })}
          />
          <RailButton
            icon={<MessagesSquare size={18} />}
            label={t.nav.comms}
            active={view.kind === 'comms'}
            onClick={() => setView({ kind: 'comms' })}
          />
          <RailButton
            icon={<Flag size={18} />}
            label={t.nav.factions}
            disabledReason={t.nav.comingP4}
          />
        </div>

        <div className="ls-command-rail__group ls-command-rail__group--codex">
          <RailButton
            icon={<BookOpen size={18} />}
            label={codexEn.open}
            active={codexSection !== null}
            onClick={() => setCodexSection(defaultSectionFor(view.kind))}
          />
        </div>

        <div className="ls-command-rail__footer" aria-hidden="true">
          <span />
          <p>DEEP LINK / STABLE</p>
        </div>
      </nav>

      <main id="ls-game-stage" className="ls-game-stage" tabIndex={-1}>
        {view.kind === 'galaxy' ? (
          <GalaxyMap />
        ) : view.kind === 'comms' ? (
          <CommsScreen />
        ) : view.kind === 'market' ? (
          <MarketScreen />
        ) : (
          <PlanetView planetId={view.planetId} />
        )}
      </main>

      {codexSection !== null ? (
        <Codex
          initialSection={codexSection}
          planetId={currentPlanet?.id ?? null}
          onClose={() => setCodexSection(null)}
        />
      ) : null}
    </div>
  );
}
