-- Migration 034: Insert TRIAL_MODE feature flag into system_config
-- Story 2.1: Feature Flag TRIAL_MODE e Helper getConfig
-- Default: 'mercadopago' (current behavior preserved)

INSERT INTO system_config (key, value, updated_by)
VALUES ('TRIAL_MODE', 'mercadopago', 'migration-034')
ON CONFLICT (key) DO NOTHING;
