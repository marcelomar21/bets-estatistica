-- ============================================
-- Seed Data for Local Development (Dev Container)
-- Idempotent: all INSERTs use ON CONFLICT DO NOTHING
-- Order: groups → bot_pool → bot_health → league_seasons → league_matches → suggested_bets → members
-- ============================================

BEGIN;

-- ============================================
-- 1. GROUPS (2 tenants)
-- ============================================
INSERT INTO groups (id, name, telegram_group_id, telegram_admin_group_id, status)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'Guru da Bet (Dev)', -1001000000001, -1001000000002, 'active'),
  ('22222222-2222-2222-2222-222222222222', 'Osmar Palpites (Dev)', -1001000000003, -1001000000004, 'active')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- 2. BOT_POOL (2 fake bots)
-- ============================================
INSERT INTO bot_pool (id, bot_token, bot_username, status, group_id)
VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '0000000001:AAFakeToken_GuruDaBetDev_XXXXXXXXXX', 'guru_da_bet_dev_bot', 'in_use', '11111111-1111-1111-1111-111111111111'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '0000000002:AAFakeToken_OsmarPalpitesDev_XXXXX', 'osmar_palpites_dev_bot', 'in_use', '22222222-2222-2222-2222-222222222222')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- 3. BOT_HEALTH (both online)
-- ============================================
INSERT INTO bot_health (group_id, last_heartbeat, status, restart_requested)
VALUES
  ('11111111-1111-1111-1111-111111111111', NOW(), 'online', false),
  ('22222222-2222-2222-2222-222222222222', NOW(), 'online', false)
ON CONFLICT (group_id) DO NOTHING;

-- ============================================
-- 4. LEAGUE_SEASONS (Brasileirão 2026)
-- ============================================
INSERT INTO league_seasons (id, league_name, country, display_name, season_id, season_year, raw_league, active)
VALUES
  (1, 'Brasileirão Série A', 'Brazil', 'Brasileirão 2026', 99001, 2026, '{"source": "seed-dev"}', true)
ON CONFLICT (season_id) DO NOTHING;

-- ============================================
-- 5. LEAGUE_MATCHES (7 matches with varied timing)
-- ============================================

-- Match 1: Completed old (7 days ago)
INSERT INTO league_matches (id, season_id, match_id, home_team_name, away_team_name, home_score, away_score, status, kickoff_time, raw_match)
VALUES
  (1, 99001, 900001, 'Flamengo', 'Palmeiras', 2, 1, 'complete', NOW() - INTERVAL '7 days', '{"source": "seed-dev"}')
ON CONFLICT (match_id) DO NOTHING;

-- Match 2: Completed old (5 days ago)
INSERT INTO league_matches (id, season_id, match_id, home_team_name, away_team_name, home_score, away_score, status, kickoff_time, raw_match)
VALUES
  (2, 99001, 900002, 'Corinthians', 'São Paulo', 0, 0, 'complete', NOW() - INTERVAL '5 days', '{"source": "seed-dev"}')
ON CONFLICT (match_id) DO NOTHING;

-- Match 3: In tracking window (3 hours ago — between 2-4h)
INSERT INTO league_matches (id, season_id, match_id, home_team_name, away_team_name, home_score, away_score, status, kickoff_time, raw_match)
VALUES
  (3, 99001, 900003, 'Atlético-MG', 'Cruzeiro', 1, 2, 'complete', NOW() - INTERVAL '3 hours', '{"source": "seed-dev"}')
ON CONFLICT (match_id) DO NOTHING;

-- Match 4: In tracking window (2.5 hours ago)
INSERT INTO league_matches (id, season_id, match_id, home_team_name, away_team_name, home_score, away_score, status, kickoff_time, raw_match)
VALUES
  (4, 99001, 900004, 'Grêmio', 'Internacional', 3, 1, 'complete', NOW() - INTERVAL '150 minutes', '{"source": "seed-dev"}')
ON CONFLICT (match_id) DO NOTHING;

-- Match 5: In recovery window (>8 hours ago, result pending)
INSERT INTO league_matches (id, season_id, match_id, home_team_name, away_team_name, home_score, away_score, status, kickoff_time, raw_match)
VALUES
  (5, 99001, 900005, 'Botafogo', 'Fluminense', 2, 2, 'complete', NOW() - INTERVAL '10 hours', '{"source": "seed-dev"}')
ON CONFLICT (match_id) DO NOTHING;

-- Match 6: Future (tomorrow)
INSERT INTO league_matches (id, season_id, match_id, home_team_name, away_team_name, status, kickoff_time, raw_match)
VALUES
  (6, 99001, 900006, 'Santos', 'Vasco', 'incomplete', NOW() + INTERVAL '1 day', '{"source": "seed-dev"}')
ON CONFLICT (match_id) DO NOTHING;

