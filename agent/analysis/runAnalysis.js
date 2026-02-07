#!/usr/bin/env node

require('dotenv').config();

const path = require('path');
const fs = require('fs-extra');

const { config } = require('../../lib/config');
const { runQuery, closePool, getPool } = require('../db');
const {
  fetchQueueMatches,
  markAnalysisStatus,
  MATCH_COMPLETION_GRACE_HOURS,
} = require('../../scripts/lib/matchScreening');
const { buildIntermediateFileName } = require('../shared/naming');
const { saveOutputs } = require('../persistence/saveOutputs');
const pLimit = require('p-limit').default;

const {
  runAgent,
  buildContextText,
  extractMatchDetailStats,
  extractLastXStats,
  buildToolOutputText,
  mapStructuredBetsToPayload,
  parseJsonField,
} = require('./agentCore');

const INTERMEDIATE_DIR = path.join(__dirname, '../../data/analises_intermediarias');
const CONCURRENCY_LIMIT = Math.max(1, Math.min(10, Number(process.env.AGENT_CONCURRENCY) || 5));
const MATCH_TIMEOUT_MS = Number(process.env.AGENT_MATCH_TIMEOUT_MS) || 10 * 60 * 1000; // 10 min default

const infoLog = (...args) => {
  console.log('[agent][analysis]', ...args);
};

const exitWithError = (message) => {
  console.error(message);
  process.exitCode = 1;
};

const TODAY_ALIASES = new Set(['today', '--today', '-t']);
// Janela padrão: 14 dias (336 horas) para cobrir jogos da semana
const AGENT_QUEUE_WINDOW_HOURS = Number(process.env.AGENT_QUEUE_WINDOW_HOURS ?? 336);
const IMPORTED_STATUS = 'dados_importados';
const READY_QUEUE_STATUSES = [IMPORTED_STATUS];
const LEGACY_QUEUE_STATUSES = ['pending'];

let queuePendingMatches = new Map();

const usage = () =>
  'Uso: node agent/analysis/runAnalysis.js <match_id | match_id,match_id | today>';

const formatDate = (value) => {
  if (!value) return 'Data não disponível';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? String(value)
    : new Intl.DateTimeFormat('pt-BR', {
        dateStyle: 'long',
        timeStyle: 'short',
      }).format(date);
};

const describeQueueEntry = (entry) => {
  const kickoff = entry.kickoffTime ? formatDate(entry.kickoffTime) : 'Data não informada';
  return `${entry.matchId} – ${entry.homeTeamName || entry.homeTeamId} x ${entry.awayTeamName ||
    entry.awayTeamId} (${kickoff})`;
};

const loadQueuePendingMatches = async () => {
  const makeQuery = (statuses) =>
    fetchQueueMatches(getPool(), {
      statuses,
      windowHours: AGENT_QUEUE_WINDOW_HOURS,
      lookbackHours: MATCH_COMPLETION_GRACE_HOURS,
    });

  let entries = await makeQuery(READY_QUEUE_STATUSES);
  if (!entries.length) {
    entries = await makeQuery(LEGACY_QUEUE_STATUSES);
  }

  queuePendingMatches = new Map(entries.map((entry) => [Number(entry.matchId), entry]));
  return entries;
};

const queueHasMatch = (matchId) => queuePendingMatches.has(Number(matchId));

const setQueueStatus = async (matchId, status, meta = {}) => {
  if (!queueHasMatch(matchId)) {
    return;
  }
  await markAnalysisStatus(getPool(), matchId, status, meta);
};

const parseMatchIdValue = (value) => {
  const matchId = Number(value);
  if (!Number.isInteger(matchId) || matchId <= 0) {
    throw new Error('match_id deve ser um inteiro positivo.');
  }
  return matchId;
};

