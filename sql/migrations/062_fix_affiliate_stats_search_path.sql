-- Migration: 062_fix_affiliate_stats_search_path
-- Description: Adds SET search_path = public to get_affiliate_stats SECURITY DEFINER function
-- Rollback: ALTER FUNCTION get_affiliate_stats RESET search_path;

ALTER FUNCTION get_affiliate_stats SET search_path = public;
