# DESIGN SYSTEM — ATG (« groovy dark »)

> **STATUS: FINAL v1** (2026-07-12). Validated against four generated UI
> prototypes (`docs/design/prototypes/01–04`, model `gpt-image-2`), each
> visually reviewed — see §12 for the review findings and corrections.
> This document keeps evolving with the product; changes go through the
> same generate-observe-amend loop.

## 1. Art direction

**« Groovy dark »** — the *Out There* mood crossed with the game's own 2021
visual identity (deep blacks, dark purples, vivid yellows — see
`GAME_BIBLE.md` §9 and `assets/palette.jpeg`), rebuilt on the P2Enjoy chart,
shaded darker (documented exception to the light-theme default, CLAUDE.md §4
— owner decision).

- **Dark but colourful**: space is near-black with violet depth; life
  (planets, ships, UI accents) is saturated and warm. Darkness is the canvas,
  never the mood.
- **2D sprites over 3D environments**: hand-crafted sprites (ships, buildings,
  planets) composited over 3D scenes — the galaxy map is a real three.js
  star field (2D navigation, 3D "flat" depth styling); the planet view is
  isometric 3D-feel built from 2D tiles.
- **Old-school soul**: readable silhouettes, limited palettes per asset,
  visible upgrade overlays bolted on hulls (modular sprite composition,
  GAMEBOOK §26). No photorealism, no generic AI-theme gloss — intentional
  composition only.

## 2. Color tokens

### 2.1 P2Enjoy base chart (canonical references)

| Token | Hex | Role |
|---|---|---|
| `brand.blue` | `#23468C` | primary |
| `brand.green` | `#238C33` | success |
| `brand.yellow` | `#D9CF4A` | accent |
| `brand.red` | `#F24141` | danger |
| `brand.black` | `#0D0D0D` | principal black |

### 2.2 Dark-theme ramps (derived — darkened per owner's allowance)

| Token | Hex | Usage |
|---|---|---|
| `bg.space` | `#060810` | deepest background (galaxy void) |
| `bg.base` | `#0D0D0D` | app background (brand black) |
| `bg.raised` | `#111A30` | panels, cards (blue-shifted dark) |
| `bg.overlay` | `#16223F` | modals, popovers |
| `stroke.subtle` | `#24314F` | hairlines, card borders |
| `primary.600` | `#23468C` | primary surfaces, active nav |
| `primary.400` | `#3E6BC7` | interactive (buttons, links) |
| `primary.300` | `#6E96E8` | hover, focus tint |
| `violet.700` | `#2A1B52` | nebula depth, secondary surfaces |
| `violet.500` | `#4A2D8C` | secondary accents, lore/mystery semantics |
| `accent.400` | `#D9CF4A` | THE signature accent: highlights, selection, cells/"spice", CTA glow |
| `accent.200` | `#F2EC9B` | accent text on dark, sparklines |
| `success.500` | `#2FB544` | success, growth, efficiency-in-sweet-spot |
| `success.700` | `#238C33` | success surfaces |
| `danger.500` | `#F24141` | danger, combat, deficits |
| `danger.700` | `#B32626` | destructive surfaces |
| `warning.500` | `#E8A33D` | warnings (derived; distinct from accent) |
| `text.primary` | `#F2F4FA` | main text |
| `text.secondary` | `#A9B4CE` | secondary text |
| `text.disabled` | `#5D6883` | disabled |

**Semantic constants** (colors always mean the same thing): yellow =
value/attention/cells · green = growth/success/optimal · red =
danger/combat/deficit · blue = self/ownership/interactive · violet =
unknown/lore/others' territory. Climate hues on maps: hot `#E86A4A`, cold
`#6EC6E8`, temperate `#57C785`, poison `#9BE84A` (never reused for UI states).

## 3. Typography

- **Display / titles:** `Orbitron` (from the project's reserved sci-fi font
  shortlist, credits.md) — headings, HUD numerals, section titles. Weights
  500/700. Never for body.
- **Body / UI:** `Inter` (fallback `system-ui`) — 14 px base, 16 px reading,
  12 px dense tables. Line-height 1.5.
- **Mono (data):** `JetBrains Mono` — coordinates, seeds, quantities in logs.
- Scale: 12 · 14 · 16 · 20 · 24 · 32 · 40 (px, 1.25 ratio above 16).

## 4. Spacing, radius, elevation

- Spacing scale: 4 · 8 · 12 · 16 · 24 · 32 · 48 (px). Density: compact by
  default (management game), comfortable on touch.
- Radius: cards 12 px, buttons 8 px, chips 999 px, game-cards (hand) 16 px.
- Elevation on dark = **glow + hairline**, not gray shadows:
  `0 0 0 1px stroke.subtle, 0 8px 24px rgba(6,8,16,.6)`; selected/active
  items add an `accent.400` outer glow at 20–30 % opacity.

## 5. Core components

