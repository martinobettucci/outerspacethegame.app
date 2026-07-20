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
  with reason ("no free tile", "mask denies"). AO's resting deck exposes a
  **64 px pointer-safe spine** per non-last card (name readable, target ≥44 px);
  hover, keyboard focus or selection raises the complete card, straightens it
  and exposes the unchanged action. Reduced-motion removes the transition,
  not the state change. Click-to-place + keyboard flow.
- **Efficiency curve widget** — the signature component (GAMEBOOK §10): the
  tilted bell rendered with the live position dot; green zone at sweet spot,
  red past it; used per-unit and on the planet stats page.
- **Planet stats page (implemented, chunk BC)** — object-first command
  ledger: loud water/food/oxygen forecast cards (stock-out + total-loss
  dates), C/A/S pyramid and consuming-idle share, employment/unemployment,
  raw/effective illness with clinic reduction, Ē/M_life/natality, signed net
  resource flows per day, then every active unit with jobs/optimum, `u`, `E`,
  output and limiting factor. Survival states are double-encoded by icon/text
  and tone; the modal scrolls at desktop/tablet widths and remains keyboard
  closable/focus-contained.
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
- **Infrastructure panel (implemented, chunk I; telescope contract superseded
  2026-07-20)** — planet sidebar section listing the remaining no-tile
  building (`probe_pad`) as `key Ln — status` (status colored
  success/warning); its card builds directly from the hand and the row is its
  only on-screen proof. Telescope now uses the board tile flow and its standard
  building panel.
- **Ship panel: cargo hold & landing (implemented, chunk J)** — hold section
  (mono manifest `res · X.X T`, `used/total containers` count), success-green
  `Land` when hovering over a world, neutral `Undock` when docked; the
  load/unload mini-form (resource select + tons + Load primary / Unload
  neutral) appears only when docked at an owned world. Spaceport building
  panel gains the landing-policy select (Self only / Everyone).
- **Spaceport docks (implemented, chunk S)** — the spaceport panel's
  Landing policy section opens with a mono usage line
  (`data-testid="docks-usage"`): `Docks S x/2 · M y/2 · L z/2 ·
  N visitors aground · R reserved for own fleet · max stay H game h`
  (sizes with zero docks are omitted; occupied counts are HULLS of that
  size, so a shipyard overfill honestly reads `S 3/2`). Below it, an
  inline field pair — numeric `Visitor ground stay (game hours, 1–720)`
  and a 0/1/2 select `Docks reserved for own fleet` — applied by the
  standard block `Apply` button. Landing refusals surface the server
  message verbatim in the status notice (structural "no dock ≥ size"
  vs congestion "docks saturés" are distinct messages).
- **AMM pools (implemented, chunk U)** — market panel L2+: "AMM pool
  (L2+)" section with the canon hint; live pools as mono lines
  (`#i · x ⇄ y · rx/ry T · spot s · lp+house bp`,
  `data-testid="amm-pool-line"`) each with an Add-liquidity field pair
  and a danger `Withdraw` (%) control; the seed form (Leg X/Y selects,
  deposit inputs) shows the IMPLIED initial price
  (`data-testid="amm-implied-price"`) before commitment — seeding is a
  pricing decision made visible. Docked ship panel: AMM cards in
  "Market offers" (`AMM x ⇄ y · rx/ry T · spot · fees`), give-leg
  select + tons + accent `Swap`; the settlement notice carries the
  post-trade spot (price drift is felt, never hidden).
- **Route swap & triad nudge (implemented, chunk V)** — docked ship
  panel: a "Route swap (best execution)" block closes the Market offers
  section (give/get selects + tons + accent `Route`); the settlement
  notice names the intermediate and the fee count (`via fuel cells,
  2× frais`) — double fees are felt, never hidden. Market panel: the
  AMM section opens with a warning-tone triad line
  (`data-testid="triad-nudge"`) whenever no food pair exists within
  telescope range — it disappears the moment one is seeded.
- **Planet board terrain (implemented, chunk X — owner request)** — the
  iso board sits on an ORGANIC climate terrain slab (reference:
  prototype 02-iso-colony): noise-wobbled outline stable per planet,
  darker 24 px rim, three-shade procedural speckle, aura/shadow sized
  to the grid. Tile slots are GHOSTS (alpha .2, thin accent seams):
  hover reveals (alpha 1 + steel/gold tint), arming a card makes free
  tiles PULSE (static at .72 under prefers-reduced-motion), occupied
  tiles fade to .08 so sprites own the scene. Per-tile cliffs are gone;
  the 148×74 interactive diamond is unchanged (pointer/E2E contracts).
  Procedural v1 — generated climate textures (fal.ai/OpenAI Images)
  replace it once an image key is provisioned.
