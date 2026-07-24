/** @spec All declarations and algorithms in this file implement: docs/BACKLOG.md §P2.codex; docs/MANUAL_PLAN.md §2–§7. */
/**
 * Codex concept diagrams — inline SVG plotted from the real shared model, so
 * the drawing IS the rule and cannot drift (docs/MANUAL_PLAN.md §4). The
 * efficiency chapter reuses the live `EfficiencyCurve` instrument directly.
 */
import { stableSplit } from '@atg/shared';
import { CODEX_FACTS, perDay } from './facts.ts';

const W = 300;
const H = 140;

/**
 * Deposit depletion vs. the trace floor. A finite deposit drains to zero and
 * stops (permanent); the trace floor is a separate, much lower trickle that
 * only applies where no deposit ever existed. Illustrative shape; the trace
 * label is the live value.
 */
export function DepositDepletionDiagram() {
  const padX = 30;
  const padTop = 14;
  const padBottom = 26;
  const x0 = padX;
  const x1 = W - padX;
  const yTop = padTop;
  const yBase = H - padBottom;
  // Deposit: high start, linear drain to zero at 65% width, flat zero after.
  const dryX = x0 + (x1 - x0) * 0.65;
  const depositPath = `M ${x0} ${yTop} L ${dryX} ${yBase} L ${x1} ${yBase}`;
  // Trace floor: a low flat line across the whole span.
  const traceY = yBase - (yBase - yTop) * 0.14;

  return (
    <figure className="ls-codex-fig">
      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="A finite deposit drains to zero and stops; the trace floor is a much lower, constant trickle."
      >
        {/* axes */}
        <line x1={x0} y1={yTop} x2={x0} y2={yBase} stroke="rgba(110,150,232,.25)" />
        <line x1={x0} y1={yBase} x2={x1} y2={yBase} stroke="rgba(110,150,232,.25)" />
        {/* trace floor */}
        <line
          x1={x0}
          y1={traceY}
          x2={x1}
          y2={traceY}
          stroke="var(--accent-400)"
          strokeWidth="1.5"
          strokeDasharray="4 3"
        />
        <text x={x1} y={traceY - 5} fill="var(--accent-400)" fontFamily="var(--font-mono)" fontSize="8" textAnchor="end">
          trace {perDay(CODEX_FACTS.traceRatePerDay)}
        </text>
        {/* deposit output */}
        <path d={depositPath} fill="none" stroke="var(--primary-300)" strokeWidth="2.4" strokeLinejoin="round" />
        <circle cx={dryX} cy={yBase} r="3.5" fill="var(--danger-500)" />
        <text x={dryX} y={yBase + 16} fill="var(--danger-500)" fontFamily="var(--font-mono)" fontSize="8" textAnchor="middle">
          dry → 0 forever
        </text>
        <text x={x0} y={yTop - 4} fill="var(--text-disabled)" fontFamily="var(--font-mono)" fontSize="8">
          output
        </text>
        <text x={x1} y={yBase + 16} fill="var(--text-disabled)" fontFamily="var(--font-mono)" fontSize="8" textAnchor="end">
          time →
        </text>
      </svg>
    </figure>
  );
}

/** The stable age pyramid, proportions taken from the real `stableSplit`. */
export function AgePyramidDiagram() {
  const split = stableSplit(1000);
  const rows = [
    { label: 'Seniors', value: split.seniors, tone: 'var(--primary-400)' },
    { label: 'Actives', value: split.actives, tone: 'var(--success-500)' },
    { label: 'Children', value: split.children, tone: 'var(--accent-400)' },
  ];
  const max = Math.max(...rows.map((r) => r.value));
  const padX = 66;
  const barMax = W - padX - 46;
  const rowH = 30;
  const top = 16;

  return (
    <figure className="ls-codex-fig">
      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Stable age pyramid: children ${Math.round((split.children / 1000) * 100)}%, actives ${Math.round((split.actives / 1000) * 100)}%, seniors ${Math.round((split.seniors / 1000) * 100)}% — only actives work.`}
      >
        {rows.map((r, i) => {
          const y = top + i * rowH;
          const w = (r.value / max) * barMax;
          return (
            <g key={r.label}>
              <text x={padX - 8} y={y + 13} fill="var(--text-secondary)" fontFamily="var(--font-mono)" fontSize="9" textAnchor="end">
                {r.label}
              </text>
              <rect x={padX} y={y} width={w} height={18} rx="3" fill={r.tone} opacity={r.label === 'Actives' ? 0.95 : 0.55} />
              <text x={padX + w + 6} y={y + 13} fill="var(--text-disabled)" fontFamily="var(--font-mono)" fontSize="8">
                {Math.round((r.value / 1000) * 100)}%
              </text>
            </g>
          );
        })}
        <text x={padX} y={H - 6} fill="var(--text-disabled)" fontFamily="var(--font-mono)" fontSize="8">
          only actives work
        </text>
      </svg>
    </figure>
  );
}
