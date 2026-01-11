-- Migration 001: Initial Schema for bets-estatistica
-- Run this in Supabase SQL Editor

-- =====================================================
-- TABLES WITHOUT FOREIGN KEYS (must be created first)
-- =====================================================

-- Countries
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

CREATE INDEX IF NOT EXISTS idx_countries_iso ON countries (iso);
CREATE INDEX IF NOT EXISTS idx_countries_name ON countries (name_en);

-- League Seasons
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

CREATE INDEX IF NOT EXISTS idx_league_seasons_country ON league_seasons (country);
CREATE INDEX IF NOT EXISTS idx_league_seasons_league_name ON league_seasons (league_name);

-- Team LastX Stats (no FK to league_seasons)
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

CREATE INDEX IF NOT EXISTS idx_team_lastx_team ON team_lastx_stats (team_id);

-- =====================================================
-- TABLES WITH FOREIGN KEYS TO league_seasons
-- =====================================================

-- League Team Stats
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

CREATE INDEX IF NOT EXISTS idx_league_team_stats_country ON league_team_stats (country);
CREATE INDEX IF NOT EXISTS idx_league_team_stats_table_position ON league_team_stats (table_position);

-- League Matches
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

CREATE INDEX IF NOT EXISTS idx_league_matches_season ON league_matches (season_id);
CREATE INDEX IF NOT EXISTS idx_league_matches_game_week ON league_matches (game_week);
CREATE INDEX IF NOT EXISTS idx_league_matches_kickoff ON league_matches (kickoff_time);
CREATE INDEX IF NOT EXISTS idx_league_matches_status ON league_matches (status);

-- League Players
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

CREATE INDEX IF NOT EXISTS idx_league_players_club ON league_players (club_team_id);
CREATE INDEX IF NOT EXISTS idx_league_players_position ON league_players (position);

-- =====================================================
-- TABLES WITH FOREIGN KEYS TO league_matches
-- =====================================================

-- Stats Match Details
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

CREATE INDEX IF NOT EXISTS idx_stats_match_details_season ON stats_match_details (season_id);

-- Game Analysis
CREATE TABLE IF NOT EXISTS game_analysis (
    id BIGSERIAL PRIMARY KEY,
    match_id BIGINT NOT NULL UNIQUE,
    analysis_md TEXT NOT NULL,
    analysis_json JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_game_analysis_match
        FOREIGN KEY (match_id) REFERENCES league_matches (match_id)
        ON DELETE CASCADE
);

-- Match Analysis Queue
CREATE TABLE IF NOT EXISTS match_analysis_queue (
    match_id BIGINT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'pending',
    last_checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    analysis_generated_at TIMESTAMPTZ,
    error_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_match_analysis_queue_match
        FOREIGN KEY (match_id) REFERENCES league_matches (match_id)
        ON DELETE CASCADE,
    CONSTRAINT match_analysis_queue_status_check
        CHECK (status IN ('pending', 'dados_importados', 'analise_completa', 'relatorio_concluido'))
);

CREATE INDEX IF NOT EXISTS idx_match_analysis_queue_status ON match_analysis_queue (status);

-- Suggested Bets (with NEW fields for bot integration)
CREATE TABLE IF NOT EXISTS suggested_bets (
    id BIGSERIAL PRIMARY KEY,
    match_id BIGINT NOT NULL,
    bet_market TEXT NOT NULL,
    bet_pick TEXT NOT NULL,
    odds NUMERIC,
    confidence NUMERIC CHECK (confidence >= 0 AND confidence <= 1),
    reasoning TEXT NOT NULL,
    risk_level TEXT,
    bet_category TEXT NOT NULL DEFAULT 'SAFE',
    
    -- NEW: Bot integration fields
    deep_link TEXT,
    bet_status TEXT NOT NULL DEFAULT 'generated',
    telegram_posted_at TIMESTAMPTZ,
    telegram_message_id BIGINT,
    odds_at_post NUMERIC(6,2),
    result_updated_at TIMESTAMPTZ,
    eligible BOOLEAN NOT NULL DEFAULT true,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT fk_suggested_bets_match
        FOREIGN KEY (match_id) REFERENCES league_matches (match_id)
        ON DELETE CASCADE,
    CONSTRAINT suggested_bets_category_check 
        CHECK (bet_category IN ('SAFE', 'OPORTUNIDADE')),
    CONSTRAINT suggested_bets_status_check
        CHECK (bet_status IN ('generated', 'pending_link', 'ready', 'posted', 'success', 'failure', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_suggested_bets_match ON suggested_bets (match_id);
CREATE INDEX IF NOT EXISTS idx_suggested_bets_status ON suggested_bets (bet_status);
CREATE INDEX IF NOT EXISTS idx_suggested_bets_eligible ON suggested_bets (eligible) WHERE eligible = true;
CREATE INDEX IF NOT EXISTS idx_suggested_bets_posted ON suggested_bets (telegram_posted_at) WHERE telegram_posted_at IS NOT NULL;

-- =====================================================
-- VIEWS
-- =====================================================

-- View with Brazil timezone for matches
CREATE OR REPLACE VIEW league_matches_br AS
SELECT
    lm.*,
    (lm.kickoff_time AT TIME ZONE 'America/Sao_Paulo') AS kickoff_time_br
FROM league_matches lm;

-- View for active bets (eligible, with odds >= 1.60, within 2 days)
CREATE OR REPLACE VIEW active_bets AS
SELECT 
    sb.*,
    lm.home_team_name,
    lm.away_team_name,
    lm.kickoff_time,
    lm.status as match_status
FROM suggested_bets sb
JOIN league_matches lm ON sb.match_id = lm.match_id
WHERE sb.eligible = true
  AND sb.bet_status IN ('generated', 'pending_link', 'ready', 'posted')
  AND sb.odds >= 1.60
  AND lm.kickoff_time <= NOW() + INTERVAL '2 days'
  AND lm.kickoff_time > NOW();

-- =====================================================
-- FUNCTIONS & TRIGGERS
-- =====================================================

-- Sync stats_match_details when league_matches updates
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

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION fn_update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all TABLES (not views) with updated_at
DO $$
DECLARE
    tbl TEXT;
BEGIN
    FOR tbl IN 
        SELECT c.table_name 
        FROM information_schema.columns c
        JOIN information_schema.tables t 
          ON c.table_name = t.table_name 
         AND c.table_schema = t.table_schema
        WHERE c.column_name = 'updated_at' 
          AND c.table_schema = 'public'
          AND t.table_type = 'BASE TABLE'
    LOOP
        EXECUTE format('
            DROP TRIGGER IF EXISTS trg_update_timestamp ON %I;
            CREATE TRIGGER trg_update_timestamp
            BEFORE UPDATE ON %I
            FOR EACH ROW
            EXECUTE FUNCTION fn_update_timestamp();
        ', tbl, tbl);
    END LOOP;
END $$;
