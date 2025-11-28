require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const DATA_DIR = path.join(__dirname, '..', 'data', 'json', 'match-details');

if (!fs.existsSync(DATA_DIR)) {
  console.error(`Diretório ${DATA_DIR} não encontrado. Rode o fetch antes de carregar os dados.`);
  process.exit(1);
}

const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: process.env.PGPORT ? Number(process.env.PGPORT) : 5432,
  database: process.env.PGDATABASE || 'bets_stats',
  user: process.env.PGUSER || 'bets',
  password: process.env.PGPASSWORD || 'bets_pass_123',
  ssl: false,
});

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

const buildOrderedStats = (detail, matchRow) => {
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

async function loadFile(client, filePath) {
  const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const detail = payload.data?.data;

  if (!detail || !detail.id) {
    console.warn(`Arquivo ${filePath} sem dados válidos de partida. Pulando.`);
    return 0;
  }

  const matchId = detail.id;

  const matchRes = await client.query(
    `SELECT season_id, home_team_id, away_team_id, home_team_name, away_team_name,
            home_score, away_score, status
       FROM league_matches
      WHERE match_id = $1`,
    [matchId],
  );

  if (!matchRes.rowCount) {
    console.warn(`Match ${matchId} não encontrado em league_matches. Pulando.`);
    return 0;
  }

  const matchRow = matchRes.rows[0];
  const orderedStats = buildOrderedStats(detail, matchRow);

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
    matchId,
    matchRow.season_id,
    matchRow.home_team_id,
    matchRow.away_team_id,
    matchRow.home_team_name,
    matchRow.away_team_name,
    matchRow.home_score,
    matchRow.away_score,
    detail.status || matchRow.status,
    detail.roundID ? `Round ${detail.roundID}` : null,
    detail.refereeID ? String(detail.refereeID) : null,
    detail.stadium_name || null,
    normalizeValue(detail.attendance),
    JSON.stringify(payload.data),
    JSON.stringify(orderedStats),
  ];

  await client.query(query, params);
  console.log(`Detalhes do match ${matchId} importados.`);
  return 1;
}

async function main() {
  const files = fs
    .readdirSync(DATA_DIR)
    .filter((file) => file.startsWith('match-') && file.endsWith('.json'))
    .sort();

  if (!files.length) {
    console.log('Nenhum arquivo match-*.json encontrado.');
    return;
  }

  const client = await pool.connect();
  let total = 0;

  try {
    for (const file of files) {
      const filePath = path.join(DATA_DIR, file);
      total += await loadFile(client, filePath);
    }
  } finally {
    client.release();
    await pool.end();
  }

  console.log(`Importação finalizada: ${total} partidas detalhadas processadas.`);
}

main().catch((err) => {
  console.error('Falha ao carregar detalhes de partidas:', err.message);
  process.exit(1);
});

