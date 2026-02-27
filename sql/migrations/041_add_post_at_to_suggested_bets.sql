-- Migration 041: Add post_at column to suggested_bets
-- Allows individual scheduling of each bet to a specific posting time

ALTER TABLE suggested_bets
  ADD COLUMN IF NOT EXISTS post_at TEXT;

COMMENT ON COLUMN suggested_bets.post_at IS
  'Horario agendado para postagem (HH:MM BRT). Referencia um dos horarios em groups.posting_schedule.times.';
