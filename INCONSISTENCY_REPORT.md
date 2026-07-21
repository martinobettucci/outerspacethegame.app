# INCONSISTENCY REPORT

Audit date: 2026-07-21  
Audit started from commit `62e9c61`. The branch advanced concurrently through
W8a (`e594787`) and W8b (`f38b188`); the final traceability sweep includes every
code file present in the W8b worktree.

This report records inconsistencies found while retrospectively linking code to
specifications. In accordance with the owner's instruction, none of the
underlying behavior or documents listed below has been corrected as part of
this audit.

## IR-001 — Design Guide version declarations disagree

- **Evidence A:** `DESIGN_GUIDE.md` opens with **Version v0.10**, Round 9.
- **Evidence B:** `BALANCE_LOG.md` §Round 10 says the Round 10 patches were
  applied to `DESIGN_GUIDE.md` §2.2b as **v0.11**.
- **Evidence C:** `docs/BACKLOG.md` introductory traceability rule and P0.1 still
  identify the Design Guide as **v0.9.2**.
- **Impact:** code comments can cite stable section numbers, but cannot name one
  unambiguous current document version.
- **Status:** unresolved; documentation left unchanged.

## IR-002 — Canon still calls climate protection an accessory

- **Evidence A:** `GAME_BOOK.md` §14 lists shields among special accessories.
- **Evidence B:** `GAME_BOOK.md` §27 closes the climate/shield question with a
  “matching shield accessory”.
- **Evidence C:** `DESIGN_GUIDE.md` §8.8 says W5's morphic hull explicitly
  supersedes the workshop accessory and requires one active, time-only hull
  chemistry rather than a fitted item.
- **Evidence D:** `docs/MASTER_PLAN.md` §W5 marks the morphic-hull behavior
  delivered.
- **Impact:** the highest-precedence rules document describes a different item
  model from the delivered W5 model and its numerical specification.
- **Status:** unresolved; canon and implementation left unchanged.

## IR-003 — Probe level count is contradictory inside the active backlog

- **Evidence A:** `docs/BACKLOG.md` §P3 “Sondes L3 & multi-carburant” and
  `docs/MASTER_PLAN.md` §W3 describe and mark delivered an L3 tanker probe.
- **Evidence B:** the adjacent `docs/BACKLOG.md` §P3 “Sondes v3 : le carburant”
  text still says “2 niveaux” / “DEUX niveaux” and enumerates only L1 and L2.
- **Evidence C:** `DESIGN_GUIDE.md` §8.1-v3 says “Three levels” and enumerates
  L1, L2, and L3.
- **Impact:** the backlog gives mutually exclusive acceptance boundaries for
  probe construction and pad-level gating.
- **Status:** unresolved; backlog and implementation left unchanged.

## IR-004 — Authoritative schema documentation stops at migration 025

- **Evidence A:** `docs/SCHEMA.md` documents migrations 001 through 025 and then
  proceeds directly to its rollback section.
- **Evidence B:** the repository contains migrations 026–033 for probe levels,
  probe fuel order, engine types, L3 transfer, star fields/morphing, gear items,
  work orders, and the Crusader W8a schema.
- **Evidence C:** `PROD_MIGRATIONS.md` already lists migrations 026–033, and
  `docs/MASTER_PLAN.md` §W1–§W8 describes their functional contracts.
- **Impact:** `docs/SCHEMA.md` is no longer a complete description of the
  authoritative PostgreSQL schema, despite CLAUDE.md §24 requiring schema
  documentation alongside migrations.
- **Status:** unresolved; schema document and migrations left unchanged.

## IR-005 — DAT delivery snapshot predates most delivered systems

- **Evidence A:** `docs/DAT.md` §6 labels its current state 2026-07-12 and says
  “Delivered so far (chunks A–L)”.
- **Evidence B:** `docs/BACKLOG.md`, `CHANGELOG.md`, and
  `docs/MASTER_PLAN.md` record later delivered chunks through W7, including
  population v2, probes v3, typed engines, morphic hulls, gear, and work orders.
- **Impact:** the architecture dossier's current-state inventory materially
  understates the implemented system and its database/API surface.
- **Status:** unresolved; DAT left unchanged.

## IR-006 — DAT says implemented seed and authentication work are pending

