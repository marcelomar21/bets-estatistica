require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const axios = require('axios');
const https = require('https');
const {
  fetchQueueMatches,
  markAnalysisStatus,
  MATCH_COMPLETION_GRACE_HOURS,
} = require('./lib/matchScreening');

const API_KEY = process.env.FOOTYSTATS_API_KEY || process.env.api_key || process.env.API_KEY;
if (!API_KEY) {
  console.error('FOOTYSTATS_API_KEY/api_key/API_KEY não encontrado no .env');
  process.exit(1);
}

const DATA_DIR = path.join(__dirname, '..', 'data', 'json');
const MATCH_DETAILS_DIR = path.join(DATA_DIR, 'match-details');
const LASTX_DIR = path.join(DATA_DIR, 'lastx');
const UPCOMING_DIR = path.join(DATA_DIR, 'upcoming-matches');
const ANALYZED_DIR = path.join(DATA_DIR, 'jogos-analisados');
const MAX_PENDING_MATCHES = Number(process.env.MAX_PENDING_MATCHES ?? 50);
const REPO_ROOT = path.join(__dirname, '..');
const FETCH_LEAGUE_SCRIPT = path.join(__dirname, 'fetchLeagueMatches.js');
const LOAD_LEAGUE_SCRIPT = path.join(__dirname, 'loadLeagueMatches.js');
const FETCH_LEAGUE_TEAMS_SCRIPT = path.join(__dirname, 'fetchLeagueTeams.js');
const LOAD_LEAGUE_TEAMS_SCRIPT = path.join(__dirname, 'loadLeagueTeamStats.js');

const FRESHNESS_WINDOW_HOURS = 48;
const _FRESHNESS_INTERVAL_SQL = `${FRESHNESS_WINDOW_HOURS} hours`;

