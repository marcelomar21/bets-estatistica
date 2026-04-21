-- Migration 067: add 'evadido' status + left_at column + (group_id, status) index
-- Story: fix(membership) — distinguish voluntary leavers from system-kicked members.
--
-- 'evadido' means the user left the group voluntarily (or was detected as no
-- longer present without a system-initiated kick). We keep 'removido' for
-- kicks issued by our bot (trial expired, payment failed, external admin kick).
--
-- Additive migration: expands the CHECK domain, adds a nullable column, and
-- creates a helpful composite index. No data in existing rows changes.

BEGIN;

-- Drop the existing CHECK constraint (from migration 039) and re-add it with
-- the new 'evadido' value included.
ALTER TABLE members DROP CONSTRAINT IF EXISTS members_status_check;

ALTER TABLE members
  ADD CONSTRAINT members_status_check
  CHECK (status IN ('trial', 'ativo', 'inadimplente', 'removido', 'cancelado', 'evadido'));

-- left_at: timestamp of voluntary exit. Differs from kicked_at which tracks
-- system-forced kicks. Nullable — only populated when status transitions to
-- 'evadido'.
ALTER TABLE members ADD COLUMN IF NOT EXISTS left_at TIMESTAMPTZ;

COMMENT ON COLUMN members.left_at IS
  'Data/hora em que o membro saiu do grupo voluntariamente (evasão). '
  'Diferente de kicked_at, que marca kicks forçados pelo sistema.';

COMMENT ON COLUMN members.status IS
  'Estado do membro: trial, ativo, inadimplente, '
  'removido (kicked pelo sistema), cancelado (cancelamento manual/webhook), '
  'evadido (saiu voluntariamente).';

-- Composite index to speed up the common "members list filtered by status
-- in a specific group" query pattern used by the admin panel.
CREATE INDEX IF NOT EXISTS idx_members_group_status
  ON members(group_id, status);

COMMIT;

-- Rollback (manual — do not run automatically):
--
-- BEGIN;
--   DROP INDEX IF EXISTS idx_members_group_status;
--
--   -- Optional: move any 'evadido' rows back before tightening the CHECK.
--   -- UPDATE members SET status = 'removido', notes = coalesce(notes, '') || ' [rollback:evadido->removido]' WHERE status = 'evadido';
--
--   ALTER TABLE members DROP COLUMN IF EXISTS left_at;
--
--   ALTER TABLE members DROP CONSTRAINT IF EXISTS members_status_check;
--   ALTER TABLE members
--     ADD CONSTRAINT members_status_check
--     CHECK (status IN ('trial', 'ativo', 'inadimplente', 'removido', 'cancelado'));
-- COMMIT;
