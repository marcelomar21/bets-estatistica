-- Migration 027: Add posting_schedule and post_now_requested_at to groups table
-- Story 5.5: Controle de Postagem no Painel Admin

-- posting_schedule: JSONB with {enabled: boolean, times: ["HH:mm", ...]}
-- Default enabled=true with 3 posting times for backward compatibility
ALTER TABLE groups
ADD COLUMN posting_schedule JSONB DEFAULT '{"enabled": true, "times": ["10:00", "15:00", "22:00"]}'::jsonb;

-- post_now_requested_at: Flag for manual immediate posting via admin panel
-- Bot polls this field; when non-null, executes runPostBets(true) and clears the flag
ALTER TABLE groups
ADD COLUMN post_now_requested_at TIMESTAMPTZ DEFAULT NULL;

-- Validate posting_schedule structure
ALTER TABLE groups
ADD CONSTRAINT check_posting_schedule CHECK (
  posting_schedule IS NULL
  OR (
    posting_schedule ? 'enabled'
    AND posting_schedule ? 'times'
    AND jsonb_typeof(posting_schedule -> 'enabled') = 'boolean'
    AND jsonb_typeof(posting_schedule -> 'times') = 'array'
  )
);

COMMENT ON COLUMN groups.posting_schedule IS 'Configuracao de postagem automatica: {enabled: bool, times: ["HH:mm",...]}';
COMMENT ON COLUMN groups.post_now_requested_at IS 'Flag para postagem manual imediata via admin panel — bot limpa apos execucao';
