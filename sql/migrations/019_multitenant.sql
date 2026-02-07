-- Migration 019: Multi-tenant support (groups, admin users, bot pool, bot health)
-- Date: 2026-02-07
-- Purpose: Add multi-tenant infrastructure to support multiple Telegram groups,
--          each with its own bot, members, and suggested bets.
--          This is a backward-compatible migration: existing data continues to work
--          because new group_id columns are nullable.

-- =====================================================
-- 1. NEW TABLE: groups (tenants)
-- =====================================================
CREATE TABLE IF NOT EXISTS groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR NOT NULL,
  bot_token VARCHAR,
  telegram_group_id BIGINT,
  telegram_admin_group_id BIGINT,
  mp_product_id VARCHAR,
  render_service_id VARCHAR,
  checkout_url VARCHAR,
  status VARCHAR DEFAULT 'active' CHECK (status IN ('creating', 'active', 'paused', 'inactive', 'failed')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- =====================================================
-- 2. NEW TABLE: admin_users
-- =====================================================
CREATE TABLE IF NOT EXISTS admin_users (
  id UUID PRIMARY KEY,  -- matches Supabase Auth user id
  email VARCHAR NOT NULL,
  role VARCHAR NOT NULL CHECK (role IN ('super_admin', 'group_admin')),
  group_id UUID REFERENCES groups(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- =====================================================
-- 3. NEW TABLE: bot_pool
-- =====================================================
CREATE TABLE IF NOT EXISTS bot_pool (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_token VARCHAR NOT NULL,
  bot_username VARCHAR NOT NULL,
  status VARCHAR DEFAULT 'available' CHECK (status IN ('available', 'in_use')),
  group_id UUID REFERENCES groups(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- =====================================================
-- 4. NEW TABLE: bot_health
-- =====================================================
CREATE TABLE IF NOT EXISTS bot_health (
  group_id UUID PRIMARY KEY REFERENCES groups(id),
  last_heartbeat TIMESTAMPTZ DEFAULT now(),
  status VARCHAR DEFAULT 'online' CHECK (status IN ('online', 'offline')),
  restart_requested BOOLEAN DEFAULT false,
  error_message TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- =====================================================
-- 5. ALTER EXISTING TABLES: add group_id (nullable for backward compat)
-- =====================================================

-- members: associate each member to a group
ALTER TABLE members ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES groups(id);

-- suggested_bets: associate each bet to a group
ALTER TABLE suggested_bets ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES groups(id);

-- suggested_bets: track when a bet was distributed to the group
ALTER TABLE suggested_bets ADD COLUMN IF NOT EXISTS distributed_at TIMESTAMPTZ;

-- =====================================================
-- 6. INDEXES
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_members_group_id ON members(group_id);
CREATE INDEX IF NOT EXISTS idx_suggested_bets_group_id ON suggested_bets(group_id);
CREATE INDEX IF NOT EXISTS idx_groups_status ON groups(status);

-- ============================================
-- 7. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================
--
-- Nota: No Supabase, requisições feitas com a service_role key
-- bypassam RLS automaticamente. Portanto, o backend (bots, cron jobs,
-- webhooks) que usa service_role NÃO precisa de policies especiais.
-- As policies abaixo protegem apenas acessos via anon/authenticated keys
-- (dashboard, API pública).
--
-- Modelo de roles:
--   super_admin  -> acesso total a todas as tabelas e grupos
--   group_admin  -> acesso restrito ao seu próprio group_id
--
-- auth.uid() retorna o UUID do usuário autenticado via Supabase Auth.
-- A tabela admin_users mapeia auth.uid() -> role + group_id.
-- ============================================


-- ============================================
-- 7a. HABILITAR RLS EM TODAS AS TABELAS
-- ============================================

ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_pool ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_health ENABLE ROW LEVEL SECURITY;
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE suggested_bets ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;


-- ============================================
-- 7b. POLICIES: groups
-- ============================================
-- super_admin: CRUD completo (ALL)
-- group_admin: apenas SELECT do seu próprio grupo

CREATE POLICY "groups_super_admin_all" ON groups
  FOR ALL USING (
    (SELECT role FROM admin_users WHERE id = auth.uid()) = 'super_admin'
  );

CREATE POLICY "groups_group_admin_select" ON groups
  FOR SELECT USING (
    id = (SELECT group_id FROM admin_users WHERE id = auth.uid())
  );


-- ============================================
-- 7c. POLICIES: admin_users
-- ============================================
-- super_admin: CRUD completo (ALL) - gerencia todos os admins
-- qualquer admin autenticado: SELECT do próprio registro (self)

CREATE POLICY "admin_users_super_admin_all" ON admin_users
  FOR ALL USING (
    (SELECT role FROM admin_users WHERE id = auth.uid()) = 'super_admin'
  );

CREATE POLICY "admin_users_self_select" ON admin_users
  FOR SELECT USING (
    id = auth.uid()
  );


-- ============================================
-- 7d. POLICIES: bot_pool
-- ============================================
-- Apenas super_admin tem acesso (recurso compartilhado entre grupos)
-- Bots acessam via service_role (bypassa RLS)

CREATE POLICY "bot_pool_super_admin_all" ON bot_pool
  FOR ALL USING (
    (SELECT role FROM admin_users WHERE id = auth.uid()) = 'super_admin'
  );


-- ============================================
-- 7e. POLICIES: bot_health
-- ============================================
-- super_admin: CRUD completo
-- group_admin: SELECT apenas do bot atribuído ao seu grupo

CREATE POLICY "bot_health_super_admin_all" ON bot_health
  FOR ALL USING (
    (SELECT role FROM admin_users WHERE id = auth.uid()) = 'super_admin'
  );

CREATE POLICY "bot_health_group_admin_select" ON bot_health
  FOR SELECT USING (
    group_id = (SELECT group_id FROM admin_users WHERE id = auth.uid())
  );


-- ============================================
-- 7f. POLICIES: members
-- ============================================
-- super_admin: CRUD completo
-- group_admin: CRUD completo nos membros do seu grupo

CREATE POLICY "members_super_admin_all" ON members
  FOR ALL USING (
    (SELECT role FROM admin_users WHERE id = auth.uid()) = 'super_admin'
  );

CREATE POLICY "members_group_admin_all" ON members
  FOR ALL USING (
    group_id = (SELECT group_id FROM admin_users WHERE id = auth.uid())
  );


-- ============================================
-- 7g. POLICIES: suggested_bets
-- ============================================
-- super_admin: CRUD completo
-- group_admin: CRUD completo nas apostas do seu grupo

CREATE POLICY "suggested_bets_super_admin_all" ON suggested_bets
  FOR ALL USING (
    (SELECT role FROM admin_users WHERE id = auth.uid()) = 'super_admin'
  );

CREATE POLICY "suggested_bets_group_admin_all" ON suggested_bets
  FOR ALL USING (
    group_id = (SELECT group_id FROM admin_users WHERE id = auth.uid())
  );


-- ============================================
-- 7h. POLICIES: member_notifications
-- ============================================
-- super_admin: CRUD completo
-- group_admin: CRUD completo (via JOIN com members para resolver group_id)
-- Nota: member_notifications não tem group_id direto, usa member_id
--       que referencia members.id, onde members tem group_id.

CREATE POLICY "member_notifications_super_admin_all" ON member_notifications
  FOR ALL USING (
    (SELECT role FROM admin_users WHERE id = auth.uid()) = 'super_admin'
  );

CREATE POLICY "member_notifications_group_admin_all" ON member_notifications
  FOR ALL USING (
    member_id IN (
      SELECT id FROM members
      WHERE group_id = (SELECT group_id FROM admin_users WHERE id = auth.uid())
    )
  );


-- ============================================
-- 7i. POLICIES: webhook_events
-- ============================================
-- Apenas super_admin via dashboard
-- Webhooks são processados pelo backend com service_role (bypassa RLS)

CREATE POLICY "webhook_events_super_admin_all" ON webhook_events
  FOR ALL USING (
    (SELECT role FROM admin_users WHERE id = auth.uid()) = 'super_admin'
  );