[MATCH_DETAILS_DIR, LASTX_DIR, UPCOMING_DIR, ANALYZED_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

const { getPool, closePool: closeDbPool } = require('./lib/db');
const pool = getPool();

const MATCH_API = 'https://api.football-data-api.com/match';
const LASTX_API = 'https://api.football-data-api.com/lastx';

const normalizeValue = (value) => {
  if (value === undefined || value === null) {
    return null;
  }
  const num = Number(value);
  if (!Number.isNaN(num)) {
    return num === -1 ? null : num;
  }
  return value;
};

const buildOrderedMatchStats = (detail, matchRow) => {
  const possessionHome = normalizeValue(detail.team_a_possession);
  const possessionAway = normalizeValue(detail.team_b_possession);

  return {
    meta: {
      season: detail.season,
      stage_round_id: detail.roundID,
      game_week: detail.game_week,
      referee_id: detail.refereeID,
      stadium: detail.stadium_name,
      location: detail.stadium_location,
      attendance: normalizeValue(detail.attendance),
    },
    score: {
      status: detail.status || matchRow?.status,
      ht: {
        home: normalizeValue(detail.ht_goals_team_a ?? detail.homeGoalCount),
        away: normalizeValue(detail.ht_goals_team_b ?? detail.awayGoalCount),
      },
      ft: {
        home: normalizeValue(matchRow?.home_score ?? detail.homeGoalCount),
        away: normalizeValue(matchRow?.away_score ?? detail.awayGoalCount),
      },
      penalties: {
        home: normalizeValue(detail.team_a_penalty_goals),
        away: normalizeValue(detail.team_b_penalty_goals),
      },
      goals: {
        home: detail.homeGoals || [],
        away: detail.awayGoals || [],
      },
    },
    teams: {
      home: {
        id: detail.homeID,
        name: matchRow?.home_team_name || detail.home_name,
        url: detail.home_url,
        badge: detail.home_image,
        ppg: normalizeValue(detail.home_ppg),
      },
      away: {
        id: detail.awayID,
        name: matchRow?.away_team_name || detail.away_name,
        url: detail.away_url,
        badge: detail.away_image,
        ppg: normalizeValue(detail.away_ppg),
      },
    },
    performance: {
      possession: {
        home: possessionHome,
        away: possessionAway,
      },
      shots: {
        on_target: {
          home: normalizeValue(detail.team_a_shotsOnTarget),
          away: normalizeValue(detail.team_b_shotsOnTarget),
        },
        off_target: {
          home: normalizeValue(detail.team_a_shotsOffTarget),
          away: normalizeValue(detail.team_b_shotsOffTarget),
        },
        total: {
          home: normalizeValue(detail.team_a_shots),
          away: normalizeValue(detail.team_b_shots),
        },
      },
      corners: {
        total: normalizeValue(detail.totalCornerCount),
        home: normalizeValue(detail.team_a_corners),
        away: normalizeValue(detail.team_b_corners),
      },
      fouls: {
        home: normalizeValue(detail.team_a_fouls),
        away: normalizeValue(detail.team_b_fouls),
      },
      offsides: {
        home: normalizeValue(detail.team_a_offsides),
        away: normalizeValue(detail.team_b_offsides),
      },
      cards: {
        yellow: {
          home: normalizeValue(detail.team_a_yellow_cards),
          away: normalizeValue(detail.team_b_yellow_cards),
        },
        red: {
          home: normalizeValue(detail.team_a_red_cards),
          away: normalizeValue(detail.team_b_red_cards),
        },
      },
      advanced: {
        xg: {
          home: normalizeValue(detail.team_a_xg),
          away: normalizeValue(detail.team_b_xg),
          total: normalizeValue(detail.total_xg),
          prematch_home: normalizeValue(detail.team_a_xg_prematch),
          prematch_away: normalizeValue(detail.team_b_xg_prematch),
          prematch_total: normalizeValue(detail.total_xg_prematch),
        },
        dangerous_attacks: {
          home: normalizeValue(detail.team_a_dangerous_attacks),
          away: normalizeValue(detail.team_b_dangerous_attacks),
        },
        attacks: {
          home: normalizeValue(detail.team_a_attacks),
          away: normalizeValue(detail.team_b_attacks),
        },
      },
    },
    odds: {
      full_time: {
        home: normalizeValue(detail.odds_ft_1),
        draw: normalizeValue(detail.odds_ft_x),
        away: normalizeValue(detail.odds_ft_2),
        over_25: normalizeValue(detail.odds_ft_over25),
        under_25: normalizeValue(detail.odds_ft_under25),
        btts_yes: normalizeValue(detail.odds_btts_yes),
        btts_no: normalizeValue(detail.odds_btts_no),
      },
      first_half: {
        home: normalizeValue(detail.odds_1st_half_result_1),
        draw: normalizeValue(detail.odds_1st_half_result_x),
        away: normalizeValue(detail.odds_1st_half_result_2),
        over_15: normalizeValue(detail.odds_1st_half_over15),
        under_15: normalizeValue(detail.odds_1st_half_under15),
      },
      second_half: {
        home: normalizeValue(detail.odds_2nd_half_result_1),
        draw: normalizeValue(detail.odds_2nd_half_result_x),
        away: normalizeValue(detail.odds_2nd_half_result_2),
        over_15: normalizeValue(detail.odds_2nd_half_over15),
        under_15: normalizeValue(detail.odds_2nd_half_under15),
      },
      corners: {
        over_95: normalizeValue(detail.odds_corners_over_95),
        under_95: normalizeValue(detail.odds_corners_under_95),
        home: normalizeValue(detail.odds_corners_1),
        draw: normalizeValue(detail.odds_corners_x),
        away: normalizeValue(detail.odds_corners_2),
      },
    },
    potentials: {
      goals: {
        over_45: normalizeValue(detail.o45_potential),
        over_35: normalizeValue(detail.o35_potential),
        over_25: normalizeValue(detail.o25_potential),
        over_15: normalizeValue(detail.o15_potential),
        over_05: normalizeValue(detail.o05_potential),
      },
      first_half: {
        over_15: normalizeValue(detail.o15HT_potential),
        over_05: normalizeValue(detail.o05HT_potential),
      },
      second_half: {
        over_05: normalizeValue(detail.o05_2H_potential),
        over_15: normalizeValue(detail.o15_2H_potential),
      },
      corners: {
        overall: normalizeValue(detail.corners_potential),
        over_85: normalizeValue(detail.corners_o85_potential),
        over_95: normalizeValue(detail.corners_o95_potential),
        over_105: normalizeValue(detail.corners_o105_potential),
      },
      misc: {
        offsides: normalizeValue(detail.offsides_potential),
        cards: normalizeValue(detail.cards_potential),
        average: normalizeValue(detail.avg_potential),
      },
    },
    narratives: detail.trends || null,
    h2h: detail.h2h || null,
    lineups: {
      starters: detail.lineups || null,
      bench: detail.bench || null,
    },
  };
};

const buildOrderedLastX = (entry) => {
  const stats = entry.stats || {};

  return {
    meta: {
      last_x: entry.last_x_match_num,
      scope: entry.last_x_home_away_or_overall,
      updated_timestamp: normalizeValue(entry.last_updated_match_timestamp),
      season: entry.season,
      competition_id: entry.competition_id,
    },
    form: {
      wins: stats.seasonWinsNum_overall ?? null,
      draws: stats.seasonDrawsNum_overall ?? null,
      losses: stats.seasonLossesNum_overall ?? null,
      win_percentage: stats.winPercentage_overall ?? null,
      ppg: stats.seasonPPG_overall ?? null,
    },
    goals: {
      scored_avg: stats.seasonScoredAVG_overall ?? null,
      conceded_avg: stats.seasonConcededAVG_overall ?? null,
      total_avg: stats.seasonAVG_overall ?? null,
      goal_difference: stats.seasonGoalDifference_overall ?? null,
      scored_total: stats.seasonGoals_overall ?? null,
      conceded_total: stats.seasonConceded_overall ?? null,
    },
    clean_sheet: {
      count: stats.seasonCS_overall ?? null,
      percentage: stats.seasonCSPercentage_overall ?? null,
    },
    btts: {
      count: stats.seasonBTTS_overall ?? null,
      percentage: stats.seasonBTTSPercentage_overall ?? null,
    },
    overs: {
      over_25_count: stats.seasonOver25Num_overall ?? null,
      over_25_percentage: stats.seasonOver25Percentage_overall ?? null,
      over_15_percentage: stats.seasonOver15Percentage_overall ?? null,
      over_05_percentage: stats.seasonOver05Percentage_overall ?? null,
    },
    halftime: {
      leading_percentage: stats.leadingAtHTPercentage_overall ?? null,
      drawing_percentage: stats.drawingAtHTPercentage_overall ?? null,
      trailing_percentage: stats.trailingAtHTPercentage_overall ?? null,
      ht_ppg: stats.HTPPG_overall ?? null,
    },
    discipline: {
      cards_recorded_matches: stats.cardsRecorded_matches_overall ?? null,
      card_timing_matches: stats.cardTimingRecorded_matches_overall ?? null,
    },
  };
};

const getRollingRange = (hours = FRESHNESS_WINDOW_HOURS) => {
  const start = new Date();
  const end = new Date(start.getTime() + hours * 60 * 60 * 1000);
  const startUnix = Math.floor(start.getTime() / 1000);
  const endUnix = Math.floor(end.getTime() / 1000) - 1;
  const label = `${start.toISOString().slice(0, 10)}_to_${end.toISOString().slice(0, 10)}`;
  return {
    startUnix,
    endUnix,
    label,
    startISO: start.toISOString(),
    endISO: end.toISOString(),
    hours,
  };
};

const fetchMatchesByIds = async (matchIds = []) => {
  const ids = (matchIds || []).filter((value) => Number.isInteger(value));
  if (!ids.length) {
    return [];
  }
  const query = `
    SELECT match_id, season_id, home_team_id, away_team_id,
           home_team_name, away_team_name, home_score, away_score,
           status, game_week, round_id, date_unix, kickoff_time
      FROM league_matches
     WHERE match_id = ANY($1::bigint[])
     ORDER BY kickoff_time NULLS LAST, match_id;
  `;
  const { rows } = await pool.query(query, [ids]);
  return rows;
};

const saveAnalysisFile = (range, records) => {
  const filePath = path.join(ANALYZED_DIR, `${range.label}.json`);
  const payload = {
    generated_at: new Date().toISOString(),
    range_label: range.label,
    range_hours: range.hours,
    window: {
      start_iso: range.startISO,
      end_iso: range.endISO,
      start_unix: range.startUnix,
      end_unix: range.endUnix,
    },
    total_matches: records.length,
    matches: records,
  };
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
  console.log(`Relatório de jogos analisados salvo em ${filePath}`);
};

const logSummary = (summary) => {
  if (!summary) return;
  console.log('\n===== Resumo daily_update =====');
  console.log(`- Jogos na fila: ${summary.queueSize}`);
  console.log(
    `- league_matches -> seasons sincronizadas: ${summary.matchesSync.seasonsSynced}${
      summary.matchesSync.seasonList.length
        ? ` (${summary.matchesSync.seasonList.join(', ')})`
        : ''
    }`,
  );
  console.log(
    `- Match details → fetched: ${summary.matches.fetched}, skipped: ${summary.matches.skipped}, falhas: ${summary.matches.failed}`,
  );
  console.log(
    `- LastX → fetched: ${summary.lastx.fetched}, skipped: ${summary.lastx.skipped}, falhas: ${summary.lastx.failed}`,
  );
  const teamList =
    Array.isArray(summary.teamStats.list) && summary.teamStats.list.length
      ? summary.teamStats.list.join(', ')
      : '';
  console.log(
    `- Team stats atualizados: ${summary.teamStats.synced}${teamList ? ` (times: ${teamList})` : ''}`,
  );
  console.log('================================\n');
};

const getSeasonSyncTargets = async (limit = MAX_PENDING_MATCHES) => {
  const seasonMap = new Map();
  const query = `
    SELECT
      season_id,
      match_id,
      kickoff_time,
      status,
      updated_at
    FROM league_matches
    WHERE kickoff_time IS NOT NULL
      AND kickoff_time <= NOW() - make_interval(hours => $2::int)
      AND (status IS NULL OR LOWER(status) <> 'complete')
    ORDER BY kickoff_time ASC
    LIMIT $1;
  `;
  const { rows } = await pool.query(query, [limit, MATCH_COMPLETION_GRACE_HOURS]);
  const pendingSeasonIds = Array.from(
    new Set(
      rows
        .map((row) => Number(row.season_id))
        .filter((value) => Number.isInteger(value) && value > 0),
    ),
  );
  if (pendingSeasonIds.length) {
    console.log(`Temporadas com jogos pendentes em league_matches: ${pendingSeasonIds.join(', ')}`);
  } else {
    console.log('Nenhuma temporada possui jogos pendentes em league_matches.');
  }

  for (const row of rows) {
    if (!Number.isInteger(row.season_id)) continue;
    const existing = seasonMap.get(row.season_id);
    const kickoff = row.kickoff_time ? new Date(row.kickoff_time) : null;
    const updatedAt = row.updated_at ? new Date(row.updated_at) : null;
    if (!existing) {
      seasonMap.set(row.season_id, {
        season_id: row.season_id,
        needsSync: true,
        pendingMatches: [row.match_id],
        lastKickoff: kickoff,
        lastUpdatedAt: updatedAt,
      });
      continue;
    }
    existing.pendingMatches.push(row.match_id);
    if (!existing.lastKickoff || (kickoff && kickoff > existing.lastKickoff)) {
      existing.lastKickoff = kickoff;
      existing.lastUpdatedAt = updatedAt;
    }
  }

  const seasonTargets = [];
  for (const season of seasonMap.values()) {
    if (!season.lastKickoff) {
      seasonTargets.push(season);
      continue;
    }
    if (!season.lastUpdatedAt || season.lastUpdatedAt <= season.lastKickoff) {
      seasonTargets.push(season);
    } else {
      console.log(
        `Temporada ${season.season_id} já atualizada após o último jogo pendente, pulando fetch/load.`,
      );
    }
  }
  return seasonTargets;
};

const runNodeScript = (scriptPath, args = []) =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, ...args], {
      cwd: REPO_ROOT,
      env: process.env,
      stdio: 'inherit',
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Script ${path.basename(scriptPath)} finalizou com código ${code}`));
    });

    child.on('error', reject);
  });

const syncPendingLeagueMatches = async () => {
  const targets = await getSeasonSyncTargets(MAX_PENDING_MATCHES);
  if (!targets.length) {
    console.log('Nenhuma temporada pendente precisa de atualização de league_matches.');
    return [];
  }

  const seasonIds = targets.map((item) => item.season_id);
  console.log(
    `Sincronizando ${seasonIds.length} temporada(s) via fetch/load league matches: ${seasonIds.join(', ')}`,
  );
  if (targets.some((target) => target.pendingMatches.length === MAX_PENDING_MATCHES)) {
    console.log(`  ↳ Atenção: limite de ${MAX_PENDING_MATCHES} partidas pendentes atingido.`);
  }

  const args = [`--season-ids=${seasonIds.join(',')}`];
  await runNodeScript(FETCH_LEAGUE_SCRIPT, args);
  await runNodeScript(LOAD_LEAGUE_SCRIPT, args);
  return seasonIds;
};

const syncLeagueTeamStats = async (seasonIds = [], teamIds = []) => {
  const uniqueSeasons = Array.from(
    new Set(seasonIds.filter((value) => Number.isInteger(value) && value > 0)),
  );
  const uniqueTeams = Array.from(
    new Set(teamIds.filter((value) => Number.isInteger(value) && value > 0)),
  );
  if (!uniqueSeasons.length || !uniqueTeams.length) {
    console.log('Nenhum team_id precisando de atualização de league_team_stats, pulando fetch/load.');
    return;
  }
  const args = [
    `--season-ids=${uniqueSeasons.join(',')}`,
    `--team-ids=${uniqueTeams.join(',')}`,
  ];
  console.log(
    `Sincronizando league_team_stats para ${uniqueTeams.length} time(s) nas temporadas ${uniqueSeasons.join(', ')}`,
  );
  await runNodeScript(FETCH_LEAGUE_TEAMS_SCRIPT, args);
  await runNodeScript(LOAD_LEAGUE_TEAMS_SCRIPT, args);
  uniqueTeams.forEach((teamId) => TEAM_STATS_FETCHED_CACHE.set(teamId, new Date()));
};

const TEAM_TIMELINE_CACHE = new Map();
const TEAM_LASTX_UPDATED_CACHE = new Map();
const TEAM_STATS_FETCHED_CACHE = new Map();
const MATCH_DETAIL_UPDATED_CACHE = new Map();

const getTeamTimeline = async (teamId) => {
  if (TEAM_TIMELINE_CACHE.has(teamId)) {
    return TEAM_TIMELINE_CACHE.get(teamId);
  }
  const timeline = { lastCompleted: null, nextMatch: null };
  const query = `
    WITH last_match AS (
      SELECT MAX(kickoff_time) AS kickoff
      FROM league_matches
      WHERE (home_team_id = $1 OR away_team_id = $1)
        AND kickoff_time <= NOW()
        AND (
          LOWER(COALESCE(status, '')) = 'complete'
          OR kickoff_time <= NOW() - make_interval(hours => $2::int)
        )
    ),
    next_match AS (
      SELECT MIN(kickoff_time) AS kickoff
      FROM league_matches
      WHERE (home_team_id = $1 OR away_team_id = $1)
        AND kickoff_time >= NOW()
    )
    SELECT
      (SELECT kickoff FROM last_match) AS last_completed,
      (SELECT kickoff FROM next_match) AS next_match;
  `;
  try {
    const { rows } = await pool.query(query, [teamId, MATCH_COMPLETION_GRACE_HOURS]);
    if (rows[0]) {
      timeline.lastCompleted = rows[0].last_completed ? new Date(rows[0].last_completed) : null;
      timeline.nextMatch = rows[0].next_match ? new Date(rows[0].next_match) : null;
    }
  } catch (err) {
    console.warn(`  ↳ Falha ao montar timeline do time ${teamId}: ${err.message}`);
  }
  TEAM_TIMELINE_CACHE.set(teamId, timeline);
  return timeline;
};

const getTeamLastxUpdatedAt = async (teamId) => {
  if (TEAM_LASTX_UPDATED_CACHE.has(teamId)) {
    return TEAM_LASTX_UPDATED_CACHE.get(teamId);
  }
  const query = `
    SELECT MAX(updated_at) AS updated_at
      FROM team_lastx_stats
     WHERE team_id = $1;
  `;
  try {
    const { rows } = await pool.query(query, [teamId]);
    const value = rows[0]?.updated_at ? new Date(rows[0].updated_at) : null;
    TEAM_LASTX_UPDATED_CACHE.set(teamId, value);
    return value;
  } catch (err) {
    console.warn(`  ↳ Falha ao consultar updated_at do time ${teamId}: ${err.message}`);
    TEAM_LASTX_UPDATED_CACHE.set(teamId, null);
    return null;
  }
};

const shouldRefreshLastX = async (teamId) => {
  try {
    const lastUpdatedAt = await getTeamLastxUpdatedAt(teamId);
    if (!lastUpdatedAt) {
      return true;
    }
    const { lastCompleted, nextMatch } = await getTeamTimeline(teamId);
    if (!lastCompleted) {
      return true;
    }
    if (lastUpdatedAt <= lastCompleted) {
      return true;
    }
    if (nextMatch && lastUpdatedAt >= nextMatch) {
      return true;
    }
    return false;
  } catch (err) {
    console.warn(`  ↳ Não foi possível avaliar timeline do time ${teamId}: ${err.message}`);
    return true;
  }
};

const getTeamStatsFetchedAt = async (teamId) => {
  if (TEAM_STATS_FETCHED_CACHE.has(teamId)) {
    return TEAM_STATS_FETCHED_CACHE.get(teamId);
  }
  const query = `
    SELECT fetched_at
      FROM league_team_stats
     WHERE team_id = $1
     ORDER BY fetched_at DESC
     LIMIT 1;
  `;
  try {
    const { rows } = await pool.query(query, [teamId]);
    const value = rows[0]?.fetched_at ? new Date(rows[0].fetched_at) : null;
    TEAM_STATS_FETCHED_CACHE.set(teamId, value);
    return value;
  } catch (err) {
    console.warn(`  ↳ Falha ao consultar fetched_at do time ${teamId}: ${err.message}`);
    TEAM_STATS_FETCHED_CACHE.set(teamId, null);
    return null;
  }
};

const shouldRefreshTeamStats = async (teamId) => {
  try {
    const fetchedAt = await getTeamStatsFetchedAt(teamId);
    if (!fetchedAt) {
      return true;
    }
    const { lastCompleted } = await getTeamTimeline(teamId);
    if (!lastCompleted) {
      return true;
    }
    return fetchedAt <= lastCompleted;
  } catch (err) {
    console.warn(`  ↳ Não foi possível avaliar team stats do time ${teamId}: ${err.message}`);
    return true;
  }
};

const getMatchDetailUpdatedAt = async (matchId) => {
  if (MATCH_DETAIL_UPDATED_CACHE.has(matchId)) {
    return MATCH_DETAIL_UPDATED_CACHE.get(matchId);
  }
  const query = `
    SELECT updated_at
      FROM stats_match_details
     WHERE match_id = $1
     LIMIT 1;
  `;
  try {
    const { rows } = await pool.query(query, [matchId]);
    const value = rows[0]?.updated_at ? new Date(rows[0].updated_at) : null;
    MATCH_DETAIL_UPDATED_CACHE.set(matchId, value);
    return value;
  } catch (err) {
    console.warn(`  ↳ Falha ao consultar updated_at de match ${matchId}: ${err.message}`);
    MATCH_DETAIL_UPDATED_CACHE.set(matchId, null);
    return null;
  }
};

const shouldRefreshMatchDetail = async (matchRow) => {
  try {
    const currentUpdatedAt = await getMatchDetailUpdatedAt(matchRow.match_id);
    if (!currentUpdatedAt) {
      return true;
    }

    const homeTimeline = await getTeamTimeline(matchRow.home_team_id);
    const awayTimeline = await getTeamTimeline(matchRow.away_team_id);
    const timestamps = [homeTimeline.lastCompleted, awayTimeline.lastCompleted].filter(Boolean);
    if (!timestamps.length) {
      return true;
    }
    const lastCompleted = new Date(Math.max(...timestamps.map((date) => date.getTime())));
    const kickoff = matchRow.kickoff_time ? new Date(matchRow.kickoff_time) : null;

    if (currentUpdatedAt <= lastCompleted) {
      return true;
    }
    if (kickoff && currentUpdatedAt >= kickoff) {
      return true;
    }
    return false;
  } catch (err) {
    console.warn(`  ↳ Não foi possível avaliar necessidade de atualizar match ${matchRow.match_id}: ${err.message}`);
    return true;
  }
};

const collectTeamStatsTargets = async (matches) => {
  const targets = new Set();
  for (const match of matches) {
    const candidates = [
      Number(match.home_team_id),
      Number(match.away_team_id),
    ].filter((value) => Number.isInteger(value) && value > 0);

    for (const teamId of candidates) {
      try {
        const needsRefresh = await shouldRefreshTeamStats(teamId);
        if (needsRefresh) {
          targets.add(teamId);
        }
      } catch (err) {
        console.warn(`  ↳ Falha ao avaliar team stats do time ${teamId}: ${err.message}`);
        targets.add(teamId);
      }
    }
  }
  return targets;
};

const fetchMatchDetail = async (matchId) => {
  console.log(`→ Buscando detalhes do match_id=${matchId}`);
  const response = await axios.get(MATCH_API, {
    params: { key: API_KEY, match_id: matchId },
    httpsAgent,
    headers: { 'User-Agent': 'BetsEstatistica/1.0' },
  });

  return {
    fetched_at: new Date().toISOString(),
    match_id: matchId,
    data: response.data,
  };
};

const saveMatchDetailFile = (matchId, payload) => {
  const filePath = path.join(MATCH_DETAILS_DIR, `match-${matchId}.json`);
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
  console.log(`  ↳ Detalhes salvos em ${filePath}`);
};

const upsertMatchDetail = async (matchRow, detailPayload) => {
  const detail = detailPayload?.data;
  if (!detail?.data?.id) {
    console.warn(`  ↳ Payload inválido para match ${matchRow.match_id}, pulando importação DB.`);
    return;
  }

  const detailData = detail.data;
  const orderedStats = buildOrderedMatchStats(detailData, matchRow);

  const query = `
    INSERT INTO stats_match_details
      (match_id, season_id, home_team_id, away_team_id, home_team_name, away_team_name,
       home_score, away_score, status, competition_stage, referee, venue, attendance,
       raw_payload, ordered_stats, updated_at)
    VALUES
      ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW())
    ON CONFLICT (match_id) DO UPDATE SET
      home_team_id = EXCLUDED.home_team_id,
      away_team_id = EXCLUDED.away_team_id,
      home_team_name = EXCLUDED.home_team_name,
      away_team_name = EXCLUDED.away_team_name,
      home_score = EXCLUDED.home_score,
      away_score = EXCLUDED.away_score,
      status = EXCLUDED.status,
      competition_stage = EXCLUDED.competition_stage,
      referee = EXCLUDED.referee,
      venue = EXCLUDED.venue,
      attendance = EXCLUDED.attendance,
      raw_payload = EXCLUDED.raw_payload,
      ordered_stats = EXCLUDED.ordered_stats,
      updated_at = NOW();
  `;

  const params = [
    matchRow.match_id,
    matchRow.season_id,
    matchRow.home_team_id,
    matchRow.away_team_id,
    matchRow.home_team_name,
    matchRow.away_team_name,
    matchRow.home_score,
    matchRow.away_score,
    detailData.status || matchRow.status,
    detailData.roundID ? `Round ${detailData.roundID}` : null,
    detailData.refereeID ? String(detailData.refereeID) : null,
    detailData.stadium_name || null,
    normalizeValue(detailData.attendance),
    JSON.stringify(detailPayload.data),
    JSON.stringify(orderedStats),
  ];

  await pool.query(query, params);
  console.log('  ↳ Detalhes importados para stats_match_details.');
};

const fetchLastX = async (teamId) => {
  console.log(`→ Buscando lastx para team_id=${teamId}`);
  const response = await axios.get(LASTX_API, {
    params: { key: API_KEY, team_id: teamId },
    httpsAgent,
    headers: { 'User-Agent': 'BetsEstatistica/1.0' },
  });

  return {
    fetched_at: new Date().toISOString(),
    team_id: teamId,
    data: response.data,
  };
};

const saveLastXFile = (teamId, payload) => {
  const filePath = path.join(LASTX_DIR, `team-${teamId}.json`);
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
  console.log(`  ↳ LastX salvo em ${filePath}`);
};

const upsertLastX = async (payload) => {
  const entries = payload?.data?.data;
  if (!Array.isArray(entries) || !entries.length) {
    console.warn('  ↳ Payload lastx sem entradas válidas.');
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const entry of entries) {
      if (!entry?.id) continue;

      const orderedStats = buildOrderedLastX(entry);
      const query = `
        INSERT INTO team_lastx_stats
          (team_id, team_name, country, season, competition_id, window_scope, last_x_match_num,
           last_updated_match_timestamp, risk, image_url, raw_payload, ordered_stats, updated_at)
        VALUES
          ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
        ON CONFLICT (team_id, window_scope, last_x_match_num) DO UPDATE SET
          team_name = EXCLUDED.team_name,
          country = EXCLUDED.country,
          season = EXCLUDED.season,
          competition_id = EXCLUDED.competition_id,
          last_updated_match_timestamp = EXCLUDED.last_updated_match_timestamp,
          risk = EXCLUDED.risk,
          image_url = EXCLUDED.image_url,
          raw_payload = EXCLUDED.raw_payload,
          ordered_stats = EXCLUDED.ordered_stats,
          updated_at = NOW();
      `;

      const params = [
        entry.id,
        entry.name || entry.full_name || 'UNKNOWN',
        entry.country || null,
        entry.season || null,
        entry.competition_id || null,
        entry.last_x_home_away_or_overall || '0',
        entry.last_x_match_num || null,
        normalizeValue(entry.last_updated_match_timestamp),
        normalizeValue(entry.risk),
        entry.image || null,
        JSON.stringify(entry),
        JSON.stringify(orderedStats),
      ];

      await client.query(query, params);
    }
    await client.query('COMMIT');
    console.log('  ↳ LastX importado para team_lastx_stats.');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

const processMatch = async (matchRow) => {
  try {
    const needsRefresh = await shouldRefreshMatchDetail(matchRow);
    if (!needsRefresh) {
      console.log(
        `  ↳ Detalhes do match ${matchRow.match_id} já estão entre o último e o próximo jogo, pulando API.`,
      );
      return { status: 'skipped', reason: 'fresh-timeline', match_id: matchRow.match_id };
    }

    const detailPayload = await fetchMatchDetail(matchRow.match_id);
    saveMatchDetailFile(matchRow.match_id, detailPayload);
    await upsertMatchDetail(matchRow, detailPayload);
    MATCH_DETAIL_UPDATED_CACHE.set(matchRow.match_id, new Date(detailPayload.fetched_at));
    return { status: 'fetched', fetched_at: detailPayload.fetched_at, match_id: matchRow.match_id };
  } catch (err) {
    const message = err.response?.data || err.message;
    console.error(`  ↳ Falha ao processar detalhes do match ${matchRow.match_id}:`, message);
    return { status: 'failed', message, match_id: matchRow.match_id };
  }
};

const processTeam = async (teamId, processedTeams) => {
  if (!teamId) {
    return { status: 'failed', reason: 'missing-team-id', team_id: teamId ?? null };
  }

  const cached = processedTeams.get(teamId);
  if (cached) {
    console.log(`  ↳ LastX do time ${teamId} já processado neste ciclo, reutilizando resultado.`);
    return { ...cached, reused: true, team_id: teamId };
  }

  const storeResult = (result) => {
    processedTeams.set(teamId, result);
    return result;
  };

  try {
    const needsRefresh = await shouldRefreshLastX(teamId);
    if (!needsRefresh) {
      console.log(
        `  ↳ LastX do time ${teamId} já está entre o último e o próximo jogo, pulando API.`,
      );
      return storeResult({ status: 'skipped', reason: 'fresh-timeline', team_id: teamId });
    }

    const lastxPayload = await fetchLastX(teamId);
    saveLastXFile(teamId, lastxPayload);
    await upsertLastX(lastxPayload);
    return storeResult({ status: 'fetched', fetched_at: lastxPayload.fetched_at, team_id: teamId });
  } catch (err) {
    const message = err.response?.data || err.message;
    console.error(`  ↳ Falha ao processar lastx do time ${teamId}:`, message);
    return storeResult({ status: 'failed', message, team_id: teamId });
  }
};

async function main() {
  const syncedSeasonsInitial = await syncPendingLeagueMatches();
  const range = getRollingRange(FRESHNESS_WINDOW_HOURS);

  try {
    const queueEntries = await fetchQueueMatches(pool, {
      statuses: ['pending'],
      windowHours: null,
      lookbackHours: MATCH_COMPLETION_GRACE_HOURS,
    });

    const summary = {
      queueSize: queueEntries.length,
      matchesSync: {
        seasonsSynced: Array.isArray(syncedSeasonsInitial) ? syncedSeasonsInitial.length : 0,
        seasonList: Array.isArray(syncedSeasonsInitial) ? syncedSeasonsInitial : [],
      },
      matches: { fetched: 0, skipped: 0, failed: 0 },
      lastx: { fetched: 0, skipped: 0, failed: 0 },
      teamStats: { synced: 0, list: [] },
    };

    if (!queueEntries.length) {
      console.log('Nenhum jogo pendente na match_analysis_queue.');
      saveAnalysisFile(range, []);
      logSummary(summary);
      return;
    }

    const matchIds = queueEntries.map((entry) => entry.matchId);
    const matchRows = await fetchMatchesByIds(matchIds);
    const matchMap = new Map(matchRows.map((row) => [Number(row.match_id), row]));
    const orderedMatches = matchIds
      .map((id) => matchMap.get(Number(id)))
      .filter((row) => Boolean(row));
    const missingMatches = matchIds.filter((id) => !matchMap.has(id));
    if (missingMatches.length) {
      console.warn(
        `Match_ids presentes na fila mas ausentes em league_matches: ${missingMatches.join(', ')}`,
      );
    }

    console.log(`Fila pendente contém ${orderedMatches.length} partida(s).`);

    const pendingSeasonIds = Array.from(
      new Set(
        orderedMatches
          .map((match) => Number(match.season_id))
          .filter((value) => Number.isInteger(value) && value > 0),
      ),
    );
    const teamStatsTargets = await collectTeamStatsTargets(orderedMatches);
    summary.teamStats.synced = teamStatsTargets.size;
    summary.teamStats.list = Array.from(teamStatsTargets);
    if (teamStatsTargets.size) {
      await syncLeagueTeamStats(pendingSeasonIds, Array.from(teamStatsTargets));
    } else {
      console.log('Nenhum time precisando de atualização de league_team_stats, pulando fetch/load.');
    }

    const processedTeams = new Map();
    const trackLastxStatus = (result) => {
      if (!result?.status) return;
      if (result.status === 'fetched') summary.lastx.fetched += 1;
      else if (result.status === 'skipped') summary.lastx.skipped += 1;
      else if (result.status === 'failed') summary.lastx.failed += 1;
    };
    const analysisRecords = [];
    const queueMap = new Map(queueEntries.map((entry) => [entry.matchId, entry]));

    for (const match of orderedMatches) {
      const matchId = Number(match.match_id);
      console.log(
        `\nProcessando match ${matchId} (${match.home_team_name} x ${match.away_team_name})`,
      );
      const queueMeta = queueMap.get(matchId) || null;
      const matchRecord = {
        match_id: matchId,
        home_team_id: Number(match.home_team_id),
        away_team_id: Number(match.away_team_id),
        home_team_name: match.home_team_name,
        away_team_name: match.away_team_name,
        kickoff_time: match.kickoff_time,
        queue_status: queueMeta?.status || 'pending',
        detail: null,
        home_lastx: null,
        away_lastx: null,
      };

      try {
        matchRecord.detail = await processMatch(match);
        matchRecord.home_lastx = await processTeam(match.home_team_id, processedTeams);
        matchRecord.away_lastx = await processTeam(match.away_team_id, processedTeams);
        analysisRecords.push(matchRecord);
        await markAnalysisStatus(pool, matchId, 'dados_importados', {
          clearErrorReason: true,
        });
      } catch (err) {
        console.error(`  ↳ Falha ao atualizar match ${matchId}:`, err.message);
        matchRecord.error = err.response?.data || err.message;
        analysisRecords.push(matchRecord);
        await markAnalysisStatus(pool, matchId, queueMeta?.status || 'pending', {
          errorReason: err.response?.data || err.message,
        });
      }

      const detailStatus = matchRecord.detail?.status;
      if (detailStatus === 'fetched') summary.matches.fetched += 1;
      else if (detailStatus === 'skipped') summary.matches.skipped += 1;
      else if (detailStatus === 'failed') summary.matches.failed += 1;

      trackLastxStatus(matchRecord.home_lastx);
      trackLastxStatus(matchRecord.away_lastx);
    }

    saveAnalysisFile(range, analysisRecords);
    logSummary(summary);
  } finally {
    await closeDbPool();
  }
}

main().catch((err) => {
  console.error('daily_update falhou:', err.response?.data || err.message);
  closeDbPool().catch(() => {});
  process.exit(1);
});

