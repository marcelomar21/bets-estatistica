-- Migration 061: Exclude Rajizito Tips from distribution
-- GURU-16: Retirar Rajizito Tips da distribuição na aba Apostas
--
-- Sets is_test=true for Rajizito Tips and moves undistributed bets back to pool.
-- Rollback: UPDATE groups SET is_test = false WHERE name ILIKE '%rajizito%';

-- Move non-posted bets distributed to Rajizito back to pool
UPDATE suggested_bets
SET group_id = NULL,
    bet_status = 'generated',
    distributed_at = NULL
WHERE group_id = (SELECT id FROM groups WHERE name ILIKE '%rajizito%' LIMIT 1)
  AND bet_status NOT IN ('posted');

-- Set is_test flag for Rajizito Tips
UPDATE groups
SET is_test = true
WHERE name ILIKE '%rajizito%';
