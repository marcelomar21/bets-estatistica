-- Story 6.1: Create analysis-pdfs storage bucket with private access
BEGIN;

-- Create private bucket for analysis PDFs
INSERT INTO storage.buckets (id, name, public)
VALUES ('analysis-pdfs', 'analysis-pdfs', false)
ON CONFLICT (id) DO NOTHING;

-- Policy: authenticated users can read (needed for signed URL generation)
CREATE POLICY storage_analysis_auth_select ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'analysis-pdfs');

-- Policy: service_role can manage files (upload/update/delete)
-- Note: service_role bypasses RLS by default, but explicit policy for clarity
CREATE POLICY storage_analysis_service_all ON storage.objects
  FOR ALL
  TO service_role
  USING (bucket_id = 'analysis-pdfs')
  WITH CHECK (bucket_id = 'analysis-pdfs');

COMMIT;
