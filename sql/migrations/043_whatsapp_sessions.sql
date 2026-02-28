-- Migration 043: WhatsApp Sessions (Epic 12, Story 12-1)
-- Stores encrypted Baileys credentials and QR codes for WhatsApp connections.
-- One session per WhatsApp number (1:1 relationship).

BEGIN;

-- =====================================================
-- 1. NEW TABLE: whatsapp_sessions
-- =====================================================

CREATE TABLE whatsapp_sessions (
  number_id UUID PRIMARY KEY REFERENCES whatsapp_numbers(id) ON DELETE CASCADE,
  creds TEXT,                                 -- AES-256-GCM encrypted JSONB credentials
  qr_code TEXT,                               -- base64 PNG for admin panel display
  connection_state TEXT DEFAULT 'disconnected'
    CHECK (connection_state IN ('disconnected','connecting','open','closed','banned')),
  last_qr_update TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- =====================================================
-- 2. RLS POLICIES
-- =====================================================

ALTER TABLE whatsapp_sessions ENABLE ROW LEVEL SECURITY;

-- Super admin: full access
CREATE POLICY "super_admin_all_whatsapp_sessions" ON whatsapp_sessions
  FOR ALL USING (public.get_my_role() = 'super_admin');

COMMIT;
