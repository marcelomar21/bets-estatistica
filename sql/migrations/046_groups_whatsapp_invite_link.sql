-- Story 13-2: Add WhatsApp invite link column to groups table
ALTER TABLE groups ADD COLUMN IF NOT EXISTS whatsapp_invite_link TEXT;
