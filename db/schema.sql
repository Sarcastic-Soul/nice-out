-- Nice Out schema. Applied to Tiger Cloud through Tiger MCP.

-- Hourly weather + air quality per map cell (lat/lon rounded to 0.05°).
CREATE TABLE IF NOT EXISTS conditions (
  cell        text        NOT NULL,
  ts          timestamptz NOT NULL,
  temp        real,
  feels       real,
  humidity    real,
  rain_prob   real,
  rain_mm     real,
  cloud       real,
  wind        real,
  uv          real,
  is_day      smallint,
  pm25        real,
  fetched_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cell, ts)
) WITH (
  tsdb.hypertable,
  tsdb.partition_column = 'ts',
  tsdb.segmentby = 'cell',
  tsdb.orderby = 'ts DESC'
);

-- One row per browser. No accounts: the id lives in the user's localStorage.
CREATE TABLE IF NOT EXISTS people (
  id          uuid        PRIMARY KEY,
  cell        text        NOT NULL,
  lat         real        NOT NULL,
  lon         real        NOT NULL,
  place_name  text        NOT NULL,
  tz          text        NOT NULL DEFAULT 'UTC',
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Training rows for TabPFN: quick-start answers and real outings.
-- liked = 1 means "nice for me", 0 means "not for me".
CREATE TABLE IF NOT EXISTS ratings (
  id          bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  person_id   uuid        NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  ts          timestamptz NOT NULL,
  source      text        NOT NULL CHECK (source IN ('quickstart', 'outing')),
  verdict     text        NOT NULL CHECK (verdict IN ('yes', 'no', 'great', 'fine', 'bad')),
  liked       smallint    NOT NULL CHECK (liked IN (0, 1)),
  features    jsonb       NOT NULL,
  predicted   real,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (person_id, ts, source)
);
CREATE INDEX IF NOT EXISTS ratings_person_idx ON ratings (person_id, created_at DESC);

-- Cached TabPFN output, so each person costs at most one prediction per hour
-- (the free API budget is 5M tokens/day, at least 10k per prediction).
CREATE TABLE IF NOT EXISTS outlooks (
  person_id   uuid        NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  hour_key    timestamptz NOT NULL,
  n_ratings   int         NOT NULL,
  hours       jsonb       NOT NULL,
  check_score jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (person_id, hour_key, n_ratings)
);
