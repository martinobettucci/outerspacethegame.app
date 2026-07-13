# PROD_MIGRATIONS — contrat de déploiement (ATG)

> Document requis par CLAUDE.md §12. Décrit ce qu'un humain doit appliquer
> pour amener la production au niveau du code. Mis à jour dans le même
> chunk que toute modification de schéma, service ou variable.

## Baseline de production

**Le jeu n'a JAMAIS été déployé.** Il n'existe aucune base de production,
aucun service déployé, aucun secret provisionné. Le site Jekyll historique
(`gh-pages`) est indépendant et n'est pas concerné par ce document.

## Migrations en attente (ordre d'application)

| # | Fichier | Objectif | Dépendances | Retour arrière |
|---|---|---|---|---|
| 1 | `game/packages/server/migrations/001_baseline.sql` | Schéma fondateur : joueurs/sessions, corps célestes, gisements, stock, bâtiments, unlocks, NPC, vaisseaux, file d'événements | PostgreSQL ≥ 16, extension `pgcrypto` | DROP des tables (aucune donnée réelle n'existe) |
| 2 | `game/packages/server/migrations/002_ship_missions.sql` | Missions de vol (segments, statut `idle`, colonnes mission, index transit) — omission du chunk H corrigée ici | 001 | DROP des colonnes/index ajoutés |
| 3 | `game/packages/server/migrations/003_pings_channels.sql` | Protocole de contact (GB §5) : `pings`, `channels` (paire canonique unique), `messages` | 001 | DROP des trois tables |
| 4 | `game/packages/server/migrations/004_landing_cargo.sql` | Atterrissage & fret (GB §9, DG §7) : `ships.hover_body_id`, `buildings.config` (politique d'atterrissage) | 001, 002 | DROP des deux colonnes |
| 5 | `game/packages/server/migrations/005_market_trades.sql` | Marché L1 taux fixe (GB §9/§13) : journal `trades` (limites quotidienne/absolue des slots) | 001, 004 | DROP de la table |
| 6 | `game/packages/server/migrations/006_innate_trading.sql` | Hospitalité du monde marchand (GB §9) : `bodies.config` (offres innées), `trades.market_building_id` nullable | 001, 005 | DROP colonne + restauration NOT NULL |
| 7 | `game/packages/server/migrations/007_colonization.sql` | Colonisation (GB §19/§12) : `ships.settlers`/`settlers_origin_body_id`/`colony_kit`, statut `colonizing`, table `settler_routes` (péage déterministe par route) | 001, 002 | DROP colonnes/table + restauration de la contrainte de statut |
| 8 | `game/packages/server/migrations/008_hover_drain.sql` | Drains de loitering (GB §7/§13) : réservoir paresseux (`ships.fuel_rate_u_per_day`, `ships.fuel_as_of`), index `ships_hover` | 001, 004 | DROP des 2 colonnes + DROP INDEX |
| 9 | `game/packages/server/migrations/009_census.sql` | Census global (GB §13, DG §11.5) : table `census_snapshots` + amorçage du premier `census_run` | 001 | DROP TABLE + DELETE FROM events WHERE kind='census_run' |

## Services à déployer (au premier déploiement)

- API (`@atg/server`, entrée `dist/api/index.js`).
- Tick worker (`@atg/server`, entrée `dist/worker/index.js`) — au moins un
  processus ; plusieurs instances sont sûres (SKIP LOCKED).
- Client statique (`@atg/client`, `dist/`).

## Variables/secrets à provisionner (jamais dans le dépôt)

| Variable | Rôle | Obligatoire |
|---|---|---|
| `DATABASE_URL` | connexion PostgreSQL production | oui |
| `SESSION_SECRET` | signature des cookies de session (≥ 32 car., dédié) | oui |
| `UNIVERSE_SEED` | graine de l'univers de production (fixée UNE fois, ne change jamais) | oui |
| `API_PORT`, `CLIENT_ORIGIN`, `TICK_MS` | voir `game/.env.example` | non (défauts) |
| `ATG_TEST_ENDPOINTS` | **NE JAMAIS provisionner en production** — instrumentation E2E (§15) | interdit en prod |
| `CENSUS_PER_DAY` | cadence du census global (entier > 0, défaut 4 [TUNE]) | non (défaut) |

## Tâches de vérification post-déploiement

1. `GET /health` → 200 `{status:"ok"}` ; `GET /ready` → 200 `{db:"ok"}`.
2. `SELECT count(*) FROM schema_migrations` = nombre de fichiers de
   migrations du code déployé.
3. Le worker journalise ses ticks et la table `events` ne laisse pas
   d'événements échus non traités au-delà d'un tick.

## Risques connus

- `UNIVERSE_SEED` de production doit être unique et secret avant le premier
  lancement : il détermine tous les rolls de génération.