- **Governance (implemented, chunk W)** — planet sidebar section
  (Landmark icon): right-aligned mono badge `n/required seats · G ×x`
  (success when fully governed, danger otherwise), accent note
  "Personal ship parked — acting governor", danger warning
  "Under-governed — world runs at half efficiency", mono governor rows
  `role · rarity · people → archetype`. Install flow enforces the
  permanence pattern: candidate select (unbound rare+ NPCs, empty state
  text otherwise) → neutral `Preview mask` → mono preview card
  (resulting archetypes, G, allowed count, danger `−N lost` node list)
  → warning-colored typed-confirmation input (placeholder = planet
  name) → destructive-styled `Install forever` enabled ONLY on exact
  match. This is the reference implementation of "irreversible action =
  typed confirmation, never a simple OK".
- **UI texturing (implemented, chunk AA)** — four generated tileable
  backgrounds (`/generated/ui-{panel,card,shell,veil}.webp`, 512²,
  near-black indigo, extremely low contrast) sit as the MIDDLE layer of
  existing multi-layer backgrounds (tint gradients above at ~0.9 alpha,
  base color below): command panels & deck cards, galaxy panel, planet
  inspector & plaque, command rail, modal veil. Chrome texturing only —
  never game art; text contrast is the hard constraint (§22).
  Regenerate with `node game/scripts/genUiTextures.mjs`.
- **Generated soils (implemented, chunk Z)** — each climate slab is a
  gpt-image-2 texture (`/generated/soil-<climate>.webp`, 768², painterly
  dark-moody per this system) tiling under the chunk-X procedural
  accents (rim, specks, ghost slots) and masked by the organic contour;
  a missing texture falls back to the flat procedural fill. Regenerate
  with `node game/scripts/genSoil.mjs` (OPENAI_KEY in local .env,
  never committed; full-size archives in docs/design/prototypes).
- **Crew survival (implemented, chunk AB)** — crewed ship panels gain a
  "Crew survival" section: mono gauge `N crew · X food / Y water T
  stores`, a drain line (`-0.01 T/d · draining while the crew lives
  aboard` vs `host feeds the crew`), the flee policy state in
  success-green (armed) or danger-red (DISARMED) and its toggle button;
  cargo/combat hulls now expose `Assign pilot` (was civil-only).
  Derelicts simply vanish from the fleet and contact index — absence is
  the statement.
- **Hover auto-trade (implemented, chunk AM)** — ship panels (non
  personal/probe) carry a collapsible "Auto-trade (foreign hover)"
  details card: three rule rows (resource select + `below T` + `buy T`
  number inputs, `step=any`) and an `Apply rules` button; the hint
  spells the guardrail ("refuses rates worse than 3:1"). Notice:
  "Auto-trade rules applied."
- **Stargate consent (implemented, chunk AL)** — the yard's Stargates
  section gains a second form, `Propose to a foreign world (50/50
  split)` (select of visible foreign-owned worlds, `owner — name`
  labels); the TARGET world's view shows a "Gate proposals" inbox card
  (`<proposer> proposes a 50/50 gate from <world>`) with `Accept & pay
  half` / `Decline` buttons. Notices spell out the money: "both halves
  are paid on acceptance."