- **HUD frame** — persistent top bar (player, cells balance, alerts) + left
  rail nav (galaxy · planets · fleet · market · comms · factions). Compact,
  keyboard-navigable, collapsible.
- **Game card (hand)** — bottom-docked fan of construction/NPC cards: sprite
  art, cost chips (resource icons + qty), politics-lock badge, disabled state
  with reason ("no free tile", "mask denies"). Drag-to-place + keyboard flow.
- **Efficiency curve widget** — the signature component (GAMEBOOK §10): the
  tilted bell rendered with the live position dot; green zone at sweet spot,
  red past it; used per-unit and on the planet stats page.
- **Planet stats page** — object-first architecture (the planet is the
  first-class citizen): every unit listed with `u`, `E`, limiting factor.
- **Governance preview** — candidate governor set → resulting allow/deny mask
  matrix, diff-styled, with the permanence warning pattern (irreversible
  action = typed confirmation, never a simple OK).
- **Market/trade tables** — dense rows, pair badges, AMM depth bar,
  double-fee disclosure, mask disclosure on planet listings.
- **Mission/policy editor** — the instruction-block builder (predefined
  strategy library in MVP): stacked condition chips, readable as a sentence.
- **Comms screen (implemented, chunk I)** — two panes: left = incoming hails
  (accent-bordered cards, `Ping back` accent button — the historic gesture),
  open channels, sent hails (muted); right = chat (mine = primary bubble
  right-aligned, theirs = raised bubble left with author name in accent-200),
  input + Send. Empty state is lore-flavored ("The Silence is total…").
  Ping entry point: accent button on a foreign-owned planet panel (galaxy).
- **Infrastructure panel (implemented, chunk I)** — planet sidebar section
  listing no-tile buildings (telescope, probe pad) as `key Ln — status`
  (status colored success/warning); infrastructure cards build directly from
  the hand (no tile selection), and this panel is their only on-screen proof.
- **Ship panel: cargo hold & landing (implemented, chunk J)** — hold section
  (mono manifest `res · X.X T`, `used/total containers` count), success-green
  `Land` when hovering over a world, neutral `Undock` when docked; the
  load/unload mini-form (resource select + tons + Load primary / Unload
  neutral) appears only when docked at an owned world. Spaceport building
  panel gains the landing-policy select (Self only / Everyone).
- **Hospitality (implemented, chunk L)** — merchant worlds only (governance
  gate): planet-sidebar section (accent Store icon, published offers in
  mono `sell @ price want/T · floor N T · X T on offer`, sells/for selects +
  price + floor + accent `Publish offer`); visitor side: "Hospitality"
  cards in the ship panel, served while docked OR hovering.
- **Market slot & offers (implemented, chunk K)** — owner side: "Trade slot"
  form in the market building panel (buys/pays selects, rate, daily limit,
  accent `Post offer` button — accent = the merchant gesture); visitor side:
  "Market offers" cards in the docked ship panel (`give → get @ rate ·
  stock T` in mono, tons input + accent `Trade`), refusals surface the
  server's reason verbatim in the notice bar.
- **Shipyard panel (implemented, chunk M)** — "lay a keel" section in the
  shipyard building panel: category/size selects (locked sizes disabled
  WITH the reason — L hulls need a level 3 yard), live cost line in mono,
  name input, primary `Lay the keel`; the under-construction queue lists
  `name (category SIZE) — ETA` in warning color.
- **Toasts & event feed** — combat, arrivals, flares, dry deposits; grouped,
  timestamped, deep-linked.
- **Empty/loading/error states** — explicitly designed for every screen
  (CLAUDE.md §4); loading = starfield shimmer, empty = lore-flavored line +
  primary action, error = diagnostic without infrastructure detail.

## 6. Interactive states

Default · hover (`primary.300` tint / accent glow) · active/pressed (darken
6 %) · focus (**2 px `accent.400` outline, always visible, never removed**) ·
selected (accent glow + hairline) · disabled (`text.disabled`, keep label
readable, tooltip explains *why*) · destructive (danger ramp + confirmation).

## 7. Platforms & responsive

**Desktop and tablets only. Mobile is NOT supported** (owner decision).
Minimum viewport 1280×800; tablets get touch pan/zoom on the canvas scenes;
no mobile breakpoints exist anywhere. No horizontal body scroll ever; tables
scroll within their own container.

## 8. Accessibility

- All text tokens ≥ 4.5:1 on their backgrounds (`text.primary` on `bg.raised`
  ≈ 13:1; `accent.400` reserved for large text/icons on `bg.space` ≈ 9:1).
- Full keyboard play for management surfaces (canvas scenes get focusable
  overlay equivalents for critical actions).
- Roles/labels on all controls; curve widgets expose numeric equivalents;
  color-blind safety: states always double-encoded (icon or text + color).
- Motion-reduced mode: disable starfield parallax/nebula drift.