-- Match 7: Future (day after tomorrow)
INSERT INTO league_matches (id, season_id, match_id, home_team_name, away_team_name, status, kickoff_time, raw_match)
VALUES
  (7, 99001, 900007, 'Bahia', 'Fortaleza', 'incomplete', NOW() + INTERVAL '2 days', '{"source": "seed-dev"}')
ON CONFLICT (match_id) DO NOTHING;

-- ============================================
-- 6. SUGGESTED_BETS (10 bets covering all states)
-- ============================================

-- Bet 1: posted + success (old match 1)
INSERT INTO suggested_bets (id, match_id, bet_market, bet_pick, odds, confidence, reasoning, bet_category, bet_status, bet_result, deep_link, telegram_posted_at, telegram_message_id, odds_at_post, group_id)
VALUES
  (1, 900001, 'Resultado Final', 'Flamengo Vence', 1.85, 0.72, 'Flamengo em boa fase, jogando em casa.', 'SAFE', 'posted', 'success', 'https://betano.com.br/event/123', NOW() - INTERVAL '7 days 1 hour', 10001, 1.85, '11111111-1111-1111-1111-111111111111')
ON CONFLICT (id) DO NOTHING;

-- Bet 2: posted + failure (old match 2)
INSERT INTO suggested_bets (id, match_id, bet_market, bet_pick, odds, confidence, reasoning, bet_category, bet_status, bet_result, deep_link, telegram_posted_at, telegram_message_id, odds_at_post, group_id)
VALUES
  (2, 900002, 'Ambos Marcam', 'Sim', 2.10, 0.65, 'Historico de gols no classico.', 'OPORTUNIDADE', 'posted', 'failure', 'https://bet365.com/event/456', NOW() - INTERVAL '5 days 1 hour', 10002, 2.10, '11111111-1111-1111-1111-111111111111')
ON CONFLICT (id) DO NOTHING;

-- Bet 3: posted + pending (tracking window — needs result evaluation)
INSERT INTO suggested_bets (id, match_id, bet_market, bet_pick, odds, confidence, reasoning, bet_category, bet_status, bet_result, deep_link, telegram_posted_at, telegram_message_id, odds_at_post, group_id)
VALUES
  (3, 900003, 'Over/Under', 'Over 2.5', 1.90, 0.68, 'Classico mineiro costuma ter gols.', 'SAFE', 'posted', 'pending', 'https://betano.com.br/event/789', NOW() - INTERVAL '3 hours 30 minutes', 10003, 1.90, '11111111-1111-1111-1111-111111111111')
ON CONFLICT (id) DO NOTHING;

-- Bet 4: posted + pending (tracking window)
INSERT INTO suggested_bets (id, match_id, bet_market, bet_pick, odds, confidence, reasoning, bet_category, bet_status, bet_result, deep_link, telegram_posted_at, telegram_message_id, odds_at_post, group_id)
VALUES
  (4, 900004, 'Resultado Final', 'Grêmio Vence', 2.30, 0.60, 'Grenal com vantagem do mandante.', 'OPORTUNIDADE', 'posted', 'pending', 'https://betano.com.br/event/101', NOW() - INTERVAL '3 hours', 10004, 2.30, '11111111-1111-1111-1111-111111111111')
ON CONFLICT (id) DO NOTHING;

-- Bet 5: posted + pending (recovery window — >8h, sweep candidate)
INSERT INTO suggested_bets (id, match_id, bet_market, bet_pick, odds, confidence, reasoning, bet_category, bet_status, bet_result, deep_link, telegram_posted_at, telegram_message_id, odds_at_post, group_id)
VALUES
  (5, 900005, 'Resultado Final', 'Empate', 3.20, 0.55, 'Classico carioca equilibrado.', 'OPORTUNIDADE', 'posted', 'pending', 'https://bet365.com/event/202', NOW() - INTERVAL '10 hours 30 minutes', 10005, 3.20, '22222222-2222-2222-2222-222222222222')
ON CONFLICT (id) DO NOTHING;

-- Bet 6: ready (future match, ready to post)
INSERT INTO suggested_bets (id, match_id, bet_market, bet_pick, odds, confidence, reasoning, bet_category, bet_status, bet_result, deep_link, group_id)
VALUES
  (6, 900006, 'Resultado Final', 'Santos Vence', 1.75, 0.70, 'Santos favorito em casa.', 'SAFE', 'ready', 'pending', 'https://betano.com.br/event/303', '11111111-1111-1111-1111-111111111111')
ON CONFLICT (id) DO NOTHING;

-- Bet 7: ready (future match, second group)
INSERT INTO suggested_bets (id, match_id, bet_market, bet_pick, odds, confidence, reasoning, bet_category, bet_status, bet_result, deep_link, group_id)
VALUES
  (7, 900007, 'Over/Under', 'Over 1.5', 1.65, 0.75, 'Ambos os times marcam regularmente.', 'SAFE', 'ready', 'pending', 'https://betano.com.br/event/404', '22222222-2222-2222-2222-222222222222')
