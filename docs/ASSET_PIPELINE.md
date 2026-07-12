# ASSET PIPELINE — sprites, layers, maps & prototyping props

> The contract between game design, artists and the engine. Every sprite in
> the game follows the sizing, layering, naming and companion-map rules below.
> The HTML **prop sheet** (`docs/design/props/index.html`) renders every
> element at its exact size from **generated stub images** — swap a stub file
> for real art (same path, same name) and the game reveals itself.
>
> Platform target: **desktop and tablets only. Mobile is not supported.**

---

## 1. Canonical sprite sizes

| Element | Size (px) | Notes |
|---|---|---|
| Planet S | **128×128** | |
| Planet M | **256×256** | |
| Planet L | **512×512** | |
| Star / black hole (giants) | **2048×2048** | un-landable bodies |
| Building | **512×256** | isometric, 3 levels = 3 base sprites |
| Ship | **512×256** | isometric, 9 hulls (Combat/Cargo/Civil × S/M/L) |
| Ground unit | **512×256** | placed like a building — same dimensions (owner decision) |
| Portrait (player & NPC) | **512×1024** | full-height character |
| Card | **512×1024** (DOM) | composite: **512×512 sprite art** + text/stats zone (HTML, not baked in the image) |
| Resource icon | **256×256** | from the 2021 briefs |

## 1bis. File formats (owner decision)

- **All non-card props are ANIMATED GIFs** (`.gif`, ≥2 frames, loop): planets,
  stars, buildings, ships, units, portraits, resources — idle animation is
  part of the identity. **Card art stays static PNG** (`cards/*.png`).
- **Companion maps follow their sprite**: `X.bump.gif` / `X.light.gif`,
  **frame-synchronized** with `X.gif` (same frame count & timing) so relief
  and lights animate with the sprite. Card companions stay PNG.
- GIF constraints (engine + artists): ≤256 colors/frame, **binary
  transparency** — so in light maps the **intensity is carried by pixel
  brightness** (white = max), not by alpha; soft halos are the engine's job,
  never baked into edges.

## 2. The layer mechanic (universal)

**Base sprite + transparent overlay layers of the SAME size**, where only the
changes are drawn opaque. Applied everywhere:

- **Ships:** base hull + one overlay per installed upgrade/accessory
  (engine L1/L2, armor, cargo, weapons, harvest rig…). The fitted ship is the
  runtime composite `base + Σ overlays`.
- **Buildings:** base per level (l1/l2/l3) + **climate-adaptation overlays**
  (hot/cold/temperate) + condition overlays if needed.
- **Ground units:** base + variant/level overlays.
- **Planets:** base per climate×size + **weather/condition overlays** —
  `smog`, `ice`, `burn`, `poison`, `radio`… — to simulate changing conditions
  without redrawing worlds.
- Overlays stack in declared z-order; an overlay never resizes its base.

## 3. Companion maps (every image, no exception)

Each sprite file `X.png` ships with:

- **`X.bump.png`** — bump/height map (grayscale; mid-gray = neutral) used by
  the renderer to relight the 2D sprite with scene lighting and add depth.
- **`X.light.png`** — light-source map: fully transparent PNG where **white
  pixels (with alpha) mark emissive light sources** on the sprite (windows,
  engines, glowing cells). Alpha = intensity.

**Engine requirements (client renderer, see DAT §2):**
- WebGL 2D lighting pass: sprites lit by scene lights using their bump maps;
- every sprite's light map **emits into the scene**: light spreads to the
  environment and to nearby sprites (radius/falloff per light, additive);
- overlays contribute their own bump/light on top of the base's.

## 4. Folder & file naming (the swap contract)

Root: **`assets/game/`**. Real art replaces stubs **at the same path** —
no code/HTML change needed, ever.

