-- Migration 042: WhatsApp Numbers Pool (Epic 12, Story 12-1)
-- Pool table for managing WhatsApp phone numbers used by the platform.
-- Each number can be assigned to a group with active/backup roles.

BEGIN;

-- =====================================================
-- 1. NEW TABLE: whatsapp_numbers
-- =====================================================

CREATE TABLE whatsapp_numbers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number TEXT NOT NULL UNIQUE,         -- E.164 format (+5511999887766)
  jid TEXT UNIQUE,                            -- Baileys JID (5511999887766@s.whatsapp.net)
  status TEXT NOT NULL DEFAULT 'connecting'
    CHECK (status IN ('available','active','backup','banned','cooldown','connecting')),
  group_id UUID REFERENCES groups(id),        -- NULL if not allocated
  role TEXT DEFAULT NULL
    CHECK (role IS NULL OR role IN ('active','backup')),
  last_heartbeat TIMESTAMPTZ DEFAULT now(),
  banned_at TIMESTAMPTZ,
  allocated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- =====================================================
-- 2. RLS POLICIES
-- =====================================================

ALTER TABLE whatsapp_numbers ENABLE ROW LEVEL SECURITY;

-- Super admin: full access to all numbers
CREATE POLICY "super_admin_all_whatsapp_numbers" ON whatsapp_numbers
  FOR ALL USING (public.get_my_role() = 'super_admin');

-- Group admin: read-only access to their group's numbers
CREATE POLICY "group_admin_select_whatsapp_numbers" ON whatsapp_numbers
  FOR SELECT USING (
    public.get_my_role() = 'group_admin'
    AND group_id = public.get_my_group_id()
  );

-- =====================================================
-- 3. INDEXES
-- =====================================================

CREATE INDEX idx_whatsapp_numbers_status ON whatsapp_numbers(status);
CREATE INDEX idx_whatsapp_numbers_group ON whatsapp_numbers(group_id) WHERE group_id IS NOT NULL;
CREATE INDEX idx_whatsapp_numbers_available ON whatsapp_numbers(status) WHERE status = 'available';

COMMIT;