## 9. Icons & imagery

- **Lucide** for all UI icons; single stroke width; no emojis in the
  applicative UI (CLAUDE.md §4).
- Game sprites per GAMEBOOK §26 pipeline: base + transparent same-size
  overlay layers composited by the engine — the full sizing/naming/companion-
  map contract (bump maps, light maps, light propagation, stub swapping,
  HTML props) lives in **`docs/ASSET_PIPELINE.md`**; the living DOM contract
  is **`docs/design/props/index.html`** (every element at exact pixel size,
  stub-swappable).

## 10. Prototype kit (EXECUTED 2026-07-12 — kept for regeneration)

Four prototypes, 1536×1024, model `gpt-image-2` (env var `OPEN_AI_KEY`),
saved to `docs/design/prototypes/`, vision-reviewed against §2 tokens (§12):

1. **Galaxy map** — "dark colourful space-game UI, near-black `#060810`
   violet-nebula 3D starfield, 2D navigation, planet sprites with fog of war,
   left rail HUD in `#111A30`, yellow `#D9CF4A` selection glow, Orbitron-style
   headings, old-school isometric-sprite charm, intentional composition, no
   generic AI gloss."
2. **Isometric colony** — "isometric 2D-sprite planet colony over flat-3D
   ground, 8–10 tiles, mines/refinery with violet-black-yellow palette, card
   hand fanned at bottom with resource cost chips, efficiency bell-curve
   widget in a side panel."
3. **Market screen** — "dense dark trading UI, pair pools, depth bars, yellow
   accent on cells, humans/robots/rich-alien portraits as market flavor."
4. **Governance preview** — "allow/deny mask matrix, three governor
   portraits, permanence warning modal, dark blue panels, red danger accents."

## 11. Prototype review — findings & corrections (2026-07-12)

All four prototypes observed with vision against §1–§9. Verdict: **the
groovy-dark direction is validated** — deep violet-black space, dark blue
panels, yellow signature accent, dense-but-readable management UI all land.

**Confirmed & adopted:**
- **Pixel-sprite treatment is THE identity** (02/03/04 shine): iso planet
  chunks floating in violet space, pixel buildings with crystal scatter and
  glowing yellow fuel cells, pixel character portraits. Adopt pixel-sprite
  rendering for *all* game entities — including planets on the galaxy map.
- The **efficiency bell-curve widget** (02, right panel: curve + live dot +
  green sweet-spot + red overload) matches §5 exactly — canonize this render.
- The **governance matrix** (04): per-governor columns, ✓/✗ cells, yellow
  intersection column, "PERMANENT APPOINTMENT" modal with typed confirmation
  and visible focus ring — matches §5/§6 exactly — canonize.
- The **market scene strip** (03): poor human / robot / rich alien with
  scattered ship parts = GAME_BIBLE §7 verbatim. Keep as a flavor band on
  market screens.

**Round 2 (2026-07-12, prototypes 05–06 — HTML-fed technique):**
- **05-card-html-render**: feeding the card prop's actual HTML/CSS to
  gpt-image-2 produced a near-pixel-faithful render (badge, name, cost chips,
  yellow-accent copy, stats block) with finished pixel art in the 512² art
  zone. **HTML-fed prompting is now the official iteration method** for any
  UI surface (ASSET_PIPELINE §7); the card prop layout is validated as-is.
- **06-layered-lighting-scene**: the engine's north-star render — emissive
  light pools spreading onto terrain and neighboring sprites (yellow cells,
  blue engines, orange heat), a smog weather overlay reading as a distinct
  layer, bump-lit relief. This is the acceptance reference for the WebGL
  lighting pass (ASSET_PIPELINE §3).

**Corrections (prompt artifacts that CONTRADICT canon — never reproduce):**
1. **No "CREDITS", ever** (01/02/03 show them). There is no currency
   (GAMEBOOK §13): trading pairs are always resource↔resource; HUD balances
   show per-resource stocks, with **fuel cells** as the natural featured
   figure — never a money counter.
2. **No "END TURN"** (02). The game is a real-time tick simulation; the slot
   belongs to mission/alert controls, not turn controls.
3. **Planets are sprites, not photoreal renders** (01's right panel drifted
   photoreal). Galaxy-map bodies use the pixel-sprite planet set
   (`assets/icons/planets/`-style), consistent with 02.
4. Minor palette drift toward generic blue in 01 — anchor panels on
   `bg.raised #111A30` and keep the violet nebula depth present.

## 12. Écarts / documented deviations

- **Dark theme** instead of the P2Enjoy light default — owner decision for
  the game product (this file is the documentation required by CLAUDE.md §4).
- `warning.500`, violet ramp and climate hues are project-specific extensions
  of the chart, justified by the game's semantic needs; the five chart colors
  remain the anchors.
- The marketing site (Jekyll) may keep its own lighter styling; this system
  governs the **game** UI.
