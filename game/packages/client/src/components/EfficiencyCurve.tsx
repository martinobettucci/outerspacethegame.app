/**
 * Le widget signature (GB §10, DESIGN_SYSTEM §5) : la cloche inclinée
 * E(u) avec la position vivante, la zone verte du point idéal et la zone
 * rouge de surcharge. Équivalent numérique exposé pour l'accessibilité.
 */
import { efficiency, EFFICIENCY_MU } from '@atg/shared';
import { t } from '../i18n/en.js';

const W = 260;
const H = 110;
const PAD = 10;
const U_MAX = 1.4;

const xFor = (u: number) => PAD + (u / U_MAX) * (W - 2 * PAD);
const yFor = (e: number) => H - PAD - e * (H - 2 * PAD);

export function EfficiencyCurve({
  u,
  label,
}: {
  u: number;
  label: string;
}) {
  const points: string[] = [];
  for (let i = 0; i <= 120; i++) {
    const uu = (i / 120) * U_MAX;
    points.push(`${xFor(uu).toFixed(1)},${yFor(efficiency(uu)).toFixed(1)}`);
  }
  const liveU = Math.min(U_MAX, Math.max(0, u));
  const liveE = efficiency(liveU);

  return (
    <figure style={{ margin: 0, display: 'grid', gap: 4 }}>
      <figcaption style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
        {t.planet.curveTitle} — {label}
      </figcaption>
      <svg
        width={W}
        height={H}
        role="img"
        aria-label={`${label}: utilization ${(u * 100).toFixed(0)}%, efficiency ${(liveE * 100).toFixed(0)}%`}
        style={{
          background: 'var(--bg-overlay)',
          borderRadius: 8,
          border: '1px solid var(--stroke-subtle)',
        }}
      >
        {/* Zone du point idéal (verte) et zone de surcharge (rouge) */}
        <rect
          x={xFor(EFFICIENCY_MU - 0.08)}
          y={PAD}
          width={xFor(EFFICIENCY_MU + 0.08) - xFor(EFFICIENCY_MU - 0.08)}
          height={H - 2 * PAD}
          fill="rgba(47,181,68,.12)"
        />
        <rect
          x={xFor(1.0)}
          y={PAD}
          width={W - PAD - xFor(1.0)}
          height={H - 2 * PAD}
          fill="rgba(242,65,65,.10)"
        />
        <polyline
          points={points.join(' ')}
          fill="none"
          stroke="var(--accent-400)"
          strokeWidth={2}
        />
        {/* Position vivante */}
        <line
          x1={xFor(liveU)}
          y1={PAD}
          x2={xFor(liveU)}
          y2={H - PAD}
          stroke="var(--primary-300)"
          strokeDasharray="3 3"
        />
        <circle
          cx={xFor(liveU)}
          cy={yFor(liveE)}
          r={5}
          fill={
            liveE > 0.85
              ? 'var(--success-500)'
              : liveU > 1
                ? 'var(--danger-500)'
                : 'var(--accent-400)'
          }
          stroke="#060810"
          strokeWidth={1.5}
        />
      </svg>
      <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)' }}>
        u = {(u * 100).toFixed(0)}% · E = {(liveE * 100).toFixed(0)}%
      </span>
    </figure>
  );
}
