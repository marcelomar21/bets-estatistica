#!/usr/bin/env node

require('dotenv').config();

const { saveOutputs } = require('./saveOutputs');
const { closePool } = require('../db');

const parseMatchId = () => {
  const arg = process.argv[2];
  if (!arg) {
    console.error('Uso: node agent/persistence/main.js <match_id>');
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
  const result = await saveOutputs(matchId);
  console.log(
    `Markdown final salvo em ${result.finalPath}. ${result.betsPersisted} apostas inseridas no banco.`,
  );
}

main()
  .catch((err) => {
    console.error('[agent][persistence] Falha ao salvar outputs:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });


