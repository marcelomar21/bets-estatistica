-- Migration: 061_affiliate_stats_function
-- Description: Creates get_affiliate_stats function for campaigns dashboard (GURU-13)
-- Rollback: DROP FUNCTION IF EXISTS get_affiliate_stats;

CREATE OR REPLACE FUNCTION get_affiliate_stats(
  p_group_id UUID DEFAULT NULL,
  p_since TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE(
  code TEXT,
  clicks BIGINT,
  unique_members BIGINT,
  trials BIGINT,
  active_members BIGINT,
  cancelled BIGINT,
  last_click_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  WITH affiliate_clicks AS (
    SELECT
      (elem->>'code')::text as aff_code,
      (elem->>'clicked_at')::timestamptz as aff_clicked_at,
      m.id as member_id,
      m.status
    FROM members m,
      jsonb_array_elements(m.affiliate_history) as elem
    WHERE m.affiliate_history != '[]'::jsonb
      AND (p_group_id IS NULL OR m.group_id = p_group_id)
      AND (p_since IS NULL OR (elem->>'clicked_at')::timestamptz >= p_since)
  )
  SELECT
    ac.aff_code,
    COUNT(*)::bigint,
    COUNT(DISTINCT ac.member_id)::bigint,
    COUNT(DISTINCT ac.member_id) FILTER (WHERE ac.status = 'trial')::bigint,
    COUNT(DISTINCT ac.member_id) FILTER (WHERE ac.status = 'ativo')::bigint,
    COUNT(DISTINCT ac.member_id) FILTER (WHERE ac.status = 'cancelado')::bigint,
    MAX(ac.aff_clicked_at)
  FROM affiliate_clicks ac
  GROUP BY ac.aff_code
  ORDER BY COUNT(*) DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
