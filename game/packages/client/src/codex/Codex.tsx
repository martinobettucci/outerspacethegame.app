/** @spec All declarations and algorithms in this file implement: docs/BACKLOG.md §P2.codex; docs/MANUAL_PLAN.md §2–§7. */
/**
 * The Player Codex overlay (docs/MANUAL_PLAN.md §3). Reachable from every
 * screen via the command rail; opens deep-linked to the chapter matching the
 * current view. Two-pane: chapter nav + scrolling content. Uses the shared
 * `useDialogFocus` (focus trap, Escape, focus return) for accessibility.
 */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { BookOpen, X } from 'lucide-react';
import { useDialogFocus } from '../components/useDialogFocus.ts';
import { api } from '../api.js';
import { CODEX_SECTIONS, type CodexSectionId } from './sections.tsx';
import { codexEn as c } from './strings.ts';
import '../styles/codex.css';

export function Codex({
  initialSection,
  planetId = null,
  onClose,
}: {
  initialSection: CodexSectionId;
  /** Planète actuellement ouverte (chapitres contextuels — bâtiments). */
  planetId?: string | null;
  onClose: () => void;
}) {
  const dialogRef = useDialogFocus(onClose);
  const [active, setActive] = useState<CodexSectionId>(initialSection);
  // Spoiler-free (MANUAL_PLAN §1/§6) : les chapitres GATÉS n'apparaissent
  // que lorsque l'écran correspondant existe pour CE joueur — le chapitre
  // Crusader exige d'en posséder un (le panneau de bord est alors visible).
  const [hasCrusader, setHasCrusader] = useState(false);
  useEffect(() => {
    let cancelled = false;
    api
      .fleet()
      .then(
        (f) =>
          !cancelled &&
          setHasCrusader(f.ships.some((s) => s.crusader !== null)),
      )
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  const sections = CODEX_SECTIONS.filter(
    (s) => s.requires !== 'crusader' || hasCrusader,
  );
  const section = sections.find((s) => s.id === active) ?? sections[0]!;

  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="ls-codex-title"
      tabIndex={-1}
      className="ls-codex-layer"
    >
      <section className="ls-codex-shell">
        <header className="ls-codex-header">
          <span className="ls-codex-sigil" aria-hidden="true">
            <BookOpen size={22} strokeWidth={1.6} />
          </span>
          <div className="ls-codex-heading">
            <span className="ls-codex-eyebrow">{c.subtitle}</span>
            <h2 id="ls-codex-title">{c.title}</h2>
            <p>{c.tagline}</p>
          </div>
          <button
            type="button"
            className="ls-codex-close"
            onClick={onClose}
            aria-label={c.close}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <div className="ls-codex-body">
          <nav className="ls-codex-nav" aria-label={c.navHeading}>
            <span className="ls-codex-nav__heading">{c.navHeading}</span>
            {sections.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`ls-codex-nav__item${s.id === active ? ' is-active' : ''}`}
                aria-current={s.id === active ? 'true' : undefined}
                onClick={() => setActive(s.id)}
              >
                <span className="ls-codex-nav__icon" aria-hidden="true">
                  {s.icon}
                </span>
                {s.title}
              </button>
            ))}
          </nav>

          <article className="ls-codex-content" key={section.id}>
            <h3 className="ls-codex-content__title">{section.title}</h3>
            <section.Body planetId={planetId} />
          </article>
        </div>
      </section>
    </div>,
    document.body,
  );
}
