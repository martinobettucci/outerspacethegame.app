/**
 * Écran Market — v1 : onglet Census (GB §13, DG §11.5). Totaux GLOBAUX
 * par ressource, catalogue EXHAUSTIF (zéros affichés), regroupés par
 * tier ; les onglets Trading/Auctions restent désactivés AVEC la raison
 * (pattern du rail). États chargement/erreur/vide explicites.
 */
import { BarChart3, Store } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { ALL_RESOURCE_IDS, RESOURCES, type ResourceTier } from '@atg/shared';
import { api } from '../api.js';
import { t } from '../i18n/en.js';

const TIER_ORDER: ResourceTier[] = ['basic', 'crystal', 'refined', 'propulsion'];

type CensusState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | {
      kind: 'ready';
      perDay: number;
      census: { takenAt: string; totals: Record<string, number> } | null;
    };

export function MarketScreen() {
  const [state, setState] = useState<CensusState>({ kind: 'loading' });

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
          aria-current="page"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: 'var(--primary-600)',
            color: 'var(--text-primary)',
            border: 'none',
            borderRadius: 'var(--radius-button)',
            padding: '6px 14px',
            fontSize: 13,
            cursor: 'default',
          }}
        >
          <BarChart3 size={14} aria-hidden /> {t.market.censusTab}
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

      {state.kind === 'loading' && (
        <p style={{ color: 'var(--text-secondary)' }}>{t.status.loading}</p>
      )}
      {state.kind === 'error' && (
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
      {state.kind === 'ready' && !state.census && (
        <p style={{ color: 'var(--text-secondary)' }}>{t.market.censusEmpty}</p>
      )}
      {state.kind === 'ready' && state.census && (
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
