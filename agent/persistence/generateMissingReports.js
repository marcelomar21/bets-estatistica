#!/usr/bin/env node

require('dotenv').config();

const fs = require('fs-extra');

const { loadAnalysisPayload, resolveReportPaths, INTERMEDIATE_DIR } = require('./reportUtils');
const { generateReportForMatch } = require('./reportService');

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

const listIntermediateMatchIds = async (matchFilter = null) => {
  const exists = await fs.pathExists(INTERMEDIATE_DIR);
  if (!exists) {
    return [];
  }

  const entries = await fs.readdir(INTERMEDIATE_DIR);
  const ids = entries
    .filter((name) => name.toLowerCase().endsWith('.json'))
    .map((name) => Number(name.replace(/\.json$/i, '')))
    .filter((value) => Number.isInteger(value) && value > 0);

  if (matchFilter) {
    return ids.filter((id) => id === matchFilter);
  }

  return ids.sort((a, b) => a - b);
};

async function main() {
  const matchFilter = parseMatchFilter();
  const matchIds = await listIntermediateMatchIds(matchFilter);

  if (!matchIds.length) {
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

  for (const matchId of matchIds) {
    try {
      const { payload } = await loadAnalysisPayload(matchId);
      const { pdfPath } = resolveReportPaths(payload);
      const alreadyExists = await fs.pathExists(pdfPath);
      if (alreadyExists) {
        console.log(`[report][skip] PDF já existe para match ${matchId}: ${pdfPath}`);
        skipped += 1;
        continue;
      }

      const { htmlPath, pdfPath: generatedPath } = await generateReportForMatch({ payload });
      console.log(`[report][ok] match ${matchId} -> HTML ${htmlPath} | PDF ${generatedPath}`);
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
  main().catch((err) => {
    console.error('[report] Falha geral ao gerar relatórios:', err.message);
    process.exitCode = 1;
  });
}