- **Evidence A:** `docs/DAT.md` §9 says the reproducible starter seed is “To be
  built in P1”. The same document's §6 and `docs/BACKLOG.md` §P1 describe the
  seed and real registration-based demo accounts as delivered.
- **Evidence B:** `docs/DAT.md` §11 says the account authentication scheme is to
  be finalized in the auth chunk. `docs/DAT.md` §5 already specifies the
  implemented e-mail/password, scrypt, opaque-token, server-session design, and
  `docs/BACKLOG.md` §P1 marks that portion implemented and tested.
- **Impact:** readers receive conflicting guidance about whether two foundational
  contracts exist and may incorrectly design duplicate replacements.
- **Status:** unresolved; DAT left unchanged.

## IR-007 — Legacy public-site content is acknowledged as conflicting canon

- **Evidence:** `docs/BACKLOG.md` §P0.2 explicitly states that the legacy Jekyll
  whitepaper and economics pages contradict the 2026 canon and leaves their
  reconciliation unchecked.
- **Impact:** public-facing legacy material may describe rules or economics that
  differ from `GAME_BOOK.md` and `DESIGN_GUIDE.md`.
- **Status:** known and already backlog-tracked; legacy content left unchanged.

## IR-008 — Theme-audio build scripts have no dedicated product specification

- **Evidence A:** `assets/tunes/build-theme.mp3.sh` and
  `assets/tunes/build-theme.ogg.sh` mix seven source stems into the shipped
  theme formats.
- **Evidence B:** no audio/music contract, acceptance criteria, or named audio
  backlog unit exists in `GAME_BOOK.md`, `DESIGN_GUIDE.md`,
  `docs/ASSET_PIPELINE.md`, or `docs/BACKLOG.md`.
- **Impact:** the scripts can only be linked to the broad P0.3 art-direction
  unit; their inputs, mix policy, codecs, quality targets, and regeneration
  contract are not specified.
- **Status:** unresolved; scripts left unchanged.

## IR-009 — Full-suite verification is not isolated consistently

- **Evidence A:** the out-of-sandbox run of `pnpm test:integration` on the
  audited head completed 43 files successfully but reported 9 failures in
  `docks.test.ts`; after the first two dock cases, its shared fixture bodies
  disappeared and later assertions consequently observed null coordinates or
  unknown planets/ships.
- **Evidence B:** an immediate isolated run of the same file,
  `vitest run test/integration/docks.test.ts --no-file-parallelism`, passed all
  12 tests.
- **Evidence C:** the full Playwright run lost its API process after starting;
  two tests failed with the Vite proxy receiving `ECONNREFUSED` on port 8081,
  one test was interrupted, one passed, and the remaining 41 did not run.
- **Evidence D:** `CHANGELOG.md` and `docs/MASTER_PLAN.md` record the recent
  suites as green, while `docs/MASTER_PLAN.md` §R5 identifies only the census
  pair as a known cross-suite flake.
- **Impact:** isolated test success does not currently prove that the complete
  integration/E2E run is repeatable, so documented green counts cannot be
  reproduced reliably from the audited head.
- **Status:** unresolved; no test, fixture, server, or application behavior was
  changed during this traceability-only audit.

## IR-010 — W8 implementation claims a GAME_BOOK amendment that is absent

- **Evidence A:** migration `033_crusader.sql` and
  `server/test/integration/crusader.test.ts` describe `GAME_BOOK.md` as amended
  on 2026-07-21 for the Crusader's never-land rule.
- **Evidence B:** the W8a commit `e594787` changed `CHANGELOG.md`, `JOURNAL.md`,
  `PROD_MIGRATIONS.md`, and `docs/MASTER_PLAN.md`, but did not change
  `GAME_BOOK.md` or `DESIGN_GUIDE.md`.
- **Evidence C:** the subsequent W8b commit `f38b188` added the live onboard
  population simulation and changed `docs/MASTER_PLAN.md`, but again did not
  amend `GAME_BOOK.md`; the master plan itself now says “GB à amender”.
- **Evidence D:** `GAME_BOOK.md` §14 only identifies “star crusader” as a Combat
  role/loadout; it does not specify the W8 fixed infrastructure, onboard
  population, never-land rule, 25% migration, or follower-fleet behavior.
- **Impact:** implementation and tests cite a canonical amendment that cannot be
  found in the highest-precedence rules document.
- **Status:** unresolved; W8a/W8b code, tests, and canon left unchanged.
