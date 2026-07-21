-- @spec All declarations and algorithms in this file implement: docs/SCHEMA.md §003_pings_channels; docs/BACKLOG.md §P4 “Ping/ping-back”; GAME_BOOK.md §5; DESIGN_GUIDE.md §15.
-- 003_pings_channels — le protocole de la Silence (GB §5, GAME_BIBLE §1) :
-- un ping doit recevoir un ping-back pour ouvrir un canal ; jamais de
-- contact unilatéral. Retour arrière : DROP des trois tables.

CREATE TABLE pings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_player uuid NOT NULL REFERENCES players(id),
  to_player uuid NOT NULL REFERENCES players(id),
  -- Le monde visé par le hail (contexte du contact).
  body_id uuid NOT NULL REFERENCES bodies(id),
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','answered','ignored')),
  created_at timestamptz NOT NULL DEFAULT now(),
  answered_at timestamptz
);
CREATE INDEX pings_to ON pings(to_player) WHERE status = 'sent';
CREATE INDEX pings_from_day ON pings(from_player, created_at);

-- Canal entre deux joueurs (paire ordonnée canonique a < b).
CREATE TABLE channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_a uuid NOT NULL REFERENCES players(id),
  player_b uuid NOT NULL REFERENCES players(id),
  opened_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT channel_pair_order CHECK (player_a < player_b),
  CONSTRAINT channel_pair_unique UNIQUE (player_a, player_b)
);

CREATE TABLE messages (
  id bigserial PRIMARY KEY,
  channel_id uuid NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  author uuid NOT NULL REFERENCES players(id),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX messages_channel ON messages(channel_id, id);
