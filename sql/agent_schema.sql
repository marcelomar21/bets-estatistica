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

ALTER TABLE game_analysis
    ADD COLUMN IF NOT EXISTS analysis_md TEXT,
    ADD COLUMN IF NOT EXISTS analysis_json JSONB,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'game_analysis' AND column_name = 'analysis_text'
    ) THEN
        ALTER TABLE game_analysis DROP COLUMN analysis_text;
    END IF;
END $$;

ALTER TABLE game_analysis
    ALTER COLUMN analysis_md SET NOT NULL,
    ALTER COLUMN analysis_json SET NOT NULL;

CREATE TABLE IF NOT EXISTS suggested_bets (
    id BIGSERIAL PRIMARY KEY,
    match_id BIGINT NOT NULL,
    bet_market TEXT NOT NULL,
    bet_pick TEXT NOT NULL,
    odds NUMERIC,
    confidence NUMERIC CHECK (confidence >= 0 AND confidence <= 1),
    reasoning TEXT NOT NULL,
    risk_level TEXT,
    bet_category TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_suggested_bets_match
        FOREIGN KEY (match_id) REFERENCES league_matches (match_id)
        ON DELETE CASCADE,
    CONSTRAINT suggested_bets_category_check CHECK (bet_category IN ('SAFE', 'OPORTUNIDADE'))
);

ALTER TABLE suggested_bets
    ADD COLUMN IF NOT EXISTS bet_market TEXT,
    ADD COLUMN IF NOT EXISTS bet_pick TEXT,
    ADD COLUMN IF NOT EXISTS reasoning TEXT,
    ADD COLUMN IF NOT EXISTS risk_level TEXT,
    ADD COLUMN IF NOT EXISTS bet_category TEXT NOT NULL DEFAULT 'SAFE';

ALTER TABLE suggested_bets
    ALTER COLUMN bet_market SET NOT NULL,
    ALTER COLUMN bet_pick SET NOT NULL,
    ALTER COLUMN reasoning SET NOT NULL,
    ALTER COLUMN bet_category SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'suggested_bets_category_check'
    ) THEN
        ALTER TABLE suggested_bets
            ADD CONSTRAINT suggested_bets_category_check CHECK (bet_category IN ('SAFE', 'OPORTUNIDADE'));
    END IF;
END $$;

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
        CHECK (
            status IN (
                'pending',
                'dados_importados',
                'analise_completa',
                'relatorio_concluido'
            )
        )
);

CREATE INDEX IF NOT EXISTS idx_match_analysis_queue_status
    ON match_analysis_queue (status);
