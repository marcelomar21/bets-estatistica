-- Migration 044: WhatsApp Signal Keys (Epic 12, Story 12-1)
-- Granular storage for Baileys/Signal protocol keys (pre-key, sender-key, etc).
-- Supports per-key upsert instead of full blob replacement.

BEGIN;

-- =====================================================
-- 1. NEW TABLE: whatsapp_keys
-- =====================================================

CREATE TABLE whatsapp_keys (
  id BIGSERIAL PRIMARY KEY,
  number_id UUID NOT NULL REFERENCES whatsapp_numbers(id) ON DELETE CASCADE,
  key_type TEXT NOT NULL,                     -- Signal key type (pre-key, sender-key, etc.)
  key_id TEXT NOT NULL,                       -- Unique ID within key type
  key_data TEXT NOT NULL,                     -- AES-256-GCM encrypted key data
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(number_id, key_type, key_id)        -- granular upsert support
);

-- =====================================================
-- 2. RLS POLICIES
-- =====================================================

ALTER TABLE whatsapp_keys ENABLE ROW LEVEL SECURITY;

-- Super admin: full access
CREATE POLICY "super_admin_all_whatsapp_keys" ON whatsapp_keys
  FOR ALL USING (public.get_my_role() = 'super_admin');

-- =====================================================
-- 3. INDEXES
-- =====================================================

CREATE INDEX idx_whatsapp_keys_number ON whatsapp_keys(number_id);
CREATE INDEX idx_whatsapp_keys_type ON whatsapp_keys(number_id, key_type);

COMMIT;
