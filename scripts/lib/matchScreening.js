const { Pool } = require('pg');

const MATCH_COMPLETION_GRACE_HOURS = Number(process.env.MATCH_COMPLETION_GRACE_HOURS ?? 4);
const RAW_DEFAULT_WINDOW = Number(process.env.ANALYSIS_WINDOW_HOURS ?? 0);
const DEFAULT_WINDOW_HOURS =
  Number.isFinite(RAW_DEFAULT_WINDOW) && RAW_DEFAULT_WINDOW > 0
    ? Math.floor(RAW_DEFAULT_WINDOW)
    : null;
const QUEUE_LOOKBACK_HOURS = Number(process.env.ANALYSIS_QUEUE_LOOKBACK_HOURS ?? 12);

const ANALYSIS_STATUSES = new Set(['pending', 'analyzing', 'complete', 'skipped']);

const ensurePool = (maybePool) => {
  if (maybePool instanceof Pool) {
    return maybePool;
  }
  if (maybePool && typeof maybePool.query === 'function') {
    return maybePool;
  }
  throw new Error('matchScreening: é necessário fornecer um Pool do pg ou objeto compatível.');
};

const normalizeStatus = (status) => {
  if (!status) {
    throw new Error('Status inválido para match_analysis_queue.');
  }
  const lowered = String(status).toLowerCase();
  if (!ANALYSIS_STATUSES.has(lowered)) {
    throw new Error(
      `Status "${status}" não é suportado. Use: ${Array.from(ANALYSIS_STATUSES).join(', ')}.`,
    );
  }
  return lowered;
};

const NEXT_MATCHES_SQL = `
WITH params AS (
  SELECT
    NOW() AS now_ts,
    CASE
      WHEN $1::int IS NULL THEN NULL
      ELSE NOW() + make_interval(hours => $1::int)
    END AS window_end,
    NOW() - make_interval(hours => $2::int) AS assumed_complete_cutoff
),
team_events AS (
  SELECT match_id, home_team_id AS team_id, kickoff_time, status
  FROM league_matches
  UNION ALL
  SELECT match_id, away_team_id AS team_id, kickoff_time, status
  FROM league_matches
),
team_next_match AS (
  SELECT te.team_id, MIN(te.kickoff_time) AS next_kickoff
  FROM team_events te
  CROSS JOIN params p
  WHERE te.kickoff_time IS NOT NULL
    AND te.kickoff_time >= p.now_ts
    AND (p.window_end IS NULL OR te.kickoff_time <= p.window_end)
  GROUP BY te.team_id
),
team_last_completed AS (
  SELECT te.team_id, MAX(te.kickoff_time) AS last_completed_at
  FROM team_events te
  CROSS JOIN params p
  WHERE te.kickoff_time IS NOT NULL
    AND te.kickoff_time <= p.now_ts
    AND (
      LOWER(COALESCE(te.status, '')) = 'complete'
      OR te.kickoff_time <= p.assumed_complete_cutoff
    )
  GROUP BY te.team_id
),
candidates AS (
  SELECT
    lm.match_id,
    lm.season_id,
    lm.home_team_id,
    lm.away_team_id,
    lm.home_team_name,
    lm.away_team_name,
    lm.kickoff_time,
    lm.status,
    tn_home.next_kickoff AS home_next_kickoff,
    tn_away.next_kickoff AS away_next_kickoff,
    lc_home.last_completed_at AS home_last_completed_at,
    lc_away.last_completed_at AS away_last_completed_at
  FROM league_matches lm
  CROSS JOIN params p
  LEFT JOIN team_next_match tn_home ON tn_home.team_id = lm.home_team_id
  LEFT JOIN team_next_match tn_away ON tn_away.team_id = lm.away_team_id
  LEFT JOIN team_last_completed lc_home ON lc_home.team_id = lm.home_team_id
  LEFT JOIN team_last_completed lc_away ON lc_away.team_id = lm.away_team_id
  WHERE lm.kickoff_time IS NOT NULL
    AND lm.kickoff_time >= p.now_ts
    AND (p.window_end IS NULL OR lm.kickoff_time <= p.window_end)
)
SELECT
  c.*,
  (c.home_next_kickoff = c.kickoff_time) AS home_is_next,
  (c.away_next_kickoff = c.kickoff_time) AS away_is_next,
  GREATEST(
    COALESCE(c.home_last_completed_at, to_timestamp(0)),
    COALESCE(c.away_last_completed_at, to_timestamp(0))
  ) AS last_team_activity_at,
  ga.updated_at AS last_analysis_at,
  maq.status AS queue_status,
  maq.analysis_generated_at,
  maq.last_checked_at,
  maq.error_reason,
  maq.updated_at AS queue_updated_at
FROM candidates c
LEFT JOIN game_analysis ga ON ga.match_id = c.match_id
LEFT JOIN match_analysis_queue maq ON maq.match_id = c.match_id;
`.trim();

