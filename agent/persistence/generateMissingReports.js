#!/usr/bin/env node

require('dotenv').config();

const fs = require('fs-extra');

const { resolveReportPaths, listIntermediatePayloads } = require('./reportUtils');
const { generateReportForMatch } = require('./reportService');
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

async function main() {
  const matchFilter = parseMatchFilter();
  const entries = await listIntermediatePayloads(matchFilter);

  if (!entries.length) {
    console.log(
      matchFilter
        ? `[report] Nenhum JSON intermediário encontrado para match_id ${matchFilter}.`
        : '[report] Nenhum JSON intermediário encontrado em data/analises_intermediarias/.',
    );
    return;
  }

  let generated = 0;
  let skipped = 0;
  const failures = [];

  const orderedEntries = entries.sort((a, b) => a.matchId - b.matchId);
  for (const { matchId, payload } of orderedEntries) {
    try {
      const { pdfPath } = resolveReportPaths(payload);
      const alreadyExists = await fs.pathExists(pdfPath);
      if (alreadyExists) {
        console.log(`[report][skip] PDF já existe para match ${matchId}: ${pdfPath}`);
        await setQueueStatus(matchId, payload?.generated_at ? new Date(payload.generated_at) : null);
        skipped += 1;
        continue;
      }

      const { htmlPath, pdfPath: generatedPath } = await generateReportForMatch({ payload });
      console.log(`[report][ok] match ${matchId} -> HTML ${htmlPath} | PDF ${generatedPath}`);
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


