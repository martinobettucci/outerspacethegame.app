-- 001_baseline — schéma fondateur ATG (DAT §3, DESIGN_GUIDE v0.9.2).
-- Objectif : univers (corps, gisements), joueurs/sessions, planètes
-- (stock, bâtiments, unlocks), NPC, vaisseaux, file d'événements.
-- Toutes les quantités continues suivent le modèle lazy (value, rate, t0) :
-- colonnes (amount, rate_per_day, as_of), matérialisées aux événements.
-- Retour arrière : DROP des tables dans l'ordre inverse (aucune donnée
-- partagée n'existe encore — développement uniquement).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  display_name text NOT NULL,
  politics text NOT NULL CHECK (politics IN
    ('militarist','industrialist','mercantile','scientific','civic','diplomatic')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
  token_hash text PRIMARY KEY,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX sessions_player ON sessions(player_id);

CREATE TABLE bodies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  body_type text NOT NULL CHECK (body_type IN ('planet','star','black_hole')),
  name text NOT NULL,
  x double precision NOT NULL,
  y double precision NOT NULL,
  seed text NOT NULL UNIQUE,
  -- Attributs planète (NULL pour étoiles/trous noirs)
  size text CHECK (size IN ('s','m','l')),
  climate text CHECK (climate IN ('hot','cold','temperate','poison')),
  quality text CHECK (quality IN ('A','B','C','D','E','F')),
  tiles integer,
  owner_id uuid REFERENCES players(id),
  is_starter boolean NOT NULL DEFAULT false,
  account_bound_until timestamptz,
  colonized_at timestamptz,
  -- Population : matérialisation quotidienne (événement pop_daily)
  population double precision,
  illness double precision NOT NULL DEFAULT 0,
  pop_as_of timestamptz,
  -- Attributs étoile ; star_fuel_stock est CACHÉ (jamais exposé par l'API —
  -- canon GB §22 : aucune jauge, seul le flare < 5 % est public)
  star_class text CHECK (star_class IN ('s','m','l')),
  star_fuel_type text CHECK (star_fuel_type IN ('cold','hot','gas')),
  star_fuel_stock double precision,
  r_nova double precision,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX bodies_owner ON bodies(owner_id) WHERE owner_id IS NOT NULL;
-- Index spatial par maille de 64 pc (DG §9.2)
CREATE INDEX bodies_grid ON bodies (floor(x / 64), floor(y / 64));

CREATE TABLE deposits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  body_id uuid NOT NULL REFERENCES bodies(id) ON DELETE CASCADE,
  resource text NOT NULL,
  initial_t double precision NOT NULL,
  amount_t double precision NOT NULL,
  rate_t_per_day double precision NOT NULL DEFAULT 0,
  as_of timestamptz NOT NULL DEFAULT now(),
  UNIQUE (body_id, resource)
);

CREATE TABLE planet_stock (
  body_id uuid NOT NULL REFERENCES bodies(id) ON DELETE CASCADE,
  resource text NOT NULL,
  amount_t double precision NOT NULL DEFAULT 0,
  rate_t_per_day double precision NOT NULL DEFAULT 0,
  as_of timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (body_id, resource)
);

CREATE TABLE buildings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  body_id uuid NOT NULL REFERENCES bodies(id) ON DELETE CASCADE,
  key text NOT NULL,
  level integer NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 3),
  tile_index integer,
  status text NOT NULL DEFAULT 'constructing'
    CHECK (status IN ('constructing','active','demolishing')),
  completes_at timestamptz,
  recipe text,
  run_pct integer NOT NULL DEFAULT 100 CHECK (run_pct BETWEEN 0 AND 100),
  workforce integer NOT NULL DEFAULT 0 CHECK (workforce >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (body_id, tile_index)
);
CREATE INDEX buildings_body ON buildings(body_id);

CREATE TABLE tech_unlocks (
  body_id uuid NOT NULL REFERENCES bodies(id) ON DELETE CASCADE,
  node_key text NOT NULL,
  unlocked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (body_id, node_key)
);

CREATE TABLE npcs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid REFERENCES players(id),
  people text NOT NULL CHECK (people IN ('human','forged','vess')),
  role text NOT NULL CHECK (role IN
    ('pilot','engineer','merchant','diplomat','soldier','scientist')),
  rarity text NOT NULL CHECK (rarity IN
    ('common','uncommon','rare','epic','legendary')),
  -- Boosts individuels roulés à l'ouverture (canon GB §12) : {stat: mult}
  stat_rolls jsonb NOT NULL DEFAULT '{}',
  bound_host_type text CHECK (bound_host_type IN ('ship','building','planet')),
  bound_host_id uuid,
  account_bound_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX npcs_owner ON npcs(owner_id);
CREATE INDEX npcs_host ON npcs(bound_host_type, bound_host_id)
  WHERE bound_host_id IS NOT NULL;

CREATE TABLE ships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES players(id),
  hull_category text NOT NULL CHECK (hull_category IN
    ('combat','cargo','civil','personal','probe')),
  hull_size text CHECK (hull_size IN ('s','m','l')),
  name text NOT NULL,
  x double precision NOT NULL,
  y double precision NOT NULL,
  status text NOT NULL DEFAULT 'docked' CHECK (status IN
    ('docked','hovering','transit','stranded','derelict','warehoused')),
  docked_body_id uuid REFERENCES bodies(id),
  -- Réservoirs par type (u) et survie (T) — lazy au niveau mission (P3)
  fuel jsonb NOT NULL DEFAULT '{}',
  survival jsonb NOT NULL DEFAULT '{}',
  cargo jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sized_hull CHECK (
    hull_category IN ('personal','probe') OR hull_size IS NOT NULL
  )
);
CREATE INDEX ships_owner ON ships(owner_id);
CREATE INDEX ships_docked ON ships(docked_body_id) WHERE docked_body_id IS NOT NULL;

-- File d'événements de la simulation (DG §1) : le worker matérialise
-- l'état aux échéances ; traitement idempotent, ordre (due_at, id).
CREATE TABLE events (
  id bigserial PRIMARY KEY,
  due_at timestamptz NOT NULL,
  kind text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);
CREATE INDEX events_due ON events (due_at, id) WHERE processed_at IS NULL;
