-- Story 6.1: Add PDF storage columns to game_analysis
BEGIN;

ALTER TABLE game_analysis
  ADD COLUMN IF NOT EXISTS pdf_storage_path TEXT,
  ADD COLUMN IF NOT EXISTS pdf_uploaded_at TIMESTAMPTZ;

COMMIT;
