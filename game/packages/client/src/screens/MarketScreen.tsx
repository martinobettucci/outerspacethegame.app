/**
 * Écran Market — v1 : onglet Census (GB §13, DG §11.5). Totaux GLOBAUX
 * par ressource, catalogue EXHAUSTIF (zéros affichés), regroupés par
 * tier ; les onglets Trading/Auctions restent désactivés AVEC la raison
 * (pattern du rail). États chargement/erreur/vide explicites.
 */
import {
  BarChart3,
  Database,
  Gavel,
  LockKeyhole,
  PackageOpen,
  ScanLine,
  Sparkles,
  Store,
  UserPlus,
  Users,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { ALL_RESOURCE_IDS, RESOURCES, type ResourceTier } from '@atg/shared';
import { api, type ApiError } from '../api.js';
import { t } from '../i18n/en.js';
import { useAppState } from '../state.tsx';
import '../styles/operations.css';

const TIER_ORDER: ResourceTier[] = ['basic', 'crystal', 'refined', 'propulsion', 'salvage'];

type CensusState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | {
      kind: 'ready';
      perDay: number;
      census: { takenAt: string; totals: Record<string, number> } | null;
    };

const RARITY_COLOR: Record<string, string> = {
  common: 'var(--text-secondary)',
  uncommon: 'var(--success-500, #238C33)',
  rare: 'var(--primary-300, #6e96e8)',
  epic: 'var(--violet-400, #a78bfa)',
  legendary: 'var(--accent-400, #D9CF4A)',
};

export function MarketScreen() {
  const { me } = useAppState();
  const [tab, setTab] = useState<'census' | 'recruit'>('census');
  const [state, setState] = useState<CensusState>({ kind: 'loading' });
  const [prices, setPrices] = useState<Record<string, number> | null>(null);
  const [eligibility, setEligibility] = useState<
    Awaited<ReturnType<typeof api.podPrices>>['eligibility'] | null
  >(null);
  const [payWith, setPayWith] = useState('ore');
  const [fromPlanet, setFromPlanet] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [lastOpened, setLastOpened] = useState<
    | {
        role: string;
        rarity: string;
        people: string;
        statRolls: Record<string, number>;
        accountBoundUntil: string;
        paid: string;
      }
    | null
  >(null);
  const [roster, setRoster] = useState<
    Awaited<ReturnType<typeof api.npcs>>['npcs']
  >([]);

  const refreshRecruit = useCallback(() => {
    api
      .podPrices()
      .then((r) => {
        setPrices(r.prices);
        setEligibility(r.eligibility);
      })
      .catch(() => setPrices(null));
    api
      .npcs()
      .then((r) => setRoster(r.npcs))
      .catch(() => setRoster([]));
  }, []);

  useEffect(() => {
    if (tab === 'recruit') refreshRecruit();
  }, [tab, refreshRecruit]);

  const load = useCallback(() => {
    setState({ kind: 'loading' });
    api
      .latestCensus()
      .then((r) => setState({ kind: 'ready', perDay: r.perDay, census: r.census }))
      .catch(() => setState({ kind: 'error' }));
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(() => {
      // Rafraîchissement discret : on ne repasse pas par « loading ».
      api
        .latestCensus()
        .then((r) =>
          setState({ kind: 'ready', perDay: r.perDay, census: r.census }),
        )
        .catch(() => undefined);
    }, 5_000);
    return () => clearInterval(interval);
  }, [load]);

  return (
    <div className="operations-page market-screen">
      <header className="market-hero ops-panel">
        <div className="market-hero__environment" aria-hidden="true">
          <span className="market-hero__planet" />
          <span className="market-hero__orbit market-hero__orbit--near" />
          <span className="market-hero__orbit market-hero__orbit--far" />
          <span className="market-hero__station" />
          <span className="market-hero__lane market-hero__lane--one" />
          <span className="market-hero__lane market-hero__lane--two" />
        </div>
        <div className="market-hero__title">
          <span className="ops-icon-well ops-icon-well--accent">
            <Store size={24} aria-hidden />
          </span>
          <h1>{t.market.title}</h1>
        </div>
        <div className="market-hero__telemetry" aria-hidden="true">
          <span><Database size={15} /></span>
          <i />
          <i />
          <i />
          <span><ScanLine size={15} /></span>
        </div>
      </header>

      <nav aria-label={t.market.title} className="ops-tabs market-tabs">
        <button
          type="button"
          onClick={() => setTab('census')}
          aria-current={tab === 'census' ? 'page' : undefined}
          className="ops-tab"
          data-active={tab === 'census' || undefined}
        >
          <BarChart3 size={16} aria-hidden />
          {t.market.censusTab}
        </button>
        <button
          type="button"
          onClick={() => setTab('recruit')}
          aria-current={tab === 'recruit' ? 'page' : undefined}
          className="ops-tab"
          data-active={tab === 'recruit' || undefined}
        >
          <UserPlus size={16} aria-hidden />
          {t.market.recruitTab}
        </button>
        <button
          type="button"
          disabled
          title={t.nav.comingTrading}
          aria-label={`${t.market.tradingTab} — ${t.nav.comingTrading}`}
          className="ops-tab"
        >
          <ScanLine size={15} aria-hidden />
          {t.market.tradingTab}
        </button>
        <button
          type="button"
          disabled
          title={t.nav.comingAuctions}
          aria-label={`${t.market.auctionsTab} — ${t.nav.comingAuctions}`}
          className="ops-tab"
        >
          <Gavel size={15} aria-hidden />
          {t.market.auctionsTab}
        </button>
      </nav>

      {notice && (
        <p role="status" aria-live="polite" className="ops-notice">
          <Sparkles size={15} aria-hidden />
          <span>{notice}</span>
        </p>
      )}

      <div className="market-content">
        {tab === 'recruit' && (
          <section aria-label={t.market.recruitTab} className="recruit-workspace">
            <div className="recruit-intro ops-panel">
              <div className="recruit-intro__copy">
                <span className="ops-section-icon">
                  <PackageOpen size={20} aria-hidden />
                </span>
                <div>
                  <h2>{t.market.recruitTab}</h2>
                  <p>{t.market.recruitHint}</p>
                </div>
              </div>
              <div className="pod-visual" aria-hidden="true">
                <span className="pod-visual__ring pod-visual__ring--outer" />
                <span className="pod-visual__ring pod-visual__ring--inner" />
                <span className="pod-visual__core"><UserPlus size={27} /></span>
              </div>
            </div>

            <div className="recruit-console ops-panel">
              {eligibility && !eligibility.eligible && (
                <div
                  id="recruit-age-lock"
                  role="note"
                  className="recruit-age-lock"
                  data-testid="recruit-age-lock"
                >
                  <LockKeyhole size={18} aria-hidden="true" />
                  <span>
                    <strong>{t.market.recruitAgeLockTitle}</strong>
                    <span>
                      {t.market.recruitAgeLockHint(
                        eligibility.minAccountAgeDays,
                        new Date(eligibility.eligibleAt).toLocaleDateString('en-US'),
                      )}
                    </span>
                  </span>
                </div>
              )}
              {prices === null ? (
                <p className="ops-state ops-state--compact">{t.market.censusEmpty}</p>
              ) : (
                <div className="recruit-controls">
                  <label className="ops-field">
                    <span>{t.market.recruitPayWith}</span>
                    <select
                      value={payWith}
                      onChange={(e) => setPayWith(e.target.value)}
                    >
                      {ALL_RESOURCE_IDS.map((r) => (
                        <option key={r} value={r}>
                          {RESOURCES[r].name} — {(prices[r] ?? 0).toLocaleString('en-US')} T
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="ops-field">
                    <span>{t.market.recruitFrom}</span>
                    <select
                      value={fromPlanet || (me?.planets[0]?.id ?? '')}
                      onChange={(e) => setFromPlanet(e.target.value)}
                    >
                      {(me?.planets ?? []).map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    className="ops-button ops-button--historic recruit-open"
                    disabled={eligibility?.eligible === false}
                    aria-describedby={
                      eligibility?.eligible === false
                        ? 'recruit-age-lock'
                        : undefined
                    }
                    title={
                      eligibility?.eligible === false
                        ? t.market.recruitAgeLockTitle
                        : undefined
                    }
                    onClick={() => {
                      const planetId = fromPlanet || me?.planets[0]?.id;
                      if (!planetId) return;
                      api
                        .openPod({ planetId, resource: payWith })
                        .then((r) => {
                          setNotice(t.market.recruitOpened);
                          setLastOpened({
                            role: r.npc.role,
                            rarity: r.npc.rarity,
                            people: r.npc.people,
                            statRolls: r.npc.statRolls,
                            accountBoundUntil: r.npc.accountBoundUntil,
                            paid: `${r.paid.tons.toLocaleString('en-US')} T ${r.paid.resource}`,
                          });
                          refreshRecruit();
                        })
                        .catch((err: ApiError) =>
                          setNotice(
                            `${t.market.recruitRefused} — ${err.message ?? err.error}`,
                          ),
                        );
                    }}
                  >
                    <PackageOpen size={17} aria-hidden />
                    {t.market.recruitOpen} — {(prices[payWith] ?? 0).toLocaleString('en-US')} T
                  </button>
                </div>
              )}
            </div>

            {lastOpened && (
              <article aria-label={lastOpened.role} className="pod-reveal ops-panel">
                <div className="pod-reveal__portrait" aria-hidden="true">
                  <span><UserPlus size={34} /></span>
                </div>
                <div className="pod-reveal__body">
                  <div className="pod-reveal__heading">
                    <strong>{lastOpened.role}</strong>
                    <span
                      className="rarity-badge"
                      style={{ color: RARITY_COLOR[lastOpened.rarity] }}
                    >
                      {lastOpened.rarity}
                    </span>
                    <span className="pod-reveal__people">{lastOpened.people}</span>
                  </div>
                  <span className="pod-reveal__stats">
                    {Object.entries(lastOpened.statRolls)
                      .map(([k, v]) => `${k.replace(/_/g, ' ')} +${(v * 100).toFixed(2)}%`)
                      .join(' · ')}
                  </span>
                  <span className="pod-reveal__binding">
                    {lastOpened.paid} · {t.market.recruitBoundUntil}{' '}
                    {new Date(lastOpened.accountBoundUntil).toLocaleDateString('en-US')}
                  </span>
                </div>
              </article>
            )}

            <section aria-label={t.market.recruitRoster} className="roster-panel ops-panel">
              <header className="ops-section-heading">
                <span className="ops-section-icon"><Users size={18} aria-hidden /></span>
                <strong>{t.market.recruitRoster}</strong>
              </header>
              {roster.length === 0 ? (
                <span className="ops-empty-copy">{t.market.recruitRosterEmpty}</span>
              ) : (
                <div className="roster-grid">
                  {roster.map((n) => (
                    <article key={n.id} className="roster-card">
                      <span className="roster-card__mark" aria-hidden="true">
                        <UserPlus size={16} />
                      </span>
                      <div className="roster-card__copy">
                        <strong>{n.role}</strong>
                        <span>
                          <span style={{ color: RARITY_COLOR[n.rarity] }}>{n.rarity}</span> ·{' '}
                          {n.people}
                        </span>
                        <span>
                          {Object.entries(n.statRolls)
                            .map(([k, v]) => `${k.replace(/_/g, ' ')} +${(v * 100).toFixed(1)}%`)
                            .join(', ') || '—'}
                        </span>
                        <span>
                          {n.boundHostType
                            ? `${t.market.recruitBoundHost} ${n.boundHostType}`
                            : t.market.recruitFree}
                          {n.accountBoundUntil
                            ? ` · ${t.market.recruitBoundUntil} ${new Date(n.accountBoundUntil).toLocaleDateString('en-US')}`
                            : ''}
                        </span>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </section>
        )}

        {tab === 'census' && state.kind === 'loading' && (
          <div className="ops-state ops-panel">
            <span className="ops-loader" aria-hidden="true" />
            <p>{t.status.loading}</p>
          </div>
        )}

        {tab === 'census' && state.kind === 'error' && (
          <div className="ops-state ops-state--error ops-panel">
            <Database size={22} aria-hidden />
            <p>{t.market.censusError}</p>
            <button type="button" onClick={load} className="ops-button">
              {t.market.retry}
            </button>
          </div>
        )}

        {tab === 'census' && state.kind === 'ready' && !state.census && (
          <div className="ops-state ops-panel">
            <Database size={22} aria-hidden />
            <p>{t.market.censusEmpty}</p>
          </div>
        )}

        {tab === 'census' && state.kind === 'ready' && state.census && (
          <section aria-label={t.market.censusTab} className="census-workspace ops-panel">
            <header className="census-header">
              <div className="ops-section-heading">
                <span className="ops-section-icon"><Database size={18} aria-hidden /></span>
                <div>
                  <h2>{t.market.censusTab}</h2>
                  <p>
                    {t.market.censusTakenAt}{' '}
                    <span>
                      {new Date(state.census.takenAt).toLocaleString('en-US')}
                    </span>{' '}
                    · {state.perDay}× {t.market.censusCadence}
                  </p>
                </div>
              </div>
              <p className="census-rule">
                <ScanLine size={14} aria-hidden />
                {t.market.censusGlobalOnly}
              </p>
            </header>

            <div className="census-table-wrap">
              <table className="census-table">
                <thead>
                  <tr>
                    <th scope="col">{t.market.resource}</th>
                    <th scope="col">{t.market.tier}</th>
                    <th scope="col">{t.market.totalT}</th>
                  </tr>
                </thead>
                <tbody>
                  {TIER_ORDER.flatMap((tier) =>
                    ALL_RESOURCE_IDS.filter((id) => RESOURCES[id].tier === tier).map(
                      (id) => (
                        <tr key={id} data-tier={tier}>
                          <th scope="row">
                            <span className="resource-sigil" aria-hidden="true" />
                            {RESOURCES[id].name}
                          </th>
                          <td><span className="tier-chip">{tier}</span></td>
                          <td>
                            {(state.census!.totals[id] ?? 0).toLocaleString('en-US', {
                              maximumFractionDigits: 1,
                            })}
                          </td>
                        </tr>
                      ),
                    ),
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
