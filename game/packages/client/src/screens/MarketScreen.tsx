/**
 * Écran Market — v1 : onglet Census (GB §13, DG §11.5). Totaux GLOBAUX
 * par ressource, catalogue EXHAUSTIF (zéros affichés), regroupés par
 * tier ; les onglets Trading/Auctions restent désactivés AVEC la raison
 * (pattern du rail). États chargement/erreur/vide explicites.
 */
import { BarChart3, Store, UserPlus } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { ALL_RESOURCE_IDS, RESOURCES, type ResourceTier } from '@atg/shared';
import { api, type ApiError } from '../api.js';
import { t } from '../i18n/en.js';
import { useAppState } from '../state.tsx';

const TIER_ORDER: ResourceTier[] = ['basic', 'crystal', 'refined', 'propulsion'];

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
      .then((r) => setPrices(r.prices))
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
    <div style={{ height: '100%', overflow: 'auto', padding: 24 }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <Store size={18} color="var(--accent-400)" aria-hidden />
        <h1 style={{ fontSize: 18, fontFamily: 'var(--font-display)' }}>
          {t.market.title}
        </h1>
      </header>

      <nav aria-label={t.market.title} style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        <button
          type="button"
          onClick={() => setTab('census')}
          aria-current={tab === 'census' ? 'page' : undefined}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: tab === 'census' ? 'var(--primary-600)' : 'none',
            color: tab === 'census' ? 'var(--text-primary)' : 'var(--text-secondary)',
            border: tab === 'census' ? 'none' : '1px solid var(--stroke-subtle)',
            borderRadius: 'var(--radius-button)',
            padding: '6px 14px',
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          <BarChart3 size={14} aria-hidden /> {t.market.censusTab}
        </button>
        <button
          type="button"
          onClick={() => setTab('recruit')}
          aria-current={tab === 'recruit' ? 'page' : undefined}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: tab === 'recruit' ? 'var(--primary-600)' : 'none',
            color: tab === 'recruit' ? 'var(--text-primary)' : 'var(--text-secondary)',
            border: tab === 'recruit' ? 'none' : '1px solid var(--stroke-subtle)',
            borderRadius: 'var(--radius-button)',
            padding: '6px 14px',
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          <UserPlus size={14} aria-hidden /> {t.market.recruitTab}
        </button>
        <button
          type="button"
          disabled
          title={t.nav.comingTrading}
          aria-label={`${t.market.tradingTab} — ${t.nav.comingTrading}`}
          style={{
            background: 'none',
            color: 'var(--text-disabled)',
            border: '1px solid var(--stroke-subtle)',
            borderRadius: 'var(--radius-button)',
            padding: '6px 14px',
            fontSize: 13,
            cursor: 'not-allowed',
          }}
        >
          {t.market.tradingTab}
        </button>
        <button
          type="button"
          disabled
          title={t.nav.comingAuctions}
          aria-label={`${t.market.auctionsTab} — ${t.nav.comingAuctions}`}
          style={{
            background: 'none',
            color: 'var(--text-disabled)',
            border: '1px solid var(--stroke-subtle)',
            borderRadius: 'var(--radius-button)',
            padding: '6px 14px',
            fontSize: 13,
            cursor: 'not-allowed',
          }}
        >
          {t.market.auctionsTab}
        </button>
      </nav>

      {notice && (
        <p role="status" style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--accent-200)' }}>
          {notice}
        </p>
      )}
      {tab === 'recruit' && (
        <section aria-label={t.market.recruitTab} style={{ display: 'grid', gap: 14, maxWidth: 720 }}>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)' }}>
            {t.market.recruitHint}
          </p>
          {prices === null ? (
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)' }}>
              {t.market.censusEmpty}
            </p>
          ) : (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                {t.market.recruitPayWith}{' '}
                <select
                  value={payWith}
                  onChange={(e) => setPayWith(e.target.value)}
                  style={{
                    background: 'var(--bg-overlay)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--stroke-subtle)',
                    borderRadius: 'var(--radius-button)',
                    padding: '4px 6px',
                    fontSize: 12,
                  }}
                >
                  {ALL_RESOURCE_IDS.map((r) => (
                    <option key={r} value={r}>
                      {RESOURCES[r].name} — {(prices[r] ?? 0).toLocaleString('en-US')} T
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                {t.market.recruitFrom}{' '}
                <select
                  value={
                    fromPlanet || (me?.planets[0]?.id ?? '')
                  }
                  onChange={(e) => setFromPlanet(e.target.value)}
                  style={{
                    background: 'var(--bg-overlay)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--stroke-subtle)',
                    borderRadius: 'var(--radius-button)',
                    padding: '4px 6px',
                    fontSize: 12,
                  }}
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
                style={{
                  background: 'var(--accent-500, #D9CF4A)',
                  color: '#0D0D0D',
                  border: 'none',
                  borderRadius: 'var(--radius-button)',
                  padding: '6px 14px',
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                {t.market.recruitOpen} — {(prices[payWith] ?? 0).toLocaleString('en-US')} T
              </button>
            </div>
          )}
          {lastOpened && (
            <article
              aria-label={lastOpened.role}
              style={{
                background: 'var(--bg-raised)',
                borderRadius: 'var(--radius-card)',
                boxShadow: 'var(--elevation-raised)',
                padding: 'var(--space-4)',
                display: 'grid',
                gap: 6,
                maxWidth: 380,
              }}
            >
              <strong style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <UserPlus size={15} aria-hidden />
                {lastOpened.role}
                <span
                  style={{
                    color: RARITY_COLOR[lastOpened.rarity],
                    fontSize: 12,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                  }}
                >
                  {lastOpened.rarity}
                </span>
                <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                  {lastOpened.people}
                </span>
              </strong>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                {Object.entries(lastOpened.statRolls)
                  .map(([k, v]) => `${k.replace(/_/g, ' ')} +${(v * 100).toFixed(2)}%`)
                  .join(' · ')}
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                {lastOpened.paid} · {t.market.recruitBoundUntil}{' '}
                {new Date(lastOpened.accountBoundUntil).toLocaleDateString('en-US')}
              </span>
            </article>
          )}
          <section aria-label={t.market.recruitRoster} style={{ display: 'grid', gap: 6 }}>
            <strong style={{ fontSize: 13 }}>{t.market.recruitRoster}</strong>
            {roster.length === 0 ? (
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                {t.market.recruitRosterEmpty}
              </span>
            ) : (
              roster.map((n) => (
                <span
                  key={n.id}
                  style={{ fontSize: 12, fontFamily: 'var(--font-mono)' }}
                >
                  {n.role} ·{' '}
                  <span style={{ color: RARITY_COLOR[n.rarity] }}>{n.rarity}</span> ·{' '}
                  {n.people} ·{' '}
                  {Object.entries(n.statRolls)
                    .map(([k, v]) => `${k.replace(/_/g, ' ')} +${(v * 100).toFixed(1)}%`)
                    .join(', ') || '—'}{' '}
                  ·{' '}
                  {n.boundHostType
                    ? `${t.market.recruitBoundHost} ${n.boundHostType}`
                    : t.market.recruitFree}
                  {n.accountBoundUntil
                    ? ` · ${t.market.recruitBoundUntil} ${new Date(n.accountBoundUntil).toLocaleDateString('en-US')}`
                    : ''}
                </span>
              ))
            )}
          </section>
        </section>
      )}
      {tab === 'census' && state.kind === 'loading' && (
        <p style={{ color: 'var(--text-secondary)' }}>{t.status.loading}</p>
      )}
      {tab === 'census' && state.kind === 'error' && (
        <div style={{ display: 'grid', gap: 8, justifyItems: 'start' }}>
          <p style={{ color: 'var(--danger-400, #F24141)' }}>{t.market.censusError}</p>
          <button
            type="button"
            onClick={load}
            style={{
              background: 'var(--primary-400)',
              color: 'var(--text-primary)',
              border: 'none',
              borderRadius: 'var(--radius-button)',
              padding: '6px 14px',
              cursor: 'pointer',
            }}
          >
            {t.market.retry}
          </button>
        </div>
      )}
      {tab === 'census' && state.kind === 'ready' && !state.census && (
        <p style={{ color: 'var(--text-secondary)' }}>{t.market.censusEmpty}</p>
      )}
      {tab === 'census' && state.kind === 'ready' && state.census && (
        <section aria-label={t.market.censusTab} style={{ display: 'grid', gap: 12, maxWidth: 720 }}>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)' }}>
            {t.market.censusTakenAt}{' '}
            <span style={{ fontFamily: 'var(--font-mono)' }}>
              {new Date(state.census.takenAt).toLocaleString('en-US')}
            </span>{' '}
            · {state.perDay}× {t.market.censusCadence}
          </p>
          <p
            style={{
              margin: 0,
              fontSize: 12,
              color: 'var(--accent-200)',
              background: 'var(--violet-700)',
              borderRadius: 'var(--radius-chip)',
              padding: '4px 12px',
              justifySelf: 'start',
            }}
          >
            {t.market.censusGlobalOnly}
          </p>
          <table
            style={{
              borderCollapse: 'collapse',
              fontSize: 13,
              width: '100%',
            }}
          >
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--text-secondary)' }}>
                <th scope="col" style={{ padding: '6px 10px', borderBottom: '1px solid var(--stroke-subtle)' }}>
                  {t.market.resource}
                </th>
                <th scope="col" style={{ padding: '6px 10px', borderBottom: '1px solid var(--stroke-subtle)' }}>
                  {t.market.tier}
                </th>
                <th
                  scope="col"
                  style={{
                    padding: '6px 10px',
                    borderBottom: '1px solid var(--stroke-subtle)',
                    textAlign: 'right',
                  }}
                >
                  {t.market.totalT}
                </th>
              </tr>
            </thead>
            <tbody>
              {TIER_ORDER.flatMap((tier) =>
                ALL_RESOURCE_IDS.filter((id) => RESOURCES[id].tier === tier).map(
                  (id) => (
                    <tr key={id}>
                      <th
                        scope="row"
                        style={{
                          padding: '4px 10px',
                          fontWeight: 500,
                          textAlign: 'left',
                          color: 'var(--text-primary)',
                        }}
                      >
                        {RESOURCES[id].name}
                      </th>
                      <td style={{ padding: '4px 10px', color: 'var(--text-secondary)' }}>
                        {tier}
                      </td>
                      <td
                        style={{
                          padding: '4px 10px',
                          textAlign: 'right',
                          fontFamily: 'var(--font-mono)',
                        }}
                      >
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
        </section>
      )}
    </div>
  );
}