const QUEUE_SELECT_SQL = `
WITH params AS (
  SELECT
    NOW() AS now_ts,
    NOW() + make_interval(hours => $2::int) AS future_limit,
    NOW() - make_interval(hours => $3::int) AS past_limit
)
SELECT
  maq.match_id,
  maq.status,
  maq.analysis_generated_at,
  maq.last_checked_at,
  maq.error_reason,
  maq.updated_at AS queue_updated_at,
  lm.home_team_id,
  lm.away_team_id,
  lm.home_team_name,
  lm.away_team_name,
  lm.kickoff_time,
  lm.status AS match_status
FROM match_analysis_queue maq
JOIN league_matches lm ON lm.match_id = maq.match_id
CROSS JOIN params p
WHERE maq.status = ANY($1)
  AND lm.kickoff_time BETWEEN p.past_limit AND p.future_limit
ORDER BY lm.kickoff_time;
`.trim();

const QUEUE_DELETE_SQL = `
DELETE FROM match_analysis_queue
WHERE match_id = ANY($1::bigint[]);
`.trim();

const QUEUE_UPSERT_SQL = `
INSERT INTO match_analysis_queue (
  match_id,
  status,
  last_checked_at,
  analysis_generated_at,
  error_reason,
  created_at,
  updated_at
)
VALUES (
  $1,
  $2,
  COALESCE($3, NOW()),
  $4,
  $5,
  NOW(),
  NOW()
)
ON CONFLICT (match_id) DO UPDATE
SET
  status = EXCLUDED.status,
  last_checked_at = COALESCE(EXCLUDED.last_checked_at, match_analysis_queue.last_checked_at, NOW()),
  analysis_generated_at = CASE
    WHEN $6::boolean IS TRUE THEN match_analysis_queue.analysis_generated_at
    ELSE EXCLUDED.analysis_generated_at
  END,
  error_reason = CASE
    WHEN $7::boolean IS TRUE THEN match_analysis_queue.error_reason
    ELSE EXCLUDED.error_reason
  END,
  updated_at = NOW();
`.trim();

const evaluateRow = (row) => {
  if (!row) return null;
  const homeIsNext = row.home_is_next === true || row.home_is_next === 't';
  const awayIsNext = row.away_is_next === true || row.away_is_next === 't';
  const lastActivity = row.last_team_activity_at ? new Date(row.last_team_activity_at) : null;
  const lastAnalysis = row.last_analysis_at ? new Date(row.last_analysis_at) : null;

  let evaluation = 'needs_analysis';
  if (!row.kickoff_time) {
    evaluation = 'missing_kickoff';
  } else if (!homeIsNext) {
    evaluation = 'home_not_next';
  } else if (!awayIsNext) {
    evaluation = 'away_not_next';
  } else if (lastAnalysis && lastActivity && lastAnalysis >= lastActivity) {
    evaluation = 'analysis_up_to_date';
  }

  return {
    matchId: Number(row.match_id),
    seasonId: row.season_id,
    homeTeamId: row.home_team_id,
    awayTeamId: row.away_team_id,
    homeTeamName: row.home_team_name,
    awayTeamName: row.away_team_name,
    kickoffTime: row.kickoff_time ? new Date(row.kickoff_time) : null,
    matchStatus: row.status,
    homeIsNext,
    awayIsNext,
    homeLastCompletedAt: row.home_last_completed_at ? new Date(row.home_last_completed_at) : null,
    awayLastCompletedAt: row.away_last_completed_at ? new Date(row.away_last_completed_at) : null,
    lastTeamActivityAt: lastActivity,
    lastAnalysisAt: lastAnalysis,
    queueStatus: row.queue_status || null,
    analysisGeneratedAt: row.analysis_generated_at ? new Date(row.analysis_generated_at) : null,
    lastCheckedAt: row.last_checked_at ? new Date(row.last_checked_at) : null,
    queueUpdatedAt: row.queue_updated_at ? new Date(row.queue_updated_at) : null,
    queueError: row.error_reason || null,
    evaluation,
    shouldAnalyze: evaluation === 'needs_analysis',
  };
};

