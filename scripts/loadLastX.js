require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { getPool, closePool } = require('./lib/db');

const DATA_DIR = path.join(__dirname, '..', 'data', 'json', 'lastx');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const pool = getPool();

const toNumber = (value) => {
  if (value === null || value === undefined) return null;
  const num = Number(value);
  return Number.isNaN(num) ? null : num;
};

const buildOrderedStats = (entry) => {
  const stats = entry.stats || {};

  return {
    meta: {
      last_x: entry.last_x_match_num,
      scope: entry.last_x_home_away_or_overall,
      updated_timestamp: toNumber(entry.last_updated_match_timestamp),
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

async function loadTeamEntry(client, entry) {
  if (!entry?.id) {
    return 0;
  }

  const orderedStats = buildOrderedStats(entry);
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
    toNumber(entry.last_updated_match_timestamp),
    toNumber(entry.risk),
    entry.image || null,
    JSON.stringify(entry),
    JSON.stringify(orderedStats),
  ];

  await client.query(query, params);
  return 1;
}

async function loadFile(filePath) {
  const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const entries = payload.data?.data;

  if (!Array.isArray(entries) || !entries.length) {
    console.warn(`Arquivo ${filePath} sem entradas válidas.`);
    return 0;
  }

  const client = await pool.connect();
  let inserted = 0;

  try {
    await client.query('BEGIN');
    for (const entry of entries) {
      inserted += await loadTeamEntry(client, entry);
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`Erro ao importar ${filePath}:`, err.message);
    throw err;
  } finally {
    client.release();
  }

  console.log(`Arquivo ${path.basename(filePath)} importado (${inserted} entradas).`);
  return inserted;
}

async function main() {
  const files = fs
    .readdirSync(DATA_DIR)
    .filter((file) => file.startsWith('team-') && file.endsWith('.json'))
    .sort();

  if (!files.length) {
    console.log('Nenhum arquivo team-*.json encontrado.');
    return;
  }

  let total = 0;
  for (const file of files) {
    total += await loadFile(path.join(DATA_DIR, file));
  }

  console.log(`Importação concluída. ${total} registros processados.`);
  await closePool();
}

main().catch((err) => {
  console.error('Falha ao carregar lastx:', err.message || err);
  closePool().catch(() => {});
  process.exit(1);
});

















