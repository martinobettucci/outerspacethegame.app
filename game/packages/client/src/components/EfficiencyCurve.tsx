/** @spec All declarations and algorithms in this file implement: docs/BACKLOG.md §P2 “Efficiency engine” and “Fungible storage”; GAME_BOOK.md §10; DESIGN_GUIDE.md §3.3b/§3.4. */
/**
 * The signature tilted-bell instrument (GB §10, DESIGN_SYSTEM §5).
 * Numeric equivalents remain exposed while the plot reads like a live
 * command-deck scope: sweet spot, overload envelope and current position.
 */
import { useId } from 'react';
import { efficiency, EFFICIENCY_MU } from '@atg/shared';
import { t } from '../i18n/en.js';
import '../styles/planet-panels.css';

const W = 300;
const H = 132;
const PAD_X = 18;
const PAD_TOP = 13;
const PAD_BOTTOM = 25;
const U_MAX = 1.4;

const xFor = (u: number) => PAD_X + (u / U_MAX) * (W - 2 * PAD_X);
const yFor = (e: number) =>
  H - PAD_BOTTOM - e * (H - PAD_TOP - PAD_BOTTOM);

export function EfficiencyCurve({
  u,
  label,
}: {
  u: number;
  label: string;
}) {
  const id = useId().replace(/:/g, '');
  const samples: { u: number; e: number; x: number; y: number }[] = [];
  for (let i = 0; i <= 120; i++) {
    const uu = (i / 120) * U_MAX;
    const e = efficiency(uu);
    samples.push({ u: uu, e, x: xFor(uu), y: yFor(e) });
  }

  const curvePath = samples
    .map((point, index) =>
      `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`,
    )
    .join(' ');
  const baseline = H - PAD_BOTTOM;
  const areaPath = `${curvePath} L ${xFor(U_MAX).toFixed(1)} ${baseline} L ${xFor(0).toFixed(1)} ${baseline} Z`;
  const liveU = Math.min(U_MAX, Math.max(0, u));
  const liveE = efficiency(liveU);
  const state =
    liveU > 1
      ? { label: 'OVERLOAD', tone: 'danger' }
      : Math.abs(liveU - EFFICIENCY_MU) <= 0.1 && liveE >= 0.85
        ? { label: 'SWEET SPOT', tone: 'success' }
        : liveU < 0.5
          ? { label: 'UNDER-RUN', tone: 'warning' }
          : { label: 'BALANCING', tone: 'neutral' };

  return (
    <figure className="ls-efficiency">
      <figcaption className="ls-efficiency__header">
        <span className="ls-efficiency__title">
          {t.planet.curveTitle}
        </span>
        <span className="ls-efficiency__state" data-tone={state.tone}>
          {state.label}
        </span>
      </figcaption>
      <svg
        className="ls-efficiency__plot"
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`${label}: utilization ${(u * 100).toFixed(0)}%, efficiency ${(liveE * 100).toFixed(0)}%`}
      >
        <defs>
          <linearGradient id={`${id}-curve`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="var(--primary-300)" />
            <stop offset="0.48" stopColor="var(--accent-200)" />
            <stop offset="0.72" stopColor="var(--accent-400)" />
            <stop offset="1" stopColor="var(--danger-500)" />
          </linearGradient>
          <linearGradient id={`${id}-area`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--accent-400)" stopOpacity="0.19" />
            <stop offset="1" stopColor="var(--primary-400)" stopOpacity="0.015" />
          </linearGradient>
          <filter id={`${id}-glow`} x="-70%" y="-70%" width="240%" height="240%">
            <feGaussianBlur stdDeviation="3.2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {[0.25, 0.5, 0.75, 1].map((e) => (
          <line
            key={`y-${e}`}
            x1={PAD_X}
            y1={yFor(e)}
            x2={W - PAD_X}
            y2={yFor(e)}
            stroke="rgba(110,150,232,.10)"
            strokeWidth="1"
          />
        ))}
        {[0, 0.35, 0.7, 1, 1.4].map((uu) => (
          <line
            key={`x-${uu}`}
            x1={xFor(uu)}
            y1={PAD_TOP}
            x2={xFor(uu)}
            y2={baseline}
            stroke="rgba(110,150,232,.08)"
            strokeWidth="1"
          />
        ))}

        <rect
          x={xFor(EFFICIENCY_MU - 0.08)}
          y={PAD_TOP}
          width={xFor(EFFICIENCY_MU + 0.08) - xFor(EFFICIENCY_MU - 0.08)}
          height={baseline - PAD_TOP}
          fill="rgba(47,181,68,.075)"
        />
        <line
          x1={xFor(EFFICIENCY_MU)}
          y1={PAD_TOP}
          x2={xFor(EFFICIENCY_MU)}
          y2={baseline}
          stroke="rgba(47,181,68,.28)"
          strokeDasharray="2 4"
        />
        <rect
          x={xFor(1)}
          y={PAD_TOP}
          width={W - PAD_X - xFor(1)}
          height={baseline - PAD_TOP}
          fill="rgba(242,65,65,.065)"
        />

        <path d={areaPath} fill={`url(#${id}-area)`} />
        <path
          d={curvePath}
          fill="none"
          stroke={`url(#${id}-curve)`}
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        <line
          x1={xFor(liveU)}
          y1={PAD_TOP}
          x2={xFor(liveU)}
          y2={baseline}
          stroke="var(--primary-300)"
          strokeWidth="1"
          strokeDasharray="3 3"
          opacity=".78"
        />
        <circle
          cx={xFor(liveU)}
          cy={yFor(liveE)}
          r="8"
          fill={
            state.tone === 'success'
              ? 'rgba(47,181,68,.20)'
              : state.tone === 'danger'
                ? 'rgba(242,65,65,.22)'
                : 'rgba(217,207,74,.20)'
          }
          filter={`url(#${id}-glow)`}
        />
        <circle
          cx={xFor(liveU)}
          cy={yFor(liveE)}
          r="4.5"
          fill={
            state.tone === 'success'
              ? 'var(--success-500)'
              : state.tone === 'danger'
                ? 'var(--danger-500)'
                : 'var(--accent-400)'
          }
          stroke="#060810"
          strokeWidth="1.5"
        />

        {[
          { u: 0, label: '0' },
          { u: EFFICIENCY_MU, label: '70' },
          { u: 1, label: '100' },
          { u: U_MAX, label: '140%' },
        ].map((tick) => (
          <text
            key={tick.label}
            x={xFor(tick.u)}
            y={H - 8}
            fill="var(--text-disabled)"
            fontFamily="var(--font-mono)"
            fontSize="8"
            textAnchor={tick.u === 0 ? 'start' : tick.u === U_MAX ? 'end' : 'middle'}
          >
            {tick.label}
          </text>
        ))}
      </svg>
      <div className="ls-efficiency__readout" aria-hidden="true">
        <span className="ls-efficiency__metric">
          <span>Utilization</span>
          <strong>u = {(u * 100).toFixed(0)}%</strong>
        </span>
        <span className="ls-efficiency__metric">
          <span>Efficiency</span>
          <strong>E = {(liveE * 100).toFixed(0)}%</strong>
        </span>
      </div>
    </figure>
  );
}
