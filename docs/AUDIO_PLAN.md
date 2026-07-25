# AUDIO PLAN — music, ambience & selection SFX (player-facing sound)

> Owner request (session, 2026-07-24): the game must have a **generated audio
> layer** — per-screen background music at *background volume*, **looping
> industrial ambience that depends on the buildings on the ground**, and a
> **StarCraft-style selection sound when a specific unit is selected**. Space
> game: industrial sound effects, atmospheric BGM.
>
> This document is the single spec for that layer. It resolves
> `INCONSISTENCY_REPORT.md` §IR-008 (theme-audio build scripts had no product
> spec) by defining the contract, the generation source, the mix policy, and
> the acceptance criteria. Backlog unit: `docs/BACKLOG.md` §A (Audio system).

## 0. Scope (enumerable sets — delivered exhaustively, CLAUDE.md completeness rule)

Three audio families, every member of each set covered:

| Family | Members | Loop? | Bus | Trigger |
| --- | --- | --- | --- | --- |
| **BGM** | 3 contexts: `menu`, `galaxy`, `planet` | yes | `music` | active screen |
| **Building ambience** | **29** — one per `BuildingKey` | yes | `ambience` | building present on the planet ground |
| **Selection stinger** | **15** — 6 `UnitKey` + 9 hull keys | no (one-shot) | `sfx` | unit / ship / hull selected |

- **BuildingKey (29):** telescope, probe_pad, depot, warehouse, mine, farm,
  waterworks, smelter, crystal_extractor, refinery, fuelcell_plant, spaceport,
  workshop, market, residential, lab, clinic, obs_station, shipyard,
  military_district, weapon_foundry, research_center, diplomatic_district,
  casino, commerce_district, faction_hq, stargate_yard, terraformer,
  artificial_planet_yard.
- **UnitKey (6):** turret_light, turret_heavy, cannon, tank_ground,
  tank_antiair, tank_combined.
- **Hull keys (9):** combat_s, combat_m, combat_l, cargo_s, cargo_m, cargo_l,
  civil_s, civil_m, civil_l.

Owner decision (2026-07-24): building ambience is **one unique loop per
building** (not family beds); selection is **one stinger per unit type**.

**Wiring status of the 15 selection stingers (explicit, not silent —
completeness rule).** All 15 are generated and mapped in `@atg/shared`. The
**9 ship hulls** are wired now (GalaxyMap fires the stinger on ship selection).
The **6 ground units** (turret_light/heavy, cannon, tank_ground/antiair/
combined) exist in the client only as tech-tree cards — there is **no
battlefield unit-selection surface yet**. Their stingers are shipped and
mapped, and will fire the moment a ground-unit selection UI lands (one line:
`audio.playSelection(unitKey)`); no clip is missing, only its future trigger.

**Screen → BGM context** mapping (owner's three contexts are the only distinct
beds; `comms` and `market` are UI sub-screens that **reuse the `galaxy` bed** —
documented reuse, not a silent gap):

| View (`state.tsx`) | BGM context |
| --- | --- |
| Login (no session) | `menu` |
| `galaxy` | `galaxy` |
| `planet` | `planet` |
| `comms` | `galaxy` (reuse) |
| `market` | `galaxy` (reuse) |

## 1. Single source of truth (anti-drift)

The **mapping** (which clip belongs to which building / unit / context) and the
**default bus volumes** live in `@atg/shared` → `src/audio.ts`, never hardcoded
in the client:

- `AUDIO_BGM: Record<BgmContext, string>` — clip id per context.
- `AUDIO_AMBIENCE: Record<BuildingKey, string>` — clip id per building.
- `AUDIO_SELECTION: Record<SelectableKey, string>` — clip id per unit/hull.
- `AUDIO_BUS_DEFAULTS` — `{ master, music, ambience, sfx }`.
- `ALL_BGM_CONTEXTS`, `ALL_SELECTABLE_KEYS` completeness arrays for tests.

A unit test proves every `BuildingKey`, every `UnitKey`, and every hull key has
a manifest entry, and that every manifest id resolves to shipped files — so a
new building or hull cannot be added without its audio (or an explicit,
reviewed gap). The Codex renders volumes/contexts **live** from this module.

## 2. Generation (fal, owner's account)

- **Source:** fal.ai `fal-ai/stable-audio` (text→audio), key `FAL_KEY` from the
  repo-root `.env` (never committed — same secret discipline as `OPENAI_KEY`
  for images, CLAUDE.md §3). Verified reachable 2026-07-24: 8 s stereo WAV
  @44.1 kHz, `seconds_total` controls length.
- **Script:** `game/scripts/genAudio.mjs` — a manifest of all 47 prompts,
  submits to the fal queue, polls, downloads WAV, post-processes with ffmpeg,
  writes the shipped `.ogg`/`.mp3` and discards the WAV. Idempotent (`--only <id>`,
  `--force`), same shape as `genSoil.mjs` / `genUiTextures.mjs`.
- **Prompt flavor:** industrial, diegetic, space-station/foundry textures for
  ambience; short mechanical/UI confirms for selection; atmospheric,
  low-energy, loop-friendly pads for BGM. Prompts are generation-time and live
  in the script; the id↔target mapping lives in shared (§1).
- **Target durations:** BGM ≈ 40 s · ambience ≈ 10 s · selection ≈ 1.2 s.

## 3. Post-processing & file contract

Per clip, ffmpeg:

1. **Loudness-normalize** (`loudnorm`) so families sit at consistent level.
2. **Seamless loop** (loops only): equal-power head/tail crossfade (`afade` +
   `acrossfade`) so the join is inaudible; verified with `ffprobe` duration.
3. **Encode dual codec** to match the existing `theme.ogg`/`theme.mp3`
   convention: **`.ogg` (Vorbis) primary + `.mp3` fallback** — broad browser
   coverage. The engine picks the first playable source.

Layout:

```
game/packages/client/public/audio/
  bgm/{menu,galaxy,planet}.{ogg,mp3}
  ambience/{buildingKey}.{ogg,mp3}          # 29
  select/{selectableKey}.{ogg,mp3}          # 15
```

**Only the compressed `.ogg`/`.mp3` the game actually loads are kept and tracked**
(≈10 MB). Raw WAVs are **not** archived (owner decision 2026-07-24): the fal
generation is the regeneration source — re-run `genAudio.mjs` to rebuild any
clip. The transient `game/scripts/.audio-tmp/` scratch is gitignored.

## 4. Mix model (buses & background volume)

Web Audio graph: `source → voiceGain → busGain → masterGain → destination`.

- **Four buses:** `master`, `music`, `ambience`, `sfx`.
- **Background volume:** `music` bus defaults to **0.35** (low, under gameplay);
  `ambience` 0.50; `sfx` 0.70; `master` 1.0. These are the "background volume"
  the owner asked for — BGM never competes with SFX.
- **Ambience summing:** on the planet, each **distinct building type present**
  contributes one looping voice; per-voice gain is normalized
  `1 / max(1, sqrt(distinctCount))` to prevent clipping when many types coexist.
  All distinct present types are mixed (no silent drop); a documented
  performance cap (8 concurrent voices, priority = rarest/most-recent) applies
  only as a safety and is logged if it ever engages.
- **Selection stinger:** one-shot on `sfx`; a new selection **interrupts** the
  previous stinger (StarCraft feel).
- **Context switch:** changing screen cross-fades the `music` bus between beds
  (200–400 ms) instead of hard-cutting.

## 5. Autoplay, mute & persistence

- **Autoplay policy:** browsers block audio before a user gesture. The
  `AudioContext` starts *suspended*; the first pointer/key interaction resumes
  it and starts the current context's BGM. No sound is forced before a gesture.
- **Controls (UI):** a compact control in the `GameShell` ribbon — Lucide
  `Volume2` / `VolumeX` mute toggle + per-bus sliders (master/music/ambience/
  sfx). Keyboard-accessible, focus-visible, labelled (§22).
- **Persistence (CLAUDE.md §11):** volumes + mute are an **explicit user
  setting** (dragging a slider / clicking mute = explicit action, category 3),
  persisted in `localStorage` under `atg.audio`. No consent modal is required
  because nothing is stored until the user acts; defaults apply otherwise.
  Refusing/ignoring the control never blocks any feature (audio simply plays at
  defaults or muted). No tracker, no cross-site id.

## 6. Definition of Done (this unit)

- [ ] `@atg/shared/audio.ts` manifest complete: 3 BGM, 29 ambience, 15
      selection; default buses; completeness arrays. Unit test proves total
      coverage of `BuildingKey` + units + hulls.
- [ ] `genAudio.mjs` generates all 47 clips via fal; ffprobe confirms codec,
      channels, and target durations; loops verified seamless.
- [ ] `AudioManager` (Web Audio) implements buses, autoplay-gesture gate,
      cross-fade, ambience summing, one-shot selection; unit-tested with a
      mocked Web Audio context.
- [ ] Wiring: BGM follows the active view; PlanetView drives ambience from the
      buildings on the ground; unit/ship/hull selection fires the stinger.
- [ ] `AudioControls` UI: mute + per-bus sliders, keyboard-accessible,
      persisted to `localStorage`.
- [ ] Tests: shared completeness (unit), AudioManager (unit), E2E for controls
      + mute + a deterministic `window.__atgAudio` event proving ambience/
      selection fired.
- [ ] Codex: an "Audio" section explaining the on-screen controls (spoiler-free,
      live numbers from shared).
- [ ] Docs kept in sync: this file, DESIGN_SYSTEM §Audio, DAT, ASSET_PIPELINE
      §Audio, CHANGELOG, JOURNAL; IR-008 marked resolved.

## 7. Non-goals (first slice)

- No positional/3D audio, no per-building volume-by-level curve (ambience is
  per-type presence, not per-level), no combat/impact SFX layer, no voice
  lines. These are future backlog units; the mix model leaves room for them.
