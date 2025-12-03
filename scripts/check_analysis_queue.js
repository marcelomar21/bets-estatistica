#!/usr/bin/env node

require('dotenv').config();

const { Pool } = require('pg');
const {
  listNextMatchesRequiringAnalysis,
  markAnalysisStatus,
  removeQueueEntries,
  DEFAULT_WINDOW_HOURS,
  MATCH_COMPLETION_GRACE_HOURS,
} = require('./lib/matchScreening');

const parseArgs = () => {
  const args = process.argv.slice(2);
  const options = {
    dryRun: false,
    windowHours: DEFAULT_WINDOW_HOURS,
    graceHours: MATCH_COMPLETION_GRACE_HOURS,
  };

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === '--dry-run' || token === '-n') {
      options.dryRun = true;
      continue;
    }
    if (token.startsWith('--window-hours=')) {
      const value = Number(token.split('=')[1]);
      options.windowHours = Number.isNaN(value) ? null : value;
      continue;
    }
    if (token === '--window-hours') {
      const value = Number(args[index + 1]);
      options.windowHours = Number.isNaN(value) ? null : value;
      index += 1;
      continue;
    }
    if (token.startsWith('--grace-hours=')) {
      const value = Number(token.split('=')[1]);
      if (!Number.isNaN(value) && value >= 0) {
        options.graceHours = value;
      }
      continue;
    }
    if (token === '--grace-hours') {
      const value = Number(args[index + 1]);
      if (!Number.isNaN(value) && value >= 0) {
        options.graceHours = value;
      }
      index += 1;
    }
  }

  return options;
};

const buildPool = () =>
  new Pool({
    host: process.env.PGHOST || 'localhost',
    port: process.env.PGPORT ? Number(process.env.PGPORT) : 5432,
    database: process.env.PGDATABASE || 'bets_stats',
    user: process.env.PGUSER || 'bets',
    password: process.env.PGPASSWORD || 'bets_pass_123',
    ssl: process.env.PGSSL === 'true'
      ? { rejectUnauthorized: process.env.PGSSL_REJECT_UNAUTHORIZED === 'true' }
      : false,
  });

const formatMatchLabel = (row) =>
  `${row.matchId} – ${row.homeTeamName || row.homeTeamId} x ${row.awayTeamName || row.awayTeamId}`;

async function main() {
  const options = parseArgs();
  const pool = buildPool();
  const dryPrefix = options.dryRun ? '[dry-run] ' : '';

  try {
    console.log(
      `${dryPrefix}Checando fila de análises (janela ${options.windowHours}h | tolerância ${options.graceHours}h)...`,
    );
    const evaluations = await listNextMatchesRequiringAnalysis(pool, {
      windowHours: options.windowHours,
      graceHours: options.graceHours,
    });

    const grouped = evaluations.reduce(
      (acc, row) => {
        acc[row.evaluation] = (acc[row.evaluation] || 0) + 1;
        return acc;
      },
      {},
    );
    console.log('Resumo da janela:', grouped);

    const targetPending = evaluations.filter((row) => row.evaluation === 'needs_analysis');
    const targetCompleted = evaluations.filter((row) => row.evaluation === 'analysis_up_to_date');
    const targetIds = new Set(
      [...targetPending, ...targetCompleted].map((row) => Number(row.matchId)),
    );

    const { rows: queueRows } = await pool.query(
      'SELECT match_id, status FROM match_analysis_queue',
    );
    const existingMap = new Map(queueRows.map((entry) => [Number(entry.match_id), entry]));
    const toDelete = queueRows
      .map((entry) => Number(entry.match_id))
      .filter((matchId) => !targetIds.has(matchId));

    const actions = [];

    for (const row of targetPending) {
      const existing = existingMap.get(row.matchId);
      if (existing && existing.status === 'analyzing') {
        actions.push({
          type: 'retain-analyzing',
          matchId: row.matchId,
          label: formatMatchLabel(row),
        });
        if (!options.dryRun) {
          await markAnalysisStatus(pool, row.matchId, 'analyzing');
        }
        continue;
      }
      actions.push({ type: 'queue-pending', matchId: row.matchId, label: formatMatchLabel(row) });
      if (!options.dryRun) {
        await markAnalysisStatus(pool, row.matchId, 'pending', {
          clearAnalysisTimestamp: true,
        });
      }
    }

    for (const row of targetCompleted) {
      actions.push({ type: 'mark-complete', matchId: row.matchId, label: formatMatchLabel(row) });
      if (!options.dryRun) {
        await markAnalysisStatus(pool, row.matchId, 'complete', {
          analysisGeneratedAt: row.lastAnalysisAt || new Date(),
        });
      }
    }

    if (toDelete.length) {
      actions.push({ type: 'purge', count: toDelete.length });
      if (!options.dryRun) {
        await removeQueueEntries(pool, toDelete);
      }
    }

    if (!actions.length) {
      console.log('Nenhum ajuste necessário na fila.');
    } else {
      console.log(
        `${dryPrefix}Ações planejadas:\n${actions
          .map((action) => JSON.stringify(action))
          .join('\n')}`,
      );
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[check_analysis_queue] Falha:', err.message);
  process.exitCode = 1;
});

