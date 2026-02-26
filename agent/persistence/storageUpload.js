/**
 * Upload PDFs to Supabase Storage
 * Story 6.1: Setup Supabase Storage e Upload no Pipeline
 *
 * Uses service_role key (from lib/supabase.js) for full storage access.
 * Retry logic: 3 attempts with exponential backoff (1s, 2s, 4s).
 */
const { supabase } = require('../../lib/supabase');
const logger = require('../../lib/logger');

const BUCKET = 'analysis-pdfs';
const MAX_RETRIES = 3;

/**
 * Upload a PDF buffer to Supabase Storage with retry
 * @param {number} matchId - Match ID for path construction
 * @param {Buffer} pdfBuffer - PDF file buffer
 * @param {string} [filename] - Optional filename (default: analysis-{date}.pdf)
 * @returns {Promise<{success: boolean, storagePath?: string, error?: string}>}
 */
async function uploadPdfToStorage(matchId, pdfBuffer, filename) {
  if (!pdfBuffer || !Buffer.isBuffer(pdfBuffer)) {
    return { success: false, error: 'Invalid PDF buffer' };
  }

  const date = new Date().toISOString().split('T')[0];
  const fname = filename || `analysis-${date}.pdf`;
  const storagePath = `${matchId}/${fname}`;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, pdfBuffer, {
          contentType: 'application/pdf',
          upsert: true,
        });

      if (!error) {
        logger.info('[storageUpload] PDF uploaded', { matchId, storagePath, attempt });
        return { success: true, storagePath };
      }

      logger.warn('[storageUpload] Upload attempt failed', {
        matchId,
        attempt,
        error: error.message,
      });

      if (attempt < MAX_RETRIES) {
        const delay = Math.pow(2, attempt - 1) * 1000;
        await new Promise((r) => setTimeout(r, delay));
      }
    } catch (err) {
      logger.warn('[storageUpload] Upload exception', {
        matchId,
        attempt,
        error: err.message,
      });

      if (attempt < MAX_RETRIES) {
        const delay = Math.pow(2, attempt - 1) * 1000;
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  logger.error('[storageUpload] All upload attempts failed', { matchId, storagePath });
  return { success: false, error: `Upload failed after ${MAX_RETRIES} attempts` };
}

module.exports = { uploadPdfToStorage };
