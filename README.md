# ATG — Across The Galaxies (« Outerspace, The gamE »)

A space exploration, colony-management and inter-player commerce game by
**P2Enjoy Studio**. Single persistent universe, no in-game currency, real game
first (#P2Enjoy — not a "gamified Ponzi").

> **Project status: PREPRODUCTION.** This repository currently holds the
> historical Jekyll marketing site and the complete game-design corpus. There
> is **no game application code yet** — the current deliverable is the design
> foundation.

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

- **Current (site):** Jekyll (Ruby), deployed historically on `gh-pages`.
- **Target (game — designed, not yet built):** PostgreSQL-authoritative server
  + tick worker; web client with three.js star field (2D navigation, 3D style)
  and an isometric 2D planet renderer; opt-in NFT bridge (Polygon PoS, existing
  Foundry contracts in the sibling `.blockchain` repo); Stripe for fiat planet
  purchases. See `docs/DAT.md`.

## Prerequisites (site only)

- Ruby ≥ 3.0, Bundler.

## Install & run (site)

```bash
bundle install
bundle exec jekyll serve      # http://127.0.0.1:4000
```

## Build (site)

```bash
bundle exec jekyll build      # outputs to _site/
```

## Tests

No automated tests exist yet (preproduction; no application code). The test
strategy for the game is defined in `CLAUDE.md` §15 and per-task in
`docs/BACKLOG.md`.

## Environment variables

| Variable | Role | Required | Notes |
|---|---|---|---|
| `OPENAI_API_KEY` | Image generation for UI prototypes (preproduction only) | Optional | Never committed; absent in the current environment |

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
├── _config.yml, _layouts, _includes, _posts, _economics, _mechanics
├── assets/              # legacy art: icons (ships, planets, factions), palette
└── engine/              # legacy jekyll-hyperstack plugin (not a game engine)
```

## Known limitations

- No game code, no schema, no tests yet — by design (preproduction).
- The Jekyll site content (whitepaper, economics pages) predates the 2026
  redesign and partially contradicts the current canon; it will be reconciled
  when the site is refreshed (see backlog P0).
- UI prototypes are blocked until `OPENAI_API_KEY` is available in the
  environment.