```
assets/game/            # non-card files are .gif (animated)
├── planets/    planet_{climate}_{s|m|l}.gif          climate ∈ hot|cold|temperate|poison
│               planet_{climate}_{size}.ov.{cond}.png cond ∈ smog|ice|burn|poison|radio
├── stars/      star_{cold|hot|gas}.png · blackhole.png            (2048)
├── buildings/  building_{key}_l{1|2|3}.png           key ∈ mine|refinery|spaceport|market|workshop|turret …
│               building_{key}_l{n}.ov.{hot|cold|temperate}.png
├── ships/      ship_{combat|cargo|civil}_{s|m|l}.png
│               ship_{cat}_{size}.ov.{upgrade}.png — PER-HULL set, slot rules
│               enforced (weapons: Combat only; cargo: Cargo only; OBS: M/L
│               Combat; colony_fitting: Civil M/L); upgrades ×2 levels
│               (engine_1/2, armor_1/2, fuel_1/2, obs_1/2, weapon_a2a_1/2,
│               weapon_a2g_1/2, cargo_1/2) + accessories (harvest,
│               junk_collector, claim_rig, scanner, shield_hot/cold/radio)
│               + ship_personal.png, ship_probe.png
├── units/      unit_{key}_l{n}.gif  (512×256, placed like buildings)
├── portraits/  portrait_{human|forged|vess}_{role}_{nn}.png
├── cards/      card_{building|npc|item}_{key}.png     (512×512 art only)
├── resources/  res_{key}.png
└── fx/         (junk fields, explosions, gate effects — later)
```

- Companions always: `{name}.bump.png`, `{name}.light.png` — same folder.
- Names are lowercase snake_case; keys match `DESIGN_GUIDE.md` identifiers.
- `docs/design/props/manifest.json` lists every expected file with a human
  description of what the art must depict (kept in sync with stubs).

## 5. Stub images (current state)

All files under `assets/game/` are **programmatically generated placeholders**
(script: `docs/design/props/generate_stubs.py`):

- exact final dimensions; dark `#111A30` field, hairline border, diagonal
  hatching;
- a **clear printed label**: element type, key, size, and `STUB` marker;
- `.bump.png` stubs = neutral gray with faint shape; `.light.png` stubs =
  transparent with a few white emissive dots (so the lighting pass is
  testable before real art exists).

Regenerate anytime: `python3 docs/design/props/generate_stubs.py`.

**Current coverage: 586 assets (×3 files = 1 758)** — full v0 catalog: 28
buildings (warehouse included) ×3 levels ×(base+hot+cold), 11 ships with per-hull overlay sets,
15 ground units, 18 portraits (full 3-peoples × 6-roles matrix — any people,
any role), 42 cards, 30 resources, 12 planets + weather overlays on every
climate×size, 4 giants. Browse: `docs/design/props/gallery.html`
(auto-generated).

## 6. HTML props (fixed-size components)

`docs/design/props/index.html` + `props.css` — the **prop sheet**: one fixed,
pixel-exact HTML component per element (planet S/M/L, star, building, ship
with live overlay toggles, unit, portrait, card with stats zone, resource
icon, layer-stack demo, light-glow demo). Open in a desktop browser
(≥1280 px). Props use plain `<div class="prop-…">` + `<img>` layers —
copy-pasteable into any future client as the DOM contract.

- Cards are **composite props**: the 512×512 art sits in the top square; the
  bottom 512×512 zone renders name, category badge, cost chips and stat rows
  in HTML (design-system tokens) — text is never baked into card art.
- The prop sheet fakes light spread with CSS glows for preview; the real
  engine does it in WebGL per §3.

## 7. Iterating the design system with gpt-image-2

Feeding the **actual prop HTML** (structure + CSS) inside the gpt-image-2
prompt produces far more faithful renders than prose alone. Loop:
prop HTML → gpt-image-2 render → vision review vs tokens → amend
DESIGN_SYSTEM/prompts → regenerate. Renders live in
`docs/design/prototypes/`; findings in `DESIGN_SYSTEM.md` §11.

## 8. Platform

**Desktop-first, tablets supported, mobile NOT supported.** Minimum viewport
1280×800; touch pan/zoom for tablets; no mobile breakpoints anywhere.
