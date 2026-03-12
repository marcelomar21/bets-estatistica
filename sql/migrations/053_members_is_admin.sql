-- Migration 053: Add is_admin flag to members table
-- Members marked as is_admin are excluded from dashboard stats (Pagantes, Membros Ativos, etc.)

ALTER TABLE members ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT FALSE;

-- Composite index for counter queries that filter by status + is_admin
CREATE INDEX idx_members_status_is_admin ON members (status, is_admin);

COMMENT ON COLUMN members.is_admin IS 'Flag for group admins/staff — excluded from member stats';