ON CONFLICT (id) DO NOTHING;

-- Bet 8: generated (future match, still in pipeline)
INSERT INTO suggested_bets (id, match_id, bet_market, bet_pick, odds, confidence, reasoning, bet_category, bet_status, bet_result, group_id)
VALUES
  (8, 900006, 'Ambos Marcam', 'Sim', 2.00, 0.62, 'Santos e Vasco tem defesas falhando.', 'OPORTUNIDADE', 'generated', 'pending', '11111111-1111-1111-1111-111111111111')
ON CONFLICT (id) DO NOTHING;

-- Bet 9: pending_link (awaiting deep link)
INSERT INTO suggested_bets (id, match_id, bet_market, bet_pick, odds, confidence, reasoning, bet_category, bet_status, bet_result, group_id)
VALUES
  (9, 900007, 'Resultado Final', 'Bahia Vence', 2.15, 0.63, 'Bahia tem melhor campanha em casa.', 'SAFE', 'pending_link', 'pending', '22222222-2222-2222-2222-222222222222')
ON CONFLICT (id) DO NOTHING;

-- Bet 10: posted + success (second group, old match)
INSERT INTO suggested_bets (id, match_id, bet_market, bet_pick, odds, confidence, reasoning, bet_category, bet_status, bet_result, deep_link, telegram_posted_at, telegram_message_id, odds_at_post, group_id)
VALUES
  (10, 900001, 'Handicap', 'Flamengo -0.5', 2.05, 0.66, 'Flamengo dominou os ultimos confrontos.', 'OPORTUNIDADE', 'posted', 'success', 'https://bet365.com/event/505', NOW() - INTERVAL '7 days 1 hour', 10006, 2.05, '22222222-2222-2222-2222-222222222222')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- 7. MEMBERS (5 members with varied statuses)
-- ============================================

-- Member 1: trial (group 1)
INSERT INTO members (id, telegram_id, telegram_username, email, status, trial_started_at, group_id)
VALUES
  (1, 100000001, 'joao_trial', 'joao@test.dev', 'trial', NOW() - INTERVAL '1 day', '11111111-1111-1111-1111-111111111111')
ON CONFLICT (id) DO NOTHING;

-- Member 2: ativo (group 1)
INSERT INTO members (id, telegram_id, telegram_username, email, status, subscription_started_at, subscription_ends_at, last_payment_at, payment_method, group_id)
VALUES
  (2, 100000002, 'maria_ativa', 'maria@test.dev', 'ativo', NOW() - INTERVAL '30 days', NOW() + INTERVAL '30 days', NOW() - INTERVAL '5 days', 'pix', '11111111-1111-1111-1111-111111111111')
ON CONFLICT (id) DO NOTHING;

-- Member 3: inadimplente (group 1)
INSERT INTO members (id, telegram_id, telegram_username, email, status, subscription_started_at, subscription_ends_at, last_payment_at, payment_method, group_id)
VALUES
  (3, 100000003, 'pedro_inadimplente', 'pedro@test.dev', 'inadimplente', NOW() - INTERVAL '60 days', NOW() - INTERVAL '3 days', NOW() - INTERVAL '35 days', 'pix', '11111111-1111-1111-1111-111111111111')
ON CONFLICT (id) DO NOTHING;

-- Member 4: removido (group 1)
INSERT INTO members (id, telegram_id, telegram_username, email, status, kicked_at, group_id)
VALUES
  (4, 100000004, 'ana_removida', 'ana@test.dev', 'removido', NOW() - INTERVAL '10 days', '11111111-1111-1111-1111-111111111111')
ON CONFLICT (id) DO NOTHING;

-- Member 5: ativo (group 2)
INSERT INTO members (id, telegram_id, telegram_username, email, status, subscription_started_at, subscription_ends_at, last_payment_at, payment_method, group_id)
VALUES
  (5, 100000005, 'carlos_ativo_g2', 'carlos@test.dev', 'ativo', NOW() - INTERVAL '15 days', NOW() + INTERVAL '15 days', NOW() - INTERVAL '2 days', 'cartao_recorrente', '22222222-2222-2222-2222-222222222222')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- Reset sequences to avoid conflicts with seed IDs
-- ============================================
SELECT setval('league_seasons_id_seq', GREATEST((SELECT MAX(id) FROM league_seasons), 1));
SELECT setval('league_matches_id_seq', GREATEST((SELECT MAX(id) FROM league_matches), 1));
SELECT setval('suggested_bets_id_seq', GREATEST((SELECT MAX(id) FROM suggested_bets), 1));
SELECT setval('members_id_seq', GREATEST((SELECT MAX(id) FROM members), 1));

COMMIT;
