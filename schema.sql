-- TTC Klánovice – Supabase schema
-- Run in: https://supabase.com/dashboard/project/iyfciumheechxkfrsrii/sql/new

-- ── Players ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS players (
  id       SERIAL PRIMARY KEY,
  name     TEXT NOT NULL UNIQUE,
  stis_id  INTEGER UNIQUE,
  born     TEXT
);

-- ── Teams ────────────────────────────────────────────────────────────────────
-- One row per team per season (druzstvo_id + rocnik uniquely identifies a team)
CREATE TABLE IF NOT EXISTS teams (
  id          INTEGER NOT NULL,   -- STIS druzstvo ID (63401 …)
  rocnik      INTEGER NOT NULL,   -- 2025 = season 2025/26
  name        TEXT    NOT NULL,   -- "TTC Klánovice B"
  suffix      TEXT    NOT NULL,   -- "B"
  soutez_id   TEXT,
  PRIMARY KEY (id, rocnik)
);

-- ── Player season snapshots ─────────────────────────────────────────────────
-- Updated on every scrape; UNIQUE prevents duplicates per player+team+season
CREATE TABLE IF NOT EXISTS player_seasons (
  id            SERIAL PRIMARY KEY,
  player_id     INTEGER NOT NULL REFERENCES players(id),
  team_id       INTEGER NOT NULL,
  rocnik        INTEGER NOT NULL,
  soupiska_pos  INTEGER,
  str           REAL,
  str_stab      REAL,
  str_delta     INTEGER,
  is_regular    BOOLEAN,
  scraped_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (player_id, team_id, rocnik),
  FOREIGN KEY (team_id, rocnik) REFERENCES teams(id, rocnik)
);

-- ── Matches (utkání) ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS matches (
  id           INTEGER PRIMARY KEY,  -- STIS utkani ID
  team_id      INTEGER NOT NULL,
  rocnik       INTEGER NOT NULL,
  date         DATE,
  time         TEXT,
  opponent     TEXT    NOT NULL,
  home         BOOLEAN,
  score_home   INTEGER,
  score_away   INTEGER,
  result       TEXT,                 -- 'W' / 'L' / 'D' / NULL (future)
  round        INTEGER,
  future       BOOLEAN DEFAULT FALSE,
  competition  TEXT,
  FOREIGN KEY (team_id, rocnik) REFERENCES teams(id, rocnik)
);

-- ── Individual games within a match ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS games (
  id              SERIAL PRIMARY KEY,
  match_id        INTEGER NOT NULL REFERENCES matches(id),
  rubber_num      INTEGER,          -- pořadí rubberu v utkání (1–18)
  our_player      TEXT NOT NULL,    -- "Kárník Tomáš" or "Kárník Tomáš / Brothánek Jan"
  opp_player      TEXT NOT NULL,
  our_str         INTEGER,          -- STR hráče v den utkání
  opp_str         INTEGER,
  sets_won        INTEGER,
  sets_lost       INTEGER,
  won             BOOLEAN,
  is_doubles      BOOLEAN DEFAULT FALSE,
  -- [[home_score, away_score], ...] e.g. [[11,8],[10,12],[8,11],[11,8],[11,8]]
  set_scores      JSONB
);

-- ── League table snapshots ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS league_table (
  id          SERIAL PRIMARY KEY,
  team_id     INTEGER NOT NULL,
  rocnik      INTEGER NOT NULL,
  pos         INTEGER,
  club_name   TEXT,
  z           INTEGER,
  w           INTEGER,
  d           INTEGER,
  l           INTEGER,
  sf          INTEGER,
  sa          INTEGER,
  points      INTEGER,
  is_ours     BOOLEAN,
  scraped_at  TIMESTAMPTZ DEFAULT NOW(),
  FOREIGN KEY (team_id, rocnik) REFERENCES teams(id, rocnik)
);

-- ── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_matches_team   ON matches(team_id, rocnik);
CREATE INDEX IF NOT EXISTS idx_matches_date   ON matches(date);
CREATE INDEX IF NOT EXISTS idx_games_match    ON games(match_id);
CREATE INDEX IF NOT EXISTS idx_ps_player      ON player_seasons(player_id, rocnik);
CREATE INDEX IF NOT EXISTS idx_lt_team_rocnik ON league_table(team_id, rocnik, scraped_at DESC);

-- ── Row Level Security (read-only public access) ─────────────────────────────
ALTER TABLE players        ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams          ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches        ENABLE ROW LEVEL SECURITY;
ALTER TABLE games          ENABLE ROW LEVEL SECURITY;
ALTER TABLE league_table   ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read" ON players        FOR SELECT USING (true);
CREATE POLICY "public read" ON teams          FOR SELECT USING (true);
CREATE POLICY "public read" ON player_seasons FOR SELECT USING (true);
CREATE POLICY "public read" ON matches        FOR SELECT USING (true);
CREATE POLICY "public read" ON games          FOR SELECT USING (true);
CREATE POLICY "public read" ON league_table   FOR SELECT USING (true);
