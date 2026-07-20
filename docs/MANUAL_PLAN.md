# MANUAL / CODEX — plan & architecture (player-facing help)

> **Status:** living plan (CLAUDE.md §5). This document is the *spec* for the
> in-game player manual ("the Codex"). It is **not** a copy of the manual
> content — the authoritative player content lives in the client (see
> §"Single source of truth"). Persisted BEFORE implementation on owner
> validation (2026-07-20, spoiler policy + first slice confirmed). The first
> slice is delivered; this plan remains live for its backfill.

---

## 0. Why

ATG is a deep systems game (finite deposits, three-age demographics with
death clocks, efficiency curves, employment mortality, storage brakes, an AMM
market). New players face a dense HUD and **emergent caveats that live only in
code** — e.g. a depleted deposit yields **0 forever** and does *not* fall back
to trace mining, while a never-seeded basic mines a flat trace rate forever.
Nothing player-facing explains these. The Codex closes that gap.

The internal canon (`GAME_BOOK.md`, `DESIGN_GUIDE.md`) is developer-facing and
references implementation (Postgres, ticks, handlers). The Codex is a distinct
deliverable: **player language, zero internal references, always reachable.**

This satisfies CLAUDE.md §5 ("`docs/manual.md` ou un dossier `manuals/`
lorsque le projet nécessite une documentation utilisateur"): the **in-app
Codex is that user documentation**; this file documents the system.

## 1. Owner decisions (validated 2026-07-20)

- **Spoiler policy — systems only, spoiler-free.** The Codex teaches
  *mechanics and formulae* (how deposits deplete, how efficiency works, how
  employment kills) but does **not** enumerate discoverable content (planet
  types, specific crystals, factions, the full tech tree). Discovery via
  fog-of-war / telescopes stays a core loop (GB §0, §4). Rule of thumb: explain
  the *system*, never the *map*.
- **First slice — Codex shell + 3 mechanics.** Ship the delivery panel, the
  single-source number binding, and the three highest-confusion sections
  (deposits & trace mining, population v2, efficiency & employment), fully
  tested (§15) and visually verified (§16). Then backfill the rest.
- **Reference before strategy.** Balance is still in flux (BALANCE_LOG active),
  so strategy guides are deferred — any written now would be wrong after the
  next tuning round. The first slices are exact *reference*; a lighter,
  explicitly-advisory "tips" layer comes later.

## 2. Single source of truth (anti-drift — the core constraint)

The internal canon already drifts from code (audit 2026-07-20: trace-mining
caveat absent from GAMEBOOK, tick cadence still `(OPEN)` in §27 though
implemented). A hand-written manual would be a **third** copy and drift worse.
Therefore:

- **Every number is imported live from `@atg/shared`**, never typed into prose.
  The trace rate renders from `TRACE_MINING_T_PER_DAY`; the unemployment
  tolerance from `UNEMP_TOLERANCE`; efficiency shape from `EFFICIENCY_*` +
  `efficiency()`. When balance changes a constant, the Codex updates itself.
- **Text is centralised and typed** in the dedicated `src/codex/strings.ts`
  namespace (`codexEn`) — English first, structured for translation. This is
  the documented temporary concurrency deviation from `t.codex.*`; migration
  into the shared i18n object is mechanical once `i18n/en.ts` is no longer a
  parallel-edit hotspot. Prose never embeds a balance value; it interpolates
  imported constants at render time.
- **Formulae are rendered, not transcribed.** Where a curve matters (efficiency,
  over-cap parabola), reuse/extend the existing `EfficiencyCurve` component or
  plot from the shared function directly, so the drawing is the real function.
- **A unit test asserts the binding**: for each documented constant, the Codex
  renders the *current* value from `@atg/shared` (guards against a future
  hardcode regression).

Content authoring surface (client): `src/codex/` — a typed section registry
(id, title key, screen affinity, body renderer). No content lives in `docs/`.

## 3. Delivery (in-app)

- **Current entry point:** a "Codex" button on the left rail of `GameShell`
  (`ls-rail-button` pattern), reachable from **every** screen. Secondary `?`
  affordances and a keyboard shortcut are deferred with the P7 backfill.
- **Presentation:** a dialog overlay using the existing `useDialogFocus`
  (focus trap + Escape + focus return, §22 a11y). Two-pane: section nav +
  content; scrolls internally; responsive (desktop/tablet, §7 of DESIGN_SYSTEM).
- **Contextual deep-link:** the current first slice maps PlanetView and
  GalaxyMap to deposits, and Market to efficiency. `view.kind` selects that
  default; later travel, telescope, census and trading chapters will refine
  the mapping when they exist.
- **Layered depth:** each section leads with plain language; an expandable
  "Exact rule & formula" block reveals the numbers/curve for min-maxers. Newcomer
  and optimizer served by the same entry.
- **Design system:** DESIGN_SYSTEM.md tokens, Lucide icons, groovy-dark theme,
  **no emoji-as-icon** (§4). New component documented in DESIGN_SYSTEM §5 and DAT.

## 4. Illustrations (maintained, not rotting)

- **Concept diagrams:** inline SVG plotted from the real shared functions
  (efficiency curve, deposit depletion vs trace floor, age pyramid). These never
  drift — they *are* the function.
- **UI captures:** generated from the real client via the existing Playwright
  pipeline (`packages/e2e`), not hand screenshots. Renewed when UI changes
  (§7, §16). The first slice now ships with its SVG diagrams and seven observed
  captures, including the medicine rule and the 1280×800 minimum viewport.

## 5. Definition of Done gate (forward contract)

Like the seed contract (§8), **manual coverage becomes part of DoD**: any
future gameplay chunk that adds/changes a player-visible mechanic must add or
update its Codex section in the same commit. Backfill existing mechanics once
(this initiative); gate new ones permanently.

**The gate, in one rule:** *if the change alters what the player sees or does
on a screen, the Codex section for that screen is updated in the same commit —
and the update stays spoiler-free, explaining only what the player can already
see and act on there.*

What "player-visible" covers (non-exhaustive): a new/changed field, panel,
button, badge, status, resource, cost, timer, forecast, chart, alert, or any
rule the player can feel through those. Pure backend/refactor with no on-screen
or behavioural difference does not trigger the gate.

**Preserve the lore and the discovery — do not spoil (binds §1).** The Codex
explains *the system behind what is already on the player's screen*, never the
map ahead of them. Concretely, when you write or update a section:

- **Scope it to the current screen.** A section deep-linked from a screen (§3)
  explains the mechanics of things visible or reachable *on that screen now* —
  not content the player has yet to discover.
- **Explain systems, not the map.** Say *how* a mechanic works (deposits
  deplete, illness kills, medicine is optional); never enumerate undiscovered
  content — planet types, specific crystals, factions, unreached tech, hidden
  worlds, story/lore reveals. Those are for the player to find (GB §0, §4).
- **No forward references.** If a mechanic only becomes visible after an action,
  a place, or an unlock the player hasn't reached, it does not belong in a
  Codex section they can open before then. Its explanation ships with the
  screen that first surfaces it.
- **Reference before strategy.** State the rule; do not prescribe the optimal
  play (§1) while balance is still moving.

When in doubt: describe what is on the screen, in the player's language, with
numbers rendered live from `@atg/shared` (§2) — and stop at the edge of what
they have discovered.

## 6. Section outline (spoiler-free; ★ = first slice)

1. ★ **Deposits & mining** — natural deposits (the 3–7 on a planet), finite &
   deplete, **dry = 0 forever**; the 12 basics are always mineable at the flat
   trace rate; the asymmetry (dry deposit ≠ trace fallback); crystals need a
   matching deposit. Sources: `TRACE_MINING_T_PER_DAY`, deposit model.
2. ★ **Population** — three ages (children/actives/seniors), aging on fixed
   epochs, only actives work; natality needs residential + good management;
   survival rations, oxygen on hostile climates; medicine optional and outside
   death clocks/natality, with its higher C/S age burden and sellable surplus;
   death clocks; over-capacity risk.
   Sources: `popv2.ts` (`*_DAYS`, `NATALITY_BY_RESIDENTIAL`, `RATION_CS`,
   `OXYGEN_PER_1000_PER_DAY`, `MEDICINE_AGE_WEIGHTS`, `CLOCK_DAYS`, over-cap
   coefs), `POP_NEEDS_PER_1000_PER_DAY`, `popCap`.
3. ★ **Efficiency & employment** — the efficiency curve vs staffing; every
   building employs; the optimum drifts with total population; **unemployment
   kills** past tolerance/grace; the storage brake. Sources: `efficiency()`,
   `EFFICIENCY_*`, `jobsOptimal`/`BASE_JOBS`/`JOBS_LEVEL_MULT`/`popScale`,
   `UNEMP_*`, `storageBrake`.
4. Buildings & recipes (policy agents, retooling) — later.
5. Movement, travel & fuel — later.
6. Discovery & telescopes (systems only) — later.
7. Governance & the personal ship — later.
8. Economy: census, trading, pods, auctions — later.
9. Combat resolution — later.
10. Getting started (first session flow) — later.

## 7. Testing (§15) & verification (§16)

- **Unit:** the number-binding and formatter suite checks every documented
  constant against its live `@atg/shared` value.
- **E2E (Playwright):** Codex opens from GalaxyMap, PlanetView and Market;
  contextual default section matches the origin screen; the three sections
  render their headings, the medicine values are live, the interactive "Exact
  rule" block toggles, and the shell remains inside the 1280×800 viewport.
- **Visual:** seven generated JPEG captures cover the screens, three sections,
  medicine disclosure and minimum supported viewport; all are observed (§16).

## 8. Resolved related defect (2026-07-20)

The canonical filename is `GAME_BOOK.md`. All live references in the working
rules and design documentation now use that path; the doc-integrity item is
closed in BACKLOG. Historical commit messages are immutable and are not live
links.

## 9. Non-goals (first slice)

- No progressive/discovery-gated unlock (spoiler-free static systems chosen).
- No strategy guide (deferred until balance settles).
- No enumeration of discoverable content.
- No hand-authored screenshots: diagrams stay live SVG and UI proofs are
  generated by Playwright.
