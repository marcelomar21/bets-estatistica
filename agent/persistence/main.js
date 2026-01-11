#!/usr/bin/env node
/**
 * Persiste análises no banco de dados.
 * 
 * Usage:
 *   node agent/persistence/main.js             # Processa todos os jogos pendentes
 *   node agent/persistence/main.js <match_id>  # Processa jogo específico
 *   node agent/persistence/main.js --all       # Processa todos os arquivos de análise
 */
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { saveOutputs } = require('./saveOutputs');
const { getPool, closePool } = require('../db');
const { fetchQueueMatches } = require('../../scripts/lib/matchScreening');

const ANALYSIS_DIR = path.join(__dirname, '..', '..', 'data', 'analises_intermediarias');

const parseArgs = () => {
  const arg = process.argv[2];
  
  if (!arg) {
    return { mode: 'queue' }; // Processar da fila
  }
  
  if (arg === '--all') {
    return { mode: 'all' }; // Processar todos os arquivos
  }
  
  const matchId = Number(arg);
  if (!Number.isInteger(matchId) || matchId <= 0) {
    console.error('match_id deve ser um inteiro positivo.');
    process.exit(1);
  }
  
  return { mode: 'single', matchId };
};

// Extrai match_id do nome do arquivo de análise
const extractMatchIdFromFile = async (filePath) => {
  try {
    const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return content.match_id || content.matchId || null;
  } catch {
    return null;
  }
};

// Processa jogos da fila com status 'analise_completa'
async function processQueue() {
  const pool = getPool();
  
  // Buscar jogos com status 'analise_completa' ou 'dados_importados' que tenham arquivo de análise
  const entries = await fetchQueueMatches(pool, {
    statuses: ['analise_completa', 'dados_importados'],
    windowHours: 336, // 14 dias
    lookbackHours: 48,
  });
  
  if (!entries.length) {
    console.log('Nenhum jogo pendente para persistência.');
    return { processed: 0, failed: 0 };
  }
  
  console.log(`📥 Processando ${entries.length} jogo(s) da fila...`);
  
  let processed = 0;
  let failed = 0;
  
  for (const entry of entries) {
    try {
      const result = await saveOutputs(entry.matchId);
      console.log(`  ✅ ${entry.matchId}: ${result.betsPersisted} bet(s)${result.usedFallback ? ' [fallback]' : ''}`);
      processed++;
    } catch (err) {
      console.log(`  ❌ ${entry.matchId}: ${err.message}`);
      failed++;
    }
  }
  
  return { processed, failed };
}

// Processa todos os arquivos de análise
async function processAllFiles() {
  if (!fs.existsSync(ANALYSIS_DIR)) {
    console.log('Diretório de análises não encontrado.');
    return { processed: 0, failed: 0 };
  }
  
  const files = fs.readdirSync(ANALYSIS_DIR)
    .filter(f => f.endsWith('.json'))
    .sort()
    .reverse(); // Mais recentes primeiro
  
  if (!files.length) {
    console.log('Nenhum arquivo de análise encontrado.');
    return { processed: 0, failed: 0 };
  }
  
  console.log(`📥 Processando ${files.length} arquivo(s) de análise...`);
  
  let processed = 0;
  let failed = 0;
  
  for (const file of files) {
    const filePath = path.join(ANALYSIS_DIR, file);
    const matchId = await extractMatchIdFromFile(filePath);
    
    if (!matchId) {
      console.log(`  ⚠️  ${file}: match_id não encontrado`);
      failed++;
      continue;
    }
    
    try {
      const result = await saveOutputs(matchId);
      console.log(`  ✅ ${matchId}: ${result.betsPersisted} bet(s)${result.usedFallback ? ' [fallback]' : ''}`);
      processed++;
    } catch (err) {
      console.log(`  ❌ ${matchId}: ${err.message}`);
      failed++;
    }
  }
  
  return { processed, failed };
}

// Processa um único jogo
async function processSingle(matchId) {
  const result = await saveOutputs(matchId);
  const baseMessage = `${result.betsPersisted} aposta(s) inseridas/atualizadas no banco para match ${matchId}.`;
  if (result.usedFallback) {
    console.log(`${baseMessage} [fallback] Recomendações extraídas do texto por ausência nos arrays estruturados.`);
  } else {
    console.log(baseMessage);
  }
  return { processed: 1, failed: 0 };
}

async function main() {
  const args = parseArgs();
  let result;
  
  console.log('🚀 Persistence Pipeline\n');
  
  switch (args.mode) {
    case 'queue':
      result = await processQueue();
      break;
    case 'all':
      result = await processAllFiles();
      break;
    case 'single':
      result = await processSingle(args.matchId);
      break;
  }
  
  console.log(`\n✅ Concluído: ${result.processed} processado(s), ${result.failed} falha(s)`);
}

main()
  .catch((err) => {
    console.error('[agent][persistence] Falha ao salvar outputs:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });
