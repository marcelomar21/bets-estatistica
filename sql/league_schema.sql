CREATE TABLE IF NOT EXISTS league_seasons (
    id BIGSERIAL PRIMARY KEY,
    league_name TEXT NOT NULL,
    country TEXT,
    display_name TEXT,
    image_url TEXT,
    season_id INTEGER NOT NULL UNIQUE,
    season_year INTEGER,
    raw_league JSONB NOT NULL,
    active BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_league_seasons_country
    ON league_seasons (country);

CREATE INDEX IF NOT EXISTS idx_league_seasons_league_name
    ON league_seasons (league_name);

CREATE TABLE IF NOT EXISTS countries (
    id BIGSERIAL PRIMARY KEY,
    source_id INTEGER NOT NULL UNIQUE,
    iso TEXT NOT NULL,
    iso_number INTEGER,
    name_en TEXT NOT NULL,
    translations JSONB,
    raw_country JSONB NOT NULL,
    active BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_countries_iso
    ON countries (iso);

CREATE INDEX IF NOT EXISTS idx_countries_name
    ON countries (name_en);

CREATE TABLE IF NOT EXISTS league_team_stats (
    id BIGSERIAL PRIMARY KEY,
    season_id INTEGER NOT NULL,
    team_id INTEGER NOT NULL,
    team_name TEXT NOT NULL,
    team_clean_name TEXT,
    team_short_name TEXT,
    country TEXT,
    table_position INTEGER,
    fetched_at TIMESTAMPTZ NOT NULL,
    raw_team JSONB NOT NULL,
    stats JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_league_team_stats_season
        FOREIGN KEY (season_id) REFERENCES league_seasons (season_id)
        ON DELETE CASCADE,
    CONSTRAINT uq_league_team UNIQUE (season_id, team_id)
);

CREATE INDEX IF NOT EXISTS idx_league_team_stats_country
    ON league_team_stats (country);

CREATE INDEX IF NOT EXISTS idx_league_team_stats_table_position
    ON league_team_stats (table_position);

CREATE TABLE IF NOT EXISTS league_matches (
    id BIGSERIAL PRIMARY KEY,
    season_id INTEGER NOT NULL,
    match_id BIGINT NOT NULL UNIQUE,
    home_team_id INTEGER,
    away_team_id INTEGER,
    home_team_name TEXT,
    away_team_name TEXT,
    home_score INTEGER,
    away_score INTEGER,
    status TEXT,
    game_week INTEGER,
    round_id INTEGER,
    date_unix BIGINT,
    kickoff_time TIMESTAMPTZ,
    venue TEXT,
    raw_match JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_league_matches_season
        FOREIGN KEY (season_id) REFERENCES league_seasons (season_id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_league_matches_season
    ON league_matches (season_id);

CREATE INDEX IF NOT EXISTS idx_league_matches_game_week
    ON league_matches (game_week);
