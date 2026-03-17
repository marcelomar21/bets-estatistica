-- Migration 059: Convert subscription_price from VARCHAR to NUMERIC(10,2)
-- Rationale: subscription_price was text (e.g. "R$ 49,90/mês") and disconnected from MP plan.
-- Now stores numeric value (e.g. 49.90) synced with Mercado Pago transaction_amount.

BEGIN;

-- Lock table to prevent concurrent writes during column migration
LOCK TABLE groups IN ACCESS EXCLUSIVE MODE;

-- 1. Add temporary numeric column
ALTER TABLE groups ADD COLUMN subscription_price_new NUMERIC(10,2);

-- 2. Convert existing VARCHAR data to numeric
-- Strips non-numeric chars except comma and dot, replaces comma with dot, casts to numeric
UPDATE groups
SET subscription_price_new = (
  CASE
    WHEN subscription_price IS NULL THEN NULL
    WHEN subscription_price ~ '[0-9]' THEN
      NULLIF(
        regexp_replace(
          replace(
            regexp_replace(subscription_price, '[^0-9,.]', '', 'g'),
            ',', '.'
          ),
          '\.(?=.*\.)', '', 'g'  -- remove duplicate dots, keep last
        ),
        ''
      )::NUMERIC(10,2)
    ELSE NULL
  END
);

-- 3. Drop old VARCHAR column
ALTER TABLE groups DROP COLUMN subscription_price;

-- 4. Rename new column
ALTER TABLE groups RENAME COLUMN subscription_price_new TO subscription_price;

-- 5. Add CHECK constraint (price must be non-negative when set)
ALTER TABLE groups ADD CONSTRAINT chk_subscription_price_positive CHECK (subscription_price >= 0);

COMMIT;
