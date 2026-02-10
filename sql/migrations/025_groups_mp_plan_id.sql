-- Migration 025: Rename groups.mp_product_id to groups.mp_plan_id for Mercado Pago preapproval plans
-- Story 4.1: Assinatura recorrente via Mercado Pago

BEGIN;

-- Rename checkout preference product id column to subscription plan id
ALTER TABLE groups RENAME COLUMN mp_product_id TO mp_plan_id;

-- Legacy checkout preference identifiers are incompatible with preapproval plans
UPDATE groups
SET mp_plan_id = NULL
WHERE mp_plan_id IS NOT NULL;

-- Legacy checkout URLs must also be reset and recreated by onboarding
UPDATE groups
SET checkout_url = NULL
WHERE checkout_url IS NOT NULL;

-- Index for future webhook lookups by plan id
CREATE INDEX IF NOT EXISTS idx_groups_mp_plan_id
  ON groups (mp_plan_id)
  WHERE mp_plan_id IS NOT NULL;

COMMIT;
