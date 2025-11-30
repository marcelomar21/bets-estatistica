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

CREATE TABLE IF NOT EXISTS league_players (
    id BIGSERIAL PRIMARY KEY,
    season_id INTEGER NOT NULL,
    player_id INTEGER NOT NULL,
    full_name TEXT NOT NULL,
    known_as TEXT,
    shorthand TEXT,
    age INTEGER,
    nationality TEXT,
    position TEXT,
    club_team_id INTEGER,
    minutes_played_overall INTEGER,
    appearances_overall INTEGER,
    goals_overall INTEGER,
    assists_overall INTEGER,
    cards_overall INTEGER,
    yellow_cards_overall INTEGER,
    red_cards_overall INTEGER,
    raw_player JSONB NOT NULL,
    stats JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_league_players_season
        FOREIGN KEY (season_id) REFERENCES league_seasons (season_id)
        ON DELETE CASCADE,
    CONSTRAINT uq_league_players UNIQUE (season_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_league_players_club
    ON league_players (club_team_id);

CREATE INDEX IF NOT EXISTS idx_league_players_position
    ON league_players (position);

CREATE TABLE IF NOT EXISTS stats_match_details (
    id BIGSERIAL PRIMARY KEY,
    match_id BIGINT NOT NULL UNIQUE,
    season_id INTEGER NOT NULL,
    home_team_id INTEGER,
    away_team_id INTEGER,
    home_team_name TEXT,
    away_team_name TEXT,
    home_score INTEGER,
    away_score INTEGER,
    status TEXT,
    competition_stage TEXT,
    referee TEXT,
    venue TEXT,
    attendance INTEGER,
    raw_payload JSONB NOT NULL,
    ordered_stats JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_stats_match_details_match
        FOREIGN KEY (match_id) REFERENCES league_matches (match_id)
        ON DELETE CASCADE,
    CONSTRAINT fk_stats_match_details_season
        FOREIGN KEY (season_id) REFERENCES league_seasons (season_id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_stats_match_details_season
    ON stats_match_details (season_id);

CREATE TABLE IF NOT EXISTS team_lastx_stats (
    id BIGSERIAL PRIMARY KEY,
    team_id INTEGER NOT NULL,
    team_name TEXT NOT NULL,
    country TEXT,
    season TEXT,
    competition_id INTEGER,
    window_scope TEXT,
    last_x_match_num INTEGER NOT NULL,
    last_updated_match_timestamp BIGINT,
    risk INTEGER,
    image_url TEXT,
    raw_payload JSONB NOT NULL,
    ordered_stats JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_team_lastx UNIQUE (team_id, window_scope, last_x_match_num)
);

CREATE INDEX IF NOT EXISTS idx_team_lastx_team
    ON team_lastx_stats (team_id);

CREATE OR REPLACE FUNCTION fn_sync_stats_match_details()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE stats_match_details
       SET home_score = NEW.home_score,
           away_score = NEW.away_score,
           status = NEW.status,
           updated_at = NOW()
     WHERE match_id = NEW.match_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_stats_match_details ON league_matches;

CREATE TRIGGER trg_sync_stats_match_details
AFTER UPDATE OF home_score, away_score, status
ON league_matches
FOR EACH ROW
WHEN (
    (OLD.home_score IS DISTINCT FROM NEW.home_score) OR
    (OLD.away_score IS DISTINCT FROM NEW.away_score) OR
    (OLD.status IS DISTINCT FROM NEW.status)
)
EXECUTE FUNCTION fn_sync_stats_match_details();
