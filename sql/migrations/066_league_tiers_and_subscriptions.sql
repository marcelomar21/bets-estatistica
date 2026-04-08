-- Migration 066: League Tiers and Subscriptions
-- Phase 3: League Upsell - Foundation schema
-- Creates tier classification for leagues, pricing table, subscription tracking,
-- and per-group per-league discount management.

BEGIN;

-- 1. Add tier column to league_seasons
-- Default is 'standard' (included in base subscription)
-- 'extra' leagues require additional subscription
ALTER TABLE league_seasons ADD COLUMN IF NOT EXISTS tier TEXT NOT NULL DEFAULT 'standard';
ALTER TABLE league_seasons ADD CONSTRAINT chk_league_seasons_tier CHECK (tier IN ('standard', 'extra'));

-- 2. Create league_pricing table
-- Stores per-league monthly price, one row per league_name
CREATE TABLE IF NOT EXISTS league_pricing (
  id SERIAL PRIMARY KEY,
  league_name TEXT NOT NULL UNIQUE,
  monthly_price NUMERIC(10,2) NOT NULL DEFAULT 200.00,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_league_pricing_name ON league_pricing(league_name);

-- 3. Create group_league_subscriptions table
-- Tracks which group has active subscription to which extra league
CREATE TABLE IF NOT EXISTS group_league_subscriptions (
  id SERIAL PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  league_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'cancelled', 'expired')),
  mp_plan_id TEXT,
  mp_checkout_url TEXT,
  activated_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(group_id, league_name)
);

CREATE INDEX idx_gls_group ON group_league_subscriptions(group_id);
CREATE INDEX idx_gls_status ON group_league_subscriptions(group_id, status);
CREATE INDEX idx_gls_mp_plan ON group_league_subscriptions(mp_plan_id) WHERE mp_plan_id IS NOT NULL;

-- 4. Create league_discounts table
-- Percentage discount per group per league
CREATE TABLE IF NOT EXISTS league_discounts (
  id SERIAL PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  league_name TEXT NOT NULL,
  discount_percent INTEGER NOT NULL CHECK (discount_percent > 0 AND discount_percent <= 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(group_id, league_name)
);

CREATE INDEX idx_league_discounts_group ON league_discounts(group_id);

-- 5. RLS Policies

-- 5a. league_pricing RLS
ALTER TABLE league_pricing ENABLE ROW LEVEL SECURITY;

-- super_admin: full access
CREATE POLICY league_pricing_super_admin ON league_pricing
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid() AND role = 'super_admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid() AND role = 'super_admin')
  );

-- group_admin: read-only (can see prices, cannot modify)
CREATE POLICY league_pricing_group_admin_select ON league_pricing
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid() AND role = 'group_admin')
  );

-- 5b. group_league_subscriptions RLS
ALTER TABLE group_league_subscriptions ENABLE ROW LEVEL SECURITY;

-- super_admin: full access
CREATE POLICY gls_super_admin ON group_league_subscriptions
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid() AND role = 'super_admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid() AND role = 'super_admin')
  );

-- group_admin: own group only (full access to own subscriptions)
CREATE POLICY gls_group_admin ON group_league_subscriptions
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid() AND role = 'group_admin' AND group_id = group_league_subscriptions.group_id)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid() AND role = 'group_admin' AND group_id = group_league_subscriptions.group_id)
  );

-- 5c. league_discounts RLS
ALTER TABLE league_discounts ENABLE ROW LEVEL SECURITY;

-- super_admin: full access
CREATE POLICY league_discounts_super_admin ON league_discounts
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid() AND role = 'super_admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid() AND role = 'super_admin')
  );

-- group_admin: read own group discounts only
CREATE POLICY league_discounts_group_admin_select ON league_discounts
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid() AND role = 'group_admin' AND group_id = league_discounts.group_id)
  );

COMMIT;