- **Stargates (implemented, chunk AK)** — the stargate_yard panel opens
  a "Stargates" section (Orbit icon): per-gate mono lines
  (`→ <far world> · active · toll N res`) with an inline toll form
  (resource + amount + Apply), and a build form (destination select
  scoped to the owner's OTHER worlds + `Build gate`). Ship panels at an
  active endpoint show a primary-blue `Traverse gate → <dest>` button
  (toll suffix for foreign gates); success notice "Gate crossed —
  scattered off the fixed point."
- **Salvage claims (implemented, chunk AJ)** — the contact index gains
  a "Wrecks" optgroup (radar of ownerless derelicts, `† category size`
  suffix); a stationary rigged ship within 1 pc shows a success-green
  `Claim <name>` button (Anchor icon), swapped for an amber mono
  `Claiming — HH:MM:SS` line while the two-hour hold runs. `Fit claim
  rig` joins the dockside fitting buttons. Notice: "the graveyard is a
  market."
- **Junk fields (implemented, chunk AI)** — ships in space with cargo
  get a Jettison row in the hold section (resource select scoped to the
  hold + tons + neutral `Dump` button); standing in a junk cell shows an
  amber field card `Junk field here — X T · hazard −Y HP/day` with a
  success-green `Collect junk` button when the collector is fitted.
  `Fit junk collector` (Package icon) joins the fitting buttons at dock.
  Notices distinguish the black-hole sink ("fed to the black hole") from
  a spreading field.
- **Workshop repair (implemented, chunk AH)** — while a docked hull is
  regaining HP the hull card swaps the amber wear line for a
  success-green mono `+96.0 HP/day · under repair — the workshop bills
  steel per HP`; the bar stays green.
- **Hull & shields (implemented, chunk AG)** — every ship panel shows a
  "Hull — X/Y HP" card (Shield icon) with a 6 px bar (success-green;
  danger-red while wearing) and, when a toll runs, an amber mono line
  `−4.0 HP/day · wearing — hostile environment, no matching shield`.
  Docked hulls on an owned world list the MISSING shields as neutral
  buttons (`Fit heat/cryo/radiation shield`); success notice "Shield
  mounted — the toll stops here."
- **Star harvest (implemented, chunk AF)** — docked hulls on an owned
  workshop world get a neutral `Fit harvest rig` button (Sun icon);
  idle rigged hulls within 8 pc of a star show a success-green
  `Harvest <star> (+N u/day)` button with the live net-yield preview,
  swapped for a neutral `Stop harvest` while linked. The fuel section
  shows the positive rate in success-green mono (`+91.7 u/day ·
  harvesting starlight`). Star panels add a danger chip `FLARING — the
  star is nearly spent. Evacuate.` when the 5% warning burns, and
  annihilated worlds a muted "Annihilated — ash of a supernova." line.
- **Provisioning (implemented, chunk AE)** — crewed non-personal hulls
  docked/hovering/stranded on an owned world get a neutral `Provision`
  button (Soup icon) beside `Refuel`; success notice "Provisions loaded
  — crew stores topped up.", refusals surface the server reason. While
  the planet below feeds the crew (own-world hover, served), the
  survival section keeps the calm "host feeds the crew" line — the
  danger drain line only appears when the ship itself pays.
- **Vehicle warehouse (implemented, chunk AD)** — docked ships on an
  owned world (personal/probe excluded) get a neutral `Warehouse`
  button (Warehouse icon) after Undock; a warehoused hull swaps it for
  a muted hint line ("Zero upkeep… crew was released on entry;
  redeploying takes 1/3/6 h by size and needs a free dock") above a
  success-green `Retrieve` button, replaced by an amber mono
  `Redeploying — HH:MM:SS` line once the redeploy event is pending.
  The warehouse building panel opens with a mono balance line
  (`data-testid="vehicles-usage"`): `Vehicles S 1/8 · M 0/6 · L 0/2`
  plus the separate-balances hint, above the visibility select.
- **Retool (implemented, chunk Y)** — the industry tuning section ends
  with a violet `Retool` button (active buildings only) that reopens the
  same RecipePicker used at placement; during the swap the panel shows a
  warning `Retooling · <recipe>` OperationTimer and the status pill
  reads `retooling`; notices distinguish the Industrialist instant path
  ("Forge world: instant retool") from the standard pause ("production
  paused (24 game h)").
- **Manual channel (implemented, chunk T)** — three surfaces. Warehouse
  building panel: "Warehouse visibility" select (Private — hidden
  reserve / Public — browsable dockside) with an explanatory subtitle
  (public = advertisement AND leak). Docked ship panel on a foreign
  world with a public warehouse: "Public warehouse" section — scrollable
  mono stock list (`res · X T`, max-height 120), offer form (Ask
  for/Pay with selects + tons inputs, accent `Send manual offer`
  enabled once a resource is picked), the buyer's own open offers as
  rows `X T res ← Y T res` with a danger-outline `Withdraw`. Owner
  planet sidebar: "Manual offers" inbox (hidden when empty) — rows
  `buyer · X T res ← Y T res` with success `Accept` / danger-outline
  `Decline`; refusals and results surface via the status notice.
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
- **Ship panel: settlers & colonization (implemented, chunk N)** —
  "Settlers — n/pax" section with the violet `Colony kit` chip once
  fitted; docked-owned controls: spinbutton + `Embark`/`Disembark`,
  `Fit colony kit`, `Assign pilot` (shows the NPC's rarity and risk
  reduction %); hovering an eligible wild world surfaces the accent
  `Colonize` button (accent = the historic gesture); while `colonizing`,
  the panel shows the warning-colored "Establishing colony — ETA"
  countdown and no movement controls.
- **Programs section (implemented, chunk N)** — planet sidebar region
  (FlaskConical icon) for tile-less tech programs (today:
  `colony program`): unlock button with cost, or the success-green
  "Unlocked — colony fittings enabled here." line. Programs are never
  hidden by the mask — locked states carry the reason.
- **Colony grace badge (implemented, chunk N)** — violet chip in the
  planet header ("Colony grace until <date>", title = the protection
  hint). Starters wear it too: a starter IS a fresh colony.
- **Ship panel: fuel gauge & stranding (implemented, chunk O)** — "Fuel —
  x/tank u <type>" in mono with a 6 px progress bar (success-green fill;
  danger-red when stranded); beneath it either the amber mono drain rate
  ("−0.2 u/day") or the explanatory "loitering paid by the planet below"
  when hovering an owned world. `stranded` replaces the status line with
  a danger chip ("Stranded — out of fuel", title = recovery hint) and
  hides every movement button (server refuses regardless — §10). Neutral
  `Refuel` button (Fuel icon) when docked/hovering/stranded on an owned
  world; "Transfer fuel" mini-form (target select limited to own hulls
  within 1 pc + units + accent Transfer) on tank-bearing hulls.
- **Market screen: Census tab (implemented, chunk P)** — Market rail
  entry now opens a tabbed screen: Census active; Trading/Auctions
  disabled WITH the reason (title + aria-label, same pattern as the
  rail). Census = meta line (snapshot timestamp + "4× per game day"),
  the canon-rule chip ("Global totals only — per-planet breakdowns are
  never published", violet chip), and a semantic <table> (th scope,
  row headers) of the FULL resource catalog grouped by tier — zeros
  displayed, mono right-aligned totals. Explicit loading/error(+retry)/
  empty states.
- **Foreign-body intel panel (implemented, chunk Q)** — the galaxy body
  panel for non-owned planets composes by tier: primary chip badge
  ("Intel L1..L3", "Deep sight" at 4, Telescope icon), then Development /
  Strategic / Deep sight blocks as they unlock; locked tiers show a
  Lucide Lock row naming WHAT is missing ("Level 2 telescope required",
  "Deep sight needs a scientific eye — or a probe on site") — UI shows
  the path, the rule lives server-side. Deposit presence chips carry no
  tonnage before deep sight; quality never appears below tier 4.
- **Infrastructure level-up (implemented, chunk Q; telescope moved to board
  2026-07-20)** — the tile-less `probe_pad` row gains a violet chip-button
  "Level up → L{n+1}" (visible when active and below max). Telescope uses the
  standard building panel opened from its surface tile for level-up,
  workforce and demolition.
- **Market screen: Recruitment tab (implemented, chunk R)** — the pod
  flow: pay-with select shows the LIVE per-resource price in each option
  (mono), from-world select, accent "Open pod — N T" button (accent =
  the gamble gesture). Reveal card: role + RARITY in its color ramp
  (common gray / uncommon success / rare primary / epic violet /
  legendary accent) + people + rolled stat in mono + paid line with the
  60-day account-bind date. Roster below lists every owned character
  (role, rarity color, stats, host binding or "unassigned", bind date).
  Refusals surface the server reason verbatim in the status line. For accounts
  younger than 45 days, the console additionally presents a persistent lock
  explanation **before interaction**, including the server-derived unlock
  date; the Open action is disabled with the same reason. The POST refusal
  remains authoritative and is still tested directly.
- **Toasts & event feed** — combat, arrivals, flares, dry deposits; grouped,
  timestamped, deep-linked.
- **Empty/loading/error states** — explicitly designed for every screen
  (CLAUDE.md §4); loading = starfield shimmer, empty = lore-flavored line +
  primary action, error = diagnostic without infrastructure detail.
- **Codex (player manual, first slice implemented — P2.codex)** — a dialog overlay reachable
  from the left rail on every screen (`useDialogFocus`: focus trap, Escape,
  focus return). Two-pane: section nav + scrolling content; opens deep-linked
  to the section matching the current screen. Layered depth: plain-language
  lead + an expandable "Exact rule & formula" disclosure (numbers/curves).
  Tokens & Lucide icons per this system; **no emoji-as-icon** (§9). Concept
  diagrams are inline SVG plotted from the real `@atg/shared` functions (never
  drift). The delivered population chapter includes the optional medical burn
  and its C/A/S weights from live constants. Spec: `docs/MANUAL_PLAN.md`.

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
