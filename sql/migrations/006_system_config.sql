-- Migration 006: System Configuration Table
-- Story 16.7: ADR-001 - Configurar via system_config

-- Create system_config table for runtime configuration
CREATE TABLE IF NOT EXISTS system_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_by TEXT
);

-- Create index on key for fast lookups
CREATE INDEX IF NOT EXISTS idx_system_config_key ON system_config(key);

-- Insert default trial days configuration
INSERT INTO system_config (key, value, updated_by)
VALUES ('TRIAL_DAYS', '7', 'migration')
ON CONFLICT (key) DO NOTHING;

-- Add comments
COMMENT ON TABLE system_config IS 'Runtime configuration values that can be changed without redeployment';
COMMENT ON COLUMN system_config.key IS 'Configuration key (unique identifier)';
COMMENT ON COLUMN system_config.value IS 'Configuration value (stored as text, parse as needed)';
COMMENT ON COLUMN system_config.updated_at IS 'Timestamp of last update';
COMMENT ON COLUMN system_config.updated_by IS 'Username of operator who made the change';