const resolveMatchTargets = async () => {
  const rawArg = process.argv[2];
  if (!rawArg) {
    exitWithError(usage());
    process.exit(1);
  }

  const normalized = rawArg.trim();
  if (TODAY_ALIASES.has(normalized.toLowerCase())) {
    const queueEntries = await loadQueuePendingMatches();
    if (!queueEntries.length) {
      exitWithError(
        'Nenhum jogo pendente na match_analysis_queue. Execute scripts/check_analysis_queue.js antes.',
      );
      process.exit(1);
    }
    infoLog(
      `[fila] Encontrados ${queueEntries.length} jogo(s) pendentes:\n${queueEntries
        .map((entry) => `- ${describeQueueEntry(entry)}`)
        .join('\n')}`,
    );
    return queueEntries.map((entry) => Number(entry.matchId));
  }

  queuePendingMatches = new Map();
  const tokens = normalized.split(',').map((token) => token.trim()).filter(Boolean);
  if (!tokens.length) {
    exitWithError(usage());
    process.exit(1);
  }

  let parsed;
  try {
    parsed = [...new Set(tokens.map(parseMatchIdValue))];
  } catch (err) {
    exitWithError(err.message);
    process.exit(1);
  }
  return parsed;
};

const fetchMatchRow = async (matchId) => {
  const query = `
    SELECT lm.match_id,
           lm.season_id,
           lm.home_team_id,
           lm.away_team_id,
           lm.home_team_name,
           lm.away_team_name,
           lm.home_score,
           lm.away_score,
           lm.status,
           lm.game_week,
           lm.round_id,
           lm.date_unix,
           lm.kickoff_time,
           lm.venue,
           ls.league_name,
           ls.display_name AS competition_name,
           ls.country
      FROM league_matches lm
      LEFT JOIN league_seasons ls ON lm.season_id = ls.season_id
     WHERE lm.match_id = $1
     LIMIT 1;
  `;
  const { rows } = await runQuery(query, [matchId]);
  return rows[0] || null;
};

const fetchMatchDetail = async (matchId) => {
  const query = `
    SELECT raw_payload
      FROM stats_match_details
     WHERE match_id = $1
     LIMIT 1;
  `;
  const { rows } = await runQuery(query, [matchId]);
  return parseJsonField(rows[0]?.raw_payload) || null;
};

const fetchLastX = async (teamId) => {
  if (!teamId) return null;
  const query = `
    SELECT raw_payload
      FROM team_lastx_stats
     WHERE team_id = $1
     ORDER BY (CASE WHEN LOWER(window_scope) IN ('overall', 'geral') THEN 1 ELSE 0 END) DESC,
              last_x_match_num DESC
     LIMIT 1;
  `;
  const { rows } = await runQuery(query, [teamId]);
  if (!rows[0]) return null;
  return parseJsonField(rows[0].raw_payload) || null;
};

const processMatch = async (matchId) => {
  await fs.ensureDir(INTERMEDIATE_DIR);

  const matchRow = await fetchMatchRow(matchId);
  if (!matchRow) {
    throw new Error(`match_id ${matchId} não encontrado em league_matches.`);
  }

  const [detailRaw, homeLastxRaw, awayLastxRaw] = await Promise.all([
    fetchMatchDetail(matchId),
    fetchLastX(matchRow.home_team_id),
    fetchLastX(matchRow.away_team_id),
  ]);

  const detailSummary = extractMatchDetailStats(detailRaw);
  const homeLastxSummary = extractLastXStats(homeLastxRaw);
  const awayLastxSummary = extractLastXStats(awayLastxRaw);

  const contextoJogo = buildContextText(matchRow, detailSummary, homeLastxSummary, awayLastxSummary);
  const agentResult = await runAgent({ matchId, contextoJogo, matchRow });
  const toolOutputsText = buildToolOutputText(agentResult.toolExecutions);
  const persistedContextText = toolOutputsText
    ? `${contextoJogo}\n\n==== Saídas de ferramentas durante a execução ====\n${toolOutputsText}`
    : contextoJogo;
  const safeBetsPayload = mapStructuredBetsToPayload(agentResult.structuredAnalysis?.safe_bets);
  const valueBetsPayload = mapStructuredBetsToPayload(agentResult.structuredAnalysis?.value_bets);

  const generatedAt = new Date();
  const payload = {
    match_id: matchId,
    generated_at: generatedAt.toISOString(),
    context: {
      textual: persistedContextText,
      match_row: matchRow,
      detail_summary: detailSummary,
      home_lastx_summary: homeLastxSummary,
      away_lastx_summary: awayLastxSummary,
      tool_outputs_text: toolOutputsText || null,
    },
    agent: {
      model: config.llm.heavyModel,
      prompt_messages: agentResult.initialMessages,
      final_message: agentResult.finalMessage,
      tool_executions: agentResult.toolExecutions,
      raw_response: agentResult.rawContent,
      structured_analysis: agentResult.structuredAnalysis,
    },
    output: {
      analise_texto: agentResult.analysisText,
      apostas_seguras: safeBetsPayload,
      oportunidades: valueBetsPayload,
    },
  };

  const outputFile = path.join(
    INTERMEDIATE_DIR,
    buildIntermediateFileName({
      generatedAt,
      homeName: matchRow.home_team_name,
      awayName: matchRow.away_team_name,
    }),
  );
  await fs.writeJson(outputFile, payload, { spaces: 2 });
  infoLog(`[match:${matchId}] JSON salvo: ${outputFile}`);

  // Persistir imediatamente no banco (não esperar step 5)
  let persisted = false;
  try {
    const persistResult = await saveOutputs(matchId);
    infoLog(`[match:${matchId}] Persistido no banco: ${persistResult.betsPersisted} bet(s)${persistResult.usedFallback ? ' [fallback]' : ''}`);
    persisted = true;
  } catch (persistErr) {
    infoLog(`[match:${matchId}] AVISO: falha ao persistir no banco: ${persistErr.message} (JSON salvo como backup)`);
    // Não falha o processo - JSON foi salvo como backup
  }

  return { generatedAt, outputFile, persisted };
};

