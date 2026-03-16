-- Migration 058: Add onboarding settings to groups table
-- trial_days: configurable trial duration per group (default 7)
-- welcome_message_template: customizable onboarding message with placeholders

ALTER TABLE groups ADD COLUMN IF NOT EXISTS trial_days INTEGER DEFAULT 7;
ALTER TABLE groups ADD COLUMN IF NOT EXISTS welcome_message_template TEXT;

-- F4: CHECK constraint to prevent invalid trial_days at DB level
ALTER TABLE groups ADD CONSTRAINT chk_trial_days CHECK (trial_days >= 1 AND trial_days <= 365);

-- F14: Limit template length at DB level (Telegram max 4096 chars, template with placeholders can expand)
ALTER TABLE groups ADD CONSTRAINT chk_welcome_template_length CHECK (length(welcome_message_template) <= 2000);
