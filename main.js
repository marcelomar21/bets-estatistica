#!/usr/bin/env node

/**
 * Orquestrador completo do pipeline:
 * 1. Recalcula a fila (check_analysis_queue)
 * 2. Atualiza dados brutos (daily_update)
 * 3. Executa o agente sobre os jogos elegíveis (runAnalysis today)
 * 4. Persiste resultados no banco (agent/persistence/main)
 * 5. Gera relatórios HTML/PDF (agent/persistence/generateReport)
 *
 * Inclui retentativas automáticas e verificações de status na tabela match_analysis_queue.
 */

require('dotenv').config();

const path = require('path');
const { spawn } = require('child_process');
const { Pool } = require('pg');

const ROOT_DIR = __dirname;
const CHECK_QUEUE_SCRIPT = path.join(ROOT_DIR, 'scripts', 'check_analysis_queue.js');
const DAILY_UPDATE_SCRIPT = path.join(ROOT_DIR, 'scripts', 'daily_update.js');
const RUN_ANALYSIS_SCRIPT = path.join(ROOT_DIR, 'agent', 'analysis', 'runAnalysis.js');
const PERSISTENCE_SCRIPT = path.join(ROOT_DIR, 'agent', 'persistence', 'main.js');
const REPORT_SCRIPT = path.join(ROOT_DIR, 'agent', 'persistence', 'generateReport.js');

const MATCH_STATUS = {
  PENDING: 'pending',
  IMPORTED: 'dados_importados',
  ANALYSIS_DONE: 'analise_completa',
  REPORT_DONE: 'relatorio_concluido',
};

const DEFAULT_RETRY_DELAY_MS = 5_000;
const DEFAULT_COMMAND_RETRIES = 1;
const ANALYSIS_WINDOW_FALLBACK_HOURS = Number(process.env.MAIN_AGENT_WINDOW_HOURS || 168);

