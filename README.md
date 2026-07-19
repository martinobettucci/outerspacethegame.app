# ATG — Across The Galaxies (« Outerspace, The gamE »)

A space exploration, colony-management and inter-player commerce game by
**P2Enjoy Studio**. Single persistent universe, no in-game currency, real game
first (#P2Enjoy — not a "gamified Ponzi").

> **Project status: IMPLEMENTATION (P1) since 2026-07-12** on explicit owner
> go. This repository holds the historical Jekyll marketing site, the complete
> game-design corpus, and the game application under construction in `game/`
> (pnpm monorepo: shared / server / client / e2e).

## Purpose

- Preserve and evolve the **design canon** of the game.
- Host the public marketing/whitepaper site (legacy Jekyll).
- Serve as the working repository for preproduction (design system, backlog,
  architecture dossier) until implementation begins.

## Design corpus (read in this order)

| Document | Role |
|---|---|
| `GAMEBOOK.md` | **Rule canon** — every settled design decision; wins on conflict |
| `GAME_BIBLE.md` | Lore & world (the Silence, the three peoples, places, tone) |
| `DESIGN_GUIDE.md` | Complete mechanical spec with formulae — all invented values tagged `[TUNE]` |
| `BALANCE_LOG.md` | Simulated-campaign balancing loop: findings & applied patches |
| `JOURNAL.md` | Chronological decision log (equivalent of `docs/JOURNAL.md`) |
| `docs/BACKLOG.md` | Full project backlog with verification statuses |
| `docs/DAT.md` | Technical architecture dossier (target architecture) |
| `docs/DESIGN_SYSTEM.md` | UI design system (dark "groovy" direction, P2Enjoy palette) |
| `CLAUDE.md` | Working conventions (in French) + project specifics |

## Stack

- **Site:** Jekyll (Ruby), deployed historically on `gh-pages`.
- **Game (in construction, `game/`):** PostgreSQL 16 (authoritative, in
  Docker) · TypeScript/Node 22 — Fastify API + tick worker · React + Vite
  client (three.js star field; PixiJS v8 isometric planet renderer) ·
  Playwright E2E. Opt-in NFT bridge (Polygon PoS, contracts in the sibling
  `.blockchain` repo) and Stripe fiat purchases come in later phases. See
  `docs/DAT.md`.

## Prerequisites

- Site: Ruby ≥ 3.0, Bundler.
- Game: Node ≥ 22, pnpm ≥ 10, Docker + Compose.

## Install & run — site

```bash
bundle install
bundle exec jekyll serve      # http://127.0.0.1:4000
bundle exec jekyll build      # outputs to _site/
```

## Install & run — game (from `game/`)

Prerequisites: **Node.js ≥ 22** (verified on 22 and 24), **pnpm ≥ 10**,
**Docker** (dev database container). Everything runs locally.

```bash
pnpm install
pnpm runDev        # builds @atg/shared, then DB container + migrations +
                   # seed + API + worker + client
                   # client: http://localhost:5173 — API: http://localhost:8080
pnpm resetDb       # recreate + migrate + seed the dev database
pnpm stopDev       # stop the dev database container
```

Running individual services by hand (`pnpm --filter @atg/server dev:api`,
`seed`, …) requires `pnpm --filter @atg/shared build` once after cloning:
the workspace package exports its compiled `dist/` — `runDev`/`resetDb`
do it for you.

Environment variables are documented in `game/.env.example` (copy to
`game/.env` to customize; no real secret ever enters the repository).

### Demo accounts (dev seed — never valid outside local dev)

| Email | Password | Politics | Purpose |
|---|---|---|---|
| `demo@atg.local` | `demo-password-1` | industrialist | main demo Sovereign |
| `neighbor@atg.local` | `demo-password-2` | mercantile | guaranteed 150–240 pc neighbor; publishes an innate hospitality offer (water @ 2 ore/T, floor 10 T) |

The seed goes through the real registration flow (`registerPlayer` →
starter spawn), is idempotent, and is recreated by `pnpm resetDb`.

## Tests (game, from `game/`)

```bash
pnpm test               # unit tests (all packages)
pnpm test:integration   # server integration tests (real local DB required)
pnpm test:e2e           # Playwright E2E (starts API + client; DB must be up)
pnpm build              # build all packages
```

The comms E2E ("the Silence breaks") drives the seeded demo pair; the ping
quota is 20/day per player, so after ~20 same-day reruns run `pnpm resetDb`.

## Asset generation (climate soils)

`node game/scripts/genSoil.mjs` (from the repo root) regenerates the
per-climate soil textures through OpenAI Images (`gpt-image-2`, falls
back to `gpt-image-1`). Requires `OPENAI_KEY` in the root `.env` (never
committed) and `ffmpeg` (webp 768² conversion). Outputs:
`game/packages/client/public/generated/soil-<climate>.webp` (served
asset) and `docs/design/prototypes/soil-<climate>.png` (full-size
archive). Missing textures are harmless — the planet view falls back to
the procedural slab.

`node game/scripts/genUiTextures.mjs` regenerates the four UI chrome
backgrounds (`ui-panel`, `ui-card`, `ui-shell`, `ui-veil`) with the same
pipeline and requirements.

## Environment variables

| Variable | Role | Required | Notes |
|---|---|---|---|
| `OPEN_AI_KEY` | OpenAI Images key for UI prototypes (preproduction only) | Optional | Never committed; provided by the cloud-worker environment |
| `ATG_TEST_ENDPOINTS` | Enables E2E-only test instrumentation (`/test/grant`) | Never in production | Set to `1` by the Playwright config only |

Game-runtime variables (database, Stripe, chain relayer) will be documented in
`docs/DAT.md` when implementation starts.

## Repository structure

```
├── CLAUDE.md            # working conventions + project specifics
├── README.md / CHANGELOG.md
├── GAMEBOOK.md          # rule canon
├── GAME_BIBLE.md        # lore
├── DESIGN_GUIDE.md      # mechanics & formulae
├── BALANCE_LOG.md       # balancing loop record
├── JOURNAL.md           # decision journal (docs/JOURNAL.md equivalent)
├── docs/
│   ├── DAT.md           # architecture dossier
│   ├── BACKLOG.md       # full backlog
│   ├── DESIGN_SYSTEM.md # UI design system
│   └── design/prototypes/  # generated UI prototypes (art direction)
├── game/                # THE GAME (pnpm monorepo, P1 in progress)
│   ├── packages/shared/     # shared types, constants, design data
│   ├── packages/server/     # Fastify API + tick worker + SQL migrations
│   ├── packages/client/     # React + Vite (three.js galaxy, Pixi planet)
│   ├── packages/e2e/        # Playwright E2E + visual captures
│   └── docker-compose.dev.yml, scripts/, .env.example
├── _config.yml, _layouts, _includes, _posts, _economics, _mechanics
├── assets/              # legacy art + assets/game/ sprite stubs (swap contract)
└── engine/              # legacy jekyll-hyperstack plugin (not a game engine)
```

## Known limitations

- The game is under active construction; `docs/BACKLOG.md` is the source of
  truth for what is done (`[x]`), in progress (`[~]`) and not started (`[ ]`).
- The Jekyll site content (whitepaper, economics pages) predates the 2026
  redesign and partially contradicts the current canon; it will be reconciled
  when the site is refreshed (see backlog P0).
- Staging/production Compose files and deployment do not exist yet; they
  arrive with the first deployment (DAT §6, PROD contract per CLAUDE.md §12).
