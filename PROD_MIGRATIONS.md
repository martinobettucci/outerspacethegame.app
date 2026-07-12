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

## Tâches de vérification post-déploiement

1. `GET /health` → 200 `{status:"ok"}` ; `GET /ready` → 200 `{db:"ok"}`.
2. `SELECT count(*) FROM schema_migrations` = nombre de fichiers de
   migrations du code déployé.
3. Le worker journalise ses ticks et la table `events` ne laisse pas
   d'événements échus non traités au-delà d'un tick.

## Risques connus

- `UNIVERSE_SEED` de production doit être unique et secret avant le premier
  lancement : il détermine tous les rolls de génération.