async function main() {
  const matchIds = await resolveMatchTargets();
  const limit = pLimit(CONCURRENCY_LIMIT);

  infoLog(`Processando ${matchIds.length} jogo(s) com concorrência ${CONCURRENCY_LIMIT}`);

  const withTimeout = (promise, ms, matchId) =>
    Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout após ${ms / 1000}s`)), ms)
      ),
    ]);

  const results = await Promise.allSettled(
    matchIds.map((matchId, index) =>
      limit(async () => {
        infoLog(`[match:${matchId}] Iniciando análise (${index + 1}/${matchIds.length})`);
        try {
          const { generatedAt, persisted } = await withTimeout(
            processMatch(matchId),
            MATCH_TIMEOUT_MS,
            matchId
          );
          // Nota: saveOutputs() já atualiza status para 'relatorio_concluido'
          // Só atualiza para 'analise_completa' se persistência falhou (backup em JSON)
          if (!persisted) {
            await setQueueStatus(matchId, 'analise_completa', {
              analysisGeneratedAt: generatedAt,
              clearErrorReason: true,
            });
          }
          return { matchId, success: true, persisted };
        } catch (err) {
          console.error(`[agent][analysis] Falha match ${matchId}: ${err.message}`);
          await setQueueStatus(matchId, 'pending', { errorReason: err.message });
          return { matchId, success: false, error: err.message };
        }
      })
    )
  );

  const succeeded = results.filter(r => r.status === 'fulfilled' && r.value.success);
  const failed = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.success));
  const persistedCount = succeeded.filter(r => r.value.persisted).length;
  const notPersistedCount = succeeded.length - persistedCount;

  infoLog(`Resumo: ${succeeded.length} sucesso(s), ${failed.length} falha(s) de ${matchIds.length} total.`);
  infoLog(`Persistência: ${persistedCount} no banco, ${notPersistedCount} apenas JSON (requer step 5).`);

  if (failed.length > 0) {
    const failedIds = failed.map(r => {
      if (r.status === 'rejected') return `unknown (${r.reason?.message || 'error'})`;
      return r.value.matchId;
    });
    infoLog(`Matches com falha: ${failedIds.join(', ')}`);
  }

  if (notPersistedCount > 0) {
    infoLog(`AVISO: ${notPersistedCount} análise(s) salvas apenas em JSON. Execute 'node agent/persistence/main.js' para persistir.`);
  }

  // Só falha o script se NENHUM match foi processado com sucesso
  if (succeeded.length === 0 && matchIds.length > 0) {
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error('[agent][analysis] Falha durante execução:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await closePool();
    } catch (e) {
      console.error('[agent][analysis] Erro ao fechar pool:', e.message);
    }
    // Força saída após 5s se ainda houver algo pendente
    setTimeout(() => {
      infoLog('Forçando saída do processo...');
      process.exit(process.exitCode || 0);
    }, 5000).unref();
  });
