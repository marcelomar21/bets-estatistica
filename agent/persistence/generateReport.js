#!/usr/bin/env node

require('dotenv').config();

const { generateReportForMatch } = require('./reportService');

const parseMatchId = () => {
  const arg = process.argv[2];
  if (!arg) {
    console.error('Uso: node agent/persistence/generateReport.js <match_id>');
    process.exit(1);
  }
  const matchId = Number(arg);
  if (!Number.isInteger(matchId) || matchId <= 0) {
    console.error('match_id deve ser um inteiro positivo.');
    process.exit(1);
  }
  return matchId;
};

async function main() {
  const matchId = parseMatchId();
  const { htmlPath, pdfPath } = await generateReportForMatch({ matchId });
  console.log(`[report] HTML salvo em ${htmlPath}`);
  if (pdfPath) {
    console.log(`[report] PDF salvo em ${pdfPath}`);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[report] Falha ao gerar relatório:', err.message);
    process.exitCode = 1;
  });
}