const pool = new Pool({
  host: process.env.HOST || process.env.PGHOST || 'localhost',
  port: process.env.PGPORT ? Number(process.env.PGPORT) : 5432,
  database: process.env.PGDATABASE || 'bets_stats',
  user: process.env.PGUSER || 'bets',
  password: process.env.PGPASSWORD || 'bets_pass_123',
  ssl:
    process.env.PGSSL === 'true'
      ? { rejectUnauthorized: process.env.PGSSL_REJECT_UNAUTHORIZED === 'true' }
      : false,
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runWithRetry(fn, { label = 'passo', retries = DEFAULT_COMMAND_RETRIES, delayMs = DEFAULT_RETRY_DELAY_MS } = {}) {
  let attempt = 0;
  while (attempt <= retries) {
    try {
      attempt += 1;
      console.log(`[main] ${label} → tentativa ${attempt}/${retries + 1}`);
      const result = await fn();
      if (attempt > 1) {
        console.log(`[main] ${label} recuperado na tentativa ${attempt}.`);
      }
      return result;
    } catch (err) {
      if (attempt > retries) {
        console.error(`[main] ${label} falhou após ${attempt} tentativa(s): ${err.message}`);
        throw err;
      }
      console.warn(
        `[main] ${label} falhou na tentativa ${attempt}: ${err.message}. Retentando em ${delayMs}ms...`,
      );
      if (delayMs > 0) {
        await sleep(delayMs);
      }
    }
  }
  return null;
}

function runNodeScript(scriptPath, args = [], { env = {} } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, ...args], {
      cwd: ROOT_DIR,
      env: { ...process.env, ...env },
      stdio: 'inherit',
    });
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Script ${path.basename(scriptPath)} finalizou com código ${code}`));
      }
    });
    child.on('error', reject);
  });
}

async function fetchMatchesByStatus(statuses = []) {
  if (!statuses.length) return [];
  const query = `
    SELECT match_id, status, analysis_generated_at, updated_at
      FROM match_analysis_queue
     WHERE status = ANY($1::text[])
     ORDER BY updated_at NULLS LAST, match_id;
  `;
  const { rows } = await pool.query(query, [statuses]);
  return rows.map((row) => ({
    matchId: Number(row.match_id),
    status: row.status,
    analysisGeneratedAt: row.analysis_generated_at ? new Date(row.analysis_generated_at) : null,
    updatedAt: row.updated_at ? new Date(row.updated_at) : null,
  }));
}

async function fetchStatusMap(matchIds = []) {
  if (!matchIds.length) return new Map();
  const { rows } = await pool.query(
    `
      SELECT match_id, status
        FROM match_analysis_queue
       WHERE match_id = ANY($1::bigint[])
    `,
    [matchIds],
  );
  return new Map(rows.map((row) => [Number(row.match_id), row.status]));
}

async function runQueueMaintenance() {
  await runWithRetry(() => runNodeScript(CHECK_QUEUE_SCRIPT), { label: 'Check da fila' });
}

async function runDailyUpdate() {
  await runWithRetry(() => runNodeScript(DAILY_UPDATE_SCRIPT), { label: 'Daily update', retries: 2 });
}

async function runAnalysesIfNeeded() {
  const ready = await fetchMatchesByStatus([MATCH_STATUS.IMPORTED]);
  if (!ready.length) {
    console.log('[main] Nenhum jogo em dados_importados; pulando etapa de análises.');
    return [];
  }

  await runWithRetry(
    () =>
      runNodeScript(RUN_ANALYSIS_SCRIPT, ['today'], {
        env: {
          ...process.env,
          AGENT_QUEUE_WINDOW_HOURS: String(ANALYSIS_WINDOW_FALLBACK_HOURS),
        },
      }),
    { label: 'Agente de análise', retries: 1 },
  );

  return ready.map((entry) => entry.matchId);
}

async function persistMatches() {
  const targets = await fetchMatchesByStatus([MATCH_STATUS.ANALYSIS_DONE]);
  if (!targets.length) {
    console.log('[main] Nenhum jogo aguardando persistência.');
    return [];
  }

  const processed = [];
  for (const { matchId } of targets) {
    await runWithRetry(
      () => runNodeScript(PERSISTENCE_SCRIPT, [String(matchId)]),
      { label: `Persistência match ${matchId}`, retries: 1 },
    );
    processed.push(matchId);
  }
  return processed;
}

async function generateReports(matchIds = []) {
  if (!matchIds.length) {
    console.log('[main] Nenhum match para geração de relatório.');
    return;
  }
  for (const matchId of matchIds) {
    await runWithRetry(
      () => runNodeScript(REPORT_SCRIPT, [String(matchId)]),
      { label: `Relatório match ${matchId}`, retries: 1 },
    );
  }
}

async function verifyStatuses(finalMatchIds = []) {
  if (!finalMatchIds.length) return;
  const statusMap = await fetchStatusMap(finalMatchIds);
  const pending = finalMatchIds.filter(
    (matchId) => statusMap.get(matchId) !== MATCH_STATUS.REPORT_DONE,
  );

  if (pending.length) {
    console.warn(
      `[main] Atenção: os seguintes jogos não chegaram a relatorio_concluido: ${pending.join(', ')}`,
    );
  } else {
    console.log('[main] Todos os jogos processados alcançaram relatorio_concluido.');
  }
}

async function main() {
  const startedAt = Date.now();
  console.log('[main] Iniciando pipeline completo...');
  try {
    await runQueueMaintenance();
    await runDailyUpdate();
    await runAnalysesIfNeeded();
    const persistedMatches = await persistMatches();
    if (!persistedMatches.length) {
      console.log('[main] Não há jogos para gerar relatórios.');
      return;
    }
    await generateReports(persistedMatches);
    await verifyStatuses(persistedMatches);
  } finally {
    await pool.end().catch(() => {});
    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
    console.log(`[main] Pipeline finalizado em ${elapsed}s.`);
  }
}

main().catch((err) => {
  console.error('[main] Falha geral no pipeline:', err);
  process.exitCode = 1;
});