async function listNextMatchesRequiringAnalysis(pool, options = {}) {
  const effectivePool = ensurePool(pool);
  const rawWindow =
    typeof options.windowHours === 'number' && options.windowHours > 0
      ? Math.floor(options.windowHours)
      : null;
  const windowHours = rawWindow ?? DEFAULT_WINDOW_HOURS;
  const graceHours =
    typeof options.graceHours === 'number' && options.graceHours >= 0
      ? Math.floor(options.graceHours)
      : MATCH_COMPLETION_GRACE_HOURS;

  const { rows } = await effectivePool.query(NEXT_MATCHES_SQL, [windowHours, graceHours]);
  return rows.map(evaluateRow);
}

async function fetchQueueMatches(pool, options = {}) {
  const effectivePool = ensurePool(pool);
  const statuses = Array.isArray(options.statuses) && options.statuses.length
    ? options.statuses.map(normalizeStatus)
    : ['pending'];
  const windowHours =
    typeof options.windowHours === 'number' && options.windowHours > 0
      ? Math.floor(options.windowHours)
      : DEFAULT_WINDOW_HOURS;
  const lookbackHours =
    typeof options.lookbackHours === 'number' && options.lookbackHours >= 0
      ? Math.floor(options.lookbackHours)
      : QUEUE_LOOKBACK_HOURS;

  const { rows } = await effectivePool.query(QUEUE_SELECT_SQL, [
    statuses,
    windowHours,
    lookbackHours,
  ]);
  return rows.map((row) => ({
    matchId: Number(row.match_id),
    status: row.status,
    analysisGeneratedAt: row.analysis_generated_at ? new Date(row.analysis_generated_at) : null,
    lastCheckedAt: row.last_checked_at ? new Date(row.last_checked_at) : null,
    queueUpdatedAt: row.queue_updated_at ? new Date(row.queue_updated_at) : null,
    queueError: row.error_reason || null,
    homeTeamId: row.home_team_id,
    awayTeamId: row.away_team_id,
    homeTeamName: row.home_team_name,
    awayTeamName: row.away_team_name,
    kickoffTime: row.kickoff_time ? new Date(row.kickoff_time) : null,
    matchStatus: row.match_status,
  }));
}

async function markAnalysisStatus(pool, matchId, status, meta = {}) {
  const effectivePool = ensurePool(pool);
  const normalizedStatus = normalizeStatus(status);
  if (!Number.isInteger(matchId)) {
    throw new Error('matchId deve ser inteiro ao atualizar a fila de análises.');
  }
  const lastCheckedAt = meta.lastCheckedAt
    ? new Date(meta.lastCheckedAt)
    : meta.updateLastChecked === false
      ? null
      : new Date();

  let analysisGeneratedAt = null;
  let preserveAnalysisGeneratedAt = true;
  if (meta.analysisGeneratedAt) {
    analysisGeneratedAt = new Date(meta.analysisGeneratedAt);
    preserveAnalysisGeneratedAt = false;
  } else if (meta.clearAnalysisTimestamp) {
    analysisGeneratedAt = null;
    preserveAnalysisGeneratedAt = false;
  }

  let errorReason = null;
  let preserveErrorReason = true;
  if (meta.errorReason) {
    errorReason = String(meta.errorReason).slice(0, 400);
    preserveErrorReason = false;
  } else if (meta.clearErrorReason) {
    errorReason = null;
    preserveErrorReason = false;
  }

  await effectivePool.query(QUEUE_UPSERT_SQL, [
    matchId,
    normalizedStatus,
    lastCheckedAt,
    analysisGeneratedAt,
    errorReason,
    preserveAnalysisGeneratedAt,
    preserveErrorReason,
  ]);
}

async function removeQueueEntries(pool, matchIds = []) {
  const effectivePool = ensurePool(pool);
  const ids = (matchIds || []).filter((value) => Number.isInteger(value));
  if (!ids.length) {
    return { removed: 0 };
  }
  const { rowCount } = await effectivePool.query(QUEUE_DELETE_SQL, [ids]);
  return { removed: rowCount };
}

module.exports = {
  DEFAULT_WINDOW_HOURS,
  MATCH_COMPLETION_GRACE_HOURS,
  listNextMatchesRequiringAnalysis,
  fetchQueueMatches,
  markAnalysisStatus,
  removeQueueEntries,
};

