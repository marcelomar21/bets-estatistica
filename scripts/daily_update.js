require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const https = require('https');
const { Pool } = require('pg');

const API_KEY = process.env.api_key || process.env.API_KEY;
if (!API_KEY) {
  console.error('api_key/API_KEY não encontrado no .env');
  process.exit(1);
}

const DATA_DIR = path.join(__dirname, '..', 'data', 'json');
const MATCH_DETAILS_DIR = path.join(DATA_DIR, 'match-details');
const LASTX_DIR = path.join(DATA_DIR, 'lastx');
const UPCOMING_DIR = path.join(DATA_DIR, 'upcoming-matches');
const ANALYZED_DIR = path.join(DATA_DIR, 'jogos-analisados');

const FRESHNESS_WINDOW_HOURS = 48;
const FRESHNESS_INTERVAL_SQL = `${FRESHNESS_WINDOW_HOURS} hours`;

[MATCH_DETAILS_DIR, LASTX_DIR, UPCOMING_DIR, ANALYZED_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: process.env.PGPORT ? Number(process.env.PGPORT) : 5432,
  database: process.env.PGDATABASE || 'bets_stats',
  user: process.env.PGUSER || 'bets',
  password: process.env.PGPASSWORD || 'bets_pass_123',
  ssl: false,
});

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

const fetchMatchesInRange = async ({ startUnix, endUnix }) => {
  const query = `
    SELECT match_id, season_id, home_team_id, away_team_id,
           home_team_name, away_team_name, date_unix, game_week, round_id, kickoff_time
      FROM league_matches
     WHERE date_unix BETWEEN $1 AND $2
     ORDER BY kickoff_time NULLS LAST, match_id;
  `;
  const { rows } = await pool.query(query, [startUnix, endUnix]);
  return rows;
};

const saveUpcomingFile = (range, matches) => {
  const filePath = path.join(UPCOMING_DIR, `${range.label}.json`);
  const payload = {
    fetched_at: new Date().toISOString(),
    range_label: range.label,
    range_hours: range.hours,
    window: {
      start_iso: range.startISO,
      end_iso: range.endISO,
      start_unix: range.startUnix,
      end_unix: range.endUnix,
    },
    total_matches: matches.length,
    matches,
  };
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
  console.log(`Agenda das próximas ${range.hours}h salva em ${filePath}`);
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

const isMatchDetailFresh = async (matchId) => {
  const query = `
    SELECT 1
      FROM stats_match_details
     WHERE match_id = $1
       AND updated_at >= NOW() - INTERVAL '${FRESHNESS_INTERVAL_SQL}'
     LIMIT 1;
  `;
  const { rowCount } = await pool.query(query, [matchId]);
  return rowCount > 0;
};

const isTeamLastXFresh = async (teamId) => {
  const query = `
    SELECT 1
      FROM team_lastx_stats
     WHERE team_id = $1
       AND updated_at >= NOW() - INTERVAL '${FRESHNESS_INTERVAL_SQL}'
     LIMIT 1;
  `;
  const { rowCount } = await pool.query(query, [teamId]);
  return rowCount > 0;
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
    const fresh = await isMatchDetailFresh(matchRow.match_id);
    if (fresh) {
      console.log('  ↳ Detalhes já atualizados nas últimas 48h, pulando coleta.');
      return { status: 'skipped', reason: 'fresh-db', match_id: matchRow.match_id };
    }

    const detailPayload = await fetchMatchDetail(matchRow.match_id);
    saveMatchDetailFile(matchRow.match_id, detailPayload);
    await upsertMatchDetail(matchRow, detailPayload);
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

  if (processedTeams.has(teamId)) {
    console.log(`  ↳ LastX do time ${teamId} já processado neste ciclo, reutilizando resultado.`);
    return { ...processedTeams.get(teamId), reused: true, team_id: teamId };
  }

  try {
    const fresh = await isTeamLastXFresh(teamId);
    if (fresh) {
      console.log(`  ↳ LastX do time ${teamId} atualizado nas últimas 48h, pulando API.`);
      const result = { status: 'skipped', reason: 'fresh-db', team_id: teamId };
      processedTeams.set(teamId, result);
      return result;
    }

    const lastxPayload = await fetchLastX(teamId);
    saveLastXFile(teamId, lastxPayload);
    await upsertLastX(lastxPayload);
    const result = { status: 'fetched', fetched_at: lastxPayload.fetched_at, team_id: teamId };
    processedTeams.set(teamId, result);
    return result;
  } catch (err) {
    const message = err.response?.data || err.message;
    console.error(`  ↳ Falha ao processar lastx do time ${teamId}:`, message);
    const result = { status: 'failed', message, team_id: teamId };
    processedTeams.set(teamId, result);
    return result;
  }
};

async function main() {
  const range = getRollingRange(FRESHNESS_WINDOW_HOURS);
  console.log(`Buscando partidas entre ${range.startISO} e ${range.endISO} (unix ${range.startUnix}..${range.endUnix})`);

  try {
    const matches = await fetchMatchesInRange(range);
    if (!matches.length) {
      console.log('Nenhuma partida encontrada para as próximas 48 horas.');
      saveUpcomingFile(range, []);
      saveAnalysisFile(range, []);
      return;
    }

    console.log(`Encontradas ${matches.length} partidas no intervalo ${range.label}.`);
    saveUpcomingFile(range, matches);

    const processedTeams = new Map();
    const analysisRecords = [];
    for (const match of matches) {
      console.log(`\nProcessando match ${match.match_id} (${match.home_team_name} x ${match.away_team_name})`);
      const matchRecord = {
        match_id: match.match_id,
        home_team_id: match.home_team_id,
        away_team_id: match.away_team_id,
        home_team_name: match.home_team_name,
        away_team_name: match.away_team_name,
        kickoff_time: match.kickoff_time,
        detail: null,
        home_lastx: null,
        away_lastx: null,
      };

      matchRecord.detail = await processMatch(match);
      matchRecord.home_lastx = await processTeam(match.home_team_id, processedTeams);
      matchRecord.away_lastx = await processTeam(match.away_team_id, processedTeams);
      analysisRecords.push(matchRecord);
    }

    saveAnalysisFile(range, analysisRecords);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('daily_update falhou:', err.response?.data || err.message);
  pool.end().catch(() => {});
  process.exit(1);
});

