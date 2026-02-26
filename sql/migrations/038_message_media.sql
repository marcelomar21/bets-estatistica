BEGIN;

-- Story 8.1: Add media fields to scheduled_messages
ALTER TABLE scheduled_messages ADD COLUMN IF NOT EXISTS media_url TEXT;
ALTER TABLE scheduled_messages ADD COLUMN IF NOT EXISTS media_type VARCHAR(10)
  CHECK (media_type IN ('pdf', 'image'));
ALTER TABLE scheduled_messages ADD COLUMN IF NOT EXISTS media_storage_path TEXT;

-- Relax message_text: allow null when media is present
ALTER TABLE scheduled_messages ALTER COLUMN message_text DROP NOT NULL;
ALTER TABLE scheduled_messages ADD CONSTRAINT chk_text_or_media
  CHECK (
    (message_text IS NOT NULL AND message_text != '')
    OR media_storage_path IS NOT NULL
  );

-- Create private bucket for message media
INSERT INTO storage.buckets (id, name, public)
VALUES ('message-media', 'message-media', false)
ON CONFLICT (id) DO NOTHING;

-- Policy: authenticated users can read (for signed URL generation)
CREATE POLICY storage_message_media_auth_select ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'message-media');

-- Policy: service_role can manage files
CREATE POLICY storage_message_media_service_all ON storage.objects
  FOR ALL
  TO service_role
  USING (bucket_id = 'message-media')
  WITH CHECK (bucket_id = 'message-media');

COMMIT;
