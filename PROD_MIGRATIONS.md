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
| 10 | `game/packages/server/migrations/010_pods.sql` | Pods de recrutement (GB §12/§13, DG §11.4) : journal `pod_openings` (cap quotidien + impact de prix) | 001, 009 | DROP TABLE |
| 11 | `game/packages/server/migrations/011_docks.sql` | Docks de spaceport (GB §9/§14, DG §5.1/§8.6) : `ships.docked_at` (garde d'éviction de séjour + affichage), backfill `now()` pour les coques déjà à quai | 001 | ALTER TABLE ships DROP COLUMN docked_at |
| 12 | `game/packages/server/migrations/012_manual_offers.sql` | Canal manuel (GB §9, DG §6) : table `manual_offers` (offres épinglées au vaisseau à quai, TTL 48 h) | 001 | DROP TABLE manual_offers |
| 13 | `game/packages/server/migrations/013_retool.sql` | Retool des industries (DG §5.1) : statut de bâtiment `retooling` (contrainte CHECK élargie) | 001 | Recréer la contrainte sans `retooling` (aucun bâtiment dans cet état) |
| 14 | `game/packages/server/migrations/014_survival.sql` | Horloges de survie (GB §6, DG §3.5) : owner_id nullable (derelict), réservoir de survie paresseux, politique flee_armed | 001, 008 | Re-NOT NULL owner_id (après réattribution des épaves), DROP des 3 colonnes |
| 15 | `game/packages/server/migrations/015_harvest.sql` | Récolte stellaire (GB §22, DG §8.8) : rig + lien harvesting_star_id sur ships, ledger paresseux du stock d'étoile + stock initial caché sur bodies | 001 | DROP des 2 colonnes ships et 3 colonnes bodies + index ships_harvesting |
| 16 | `game/packages/server/migrations/016_wear.sql` | Usure de coque (GB §27) : HP paresseux + 3 boucliers sur ships | 001 | DROP des 6 colonnes |
| 17 | `game/packages/server/migrations/017_junk.sql` | Champs de junk (GB §22, DG §10.4) : table junk_fields + collecteur/quota/scoop sur ships | 001 | DROP TABLE junk_fields + DROP des 4 colonnes ships |
| 18 | `game/packages/server/migrations/018_claim.sql` | Claim rig (GB §6, DG §8.8) : rig + lien de réclamation sur ships | 001 | DROP des 2 colonnes |
| 19 | `game/packages/server/migrations/019_stargates.sql` | Stargates v1 (GB §6, DG §9.3) : table stargates | 001 | DROP TABLE stargates |
| 20 | `game/packages/server/migrations/020_stargate_proposals.sql` | Consentement 50/50 des stargates (GB §6) : table stargate_proposals | 019 | DROP TABLE stargate_proposals |
| 21 | `game/packages/server/migrations/021_auto_trade.sql` | Auto-trade du survol (GB §7) : règles jsonb sur ships | 001 | DROP de la colonne |
| 22 | `game/packages/server/migrations/022_pop_v2.sql` | Population v2 chunk BA (DG §3.2-v2) : pyramide (`pop_children`/`pop_seniors`, backfill 18,2/27,3 %), `clock_deadlines`, `demo_counters` | 001 | DROP des colonnes |
| 23 | `game/packages/server/migrations/023_pop_v2_unemployment.sql` | Population v2 chunk BB : `unemp_over_days` (grâce de chômage §3.2-v2 g) | 022 | DROP de la colonne |

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
