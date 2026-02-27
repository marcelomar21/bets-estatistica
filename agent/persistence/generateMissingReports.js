#!/usr/bin/env node

require('dotenv').config();

const { generatePdfFromHtml } = require('./reportService');
const { renderHtmlReport } = require('./htmlRenderer');
const { uploadPdfToStorage } = require('./storageUpload');
const { markAnalysisStatus } = require('../../scripts/lib/matchScreening');
const { getPool, closePool } = require('../db');

const parseMatchFilter = () => {
  const arg = process.argv[2];
  if (!arg) return null;
  const matchId = Number(arg);
  if (!Number.isInteger(matchId) || matchId <= 0) {
    console.error('match_id deve ser um inteiro positivo.');
    process.exit(1);
  }
  return matchId;
};

const setQueueStatus = async (matchId, generatedAt) => {
  try {
    await markAnalysisStatus(getPool(), matchId, 'relatorio_concluido', {
      analysisGeneratedAt: generatedAt || new Date(),
      clearErrorReason: true,
    });
  } catch (err) {
    console.error(
      `[report][warn] Falha ao atualizar status do match ${matchId} para relatorio_concluido: ${err.message}`,
    );
  }
};

const fetchMissingReports = async (matchFilter) => {
  const pool = getPool();
  const baseQuery = `
    SELECT match_id, analysis_json AS payload
    FROM game_analysis
    WHERE pdf_storage_path IS NULL
    ${matchFilter ? 'AND match_id = $1' : ''}
    ORDER BY match_id
  `;
  const params = matchFilter ? [matchFilter] : [];
  const { rows } = await pool.query(baseQuery, params);
  return rows;
};

async function main() {
  const matchFilter = parseMatchFilter();
  const entries = await fetchMissingReports(matchFilter);

  if (!entries.length) {
    console.log(
      matchFilter
        ? `[report] Nenhuma análise sem PDF encontrada para match_id ${matchFilter}.`
        : '[report] Nenhuma análise sem PDF encontrada no banco.',
    );
    return;
  }

  let generated = 0;
  let skipped = 0;
  const failures = [];

  for (const { match_id: matchId, payload } of entries) {
    try {
      if (!payload || !payload.output) {
        console.warn(`[report][skip] match ${matchId}: analysis_json inválido. Pulando.`);
        skipped += 1;
        continue;
      }

      const html = renderHtmlReport(payload);
      const pdfBuffer = await generatePdfFromHtml(html);

      const uploadResult = await uploadPdfToStorage(matchId, pdfBuffer);
      if (!uploadResult.success) {
        throw new Error(`Upload falhou: ${uploadResult.error}`);
      }

      const pool = getPool();
      await pool.query(
        'UPDATE game_analysis SET pdf_storage_path = $1, pdf_uploaded_at = NOW() WHERE match_id = $2',
        [uploadResult.storagePath, matchId],
      );

      console.log(`[report][ok] match ${matchId} -> PDF uploaded: ${uploadResult.storagePath}`);
      await setQueueStatus(matchId, payload?.generated_at ? new Date(payload.generated_at) : null);
      generated += 1;
    } catch (err) {
      console.error(`[report][erro] match ${matchId}: ${err.message}`);
      failures.push(matchId);
    }
  }

  console.log(
    `[report] Concluído: ${generated} gerado(s), ${skipped} pulado(s), ${failures.length} falha(s).`,
  );

  if (failures.length) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main()
    .catch((err) => {
      console.error('[report] Falha geral ao gerar relatórios:', err.message);
      process.exitCode = 1;
    })
    .finally(async () => {
      await closePool();
    });
}
