-- Migration 009: Add invite tracking columns to members table
-- Story 16.9: Implementar Portão de Entrada com Bot
-- Tracks invite link generation and group join confirmation

-- Add invite link column (stores the generated invite URL)
ALTER TABLE members ADD COLUMN IF NOT EXISTS
  invite_link TEXT;

-- Add invite generation timestamp
ALTER TABLE members ADD COLUMN IF NOT EXISTS
  invite_generated_at TIMESTAMPTZ;

-- Add group join confirmation timestamp
ALTER TABLE members ADD COLUMN IF NOT EXISTS
  joined_group_at TIMESTAMPTZ;

-- Comments
COMMENT ON COLUMN members.invite_link IS 'Link de convite unico gerado para o membro';
COMMENT ON COLUMN members.invite_generated_at IS 'Data/hora de geracao do link de convite';
COMMENT ON COLUMN members.joined_group_at IS 'Data/hora que o membro entrou no grupo via convite';

-- Index for finding members who haven't joined yet (for potential reminders)
CREATE INDEX IF NOT EXISTS idx_members_pending_join
ON members(invite_generated_at)
WHERE joined_group_at IS NULL AND invite_link IS NOT NULL;
