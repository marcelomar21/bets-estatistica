require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const DATA_DIR = path.join(__dirname, '..', 'data', 'json', 'league-matches');

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

function toTimestamp(dateUnix) {
  if (!dateUnix || Number.isNaN(dateUnix)) {
    return null;
  }

  const ms = Number(dateUnix) * 1000;
  if (Number.isNaN(ms)) {
    return null;
  }

  return new Date(ms).toISOString();
}

async function loadFile(filePath) {
  const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const seasonId = payload.season_id;
  const matches = Array.isArray(payload.data) ? payload.data : [];

  console.log(`Carregando ${matches.length} partidas de season_id=${seasonId} (${path.basename(filePath)})...`);

  if (!seasonId || !matches.length) {
    console.warn(`Arquivo ${filePath} inválido ou sem partidas. Ignorando.`);
    return 0;
  }

  const client = await pool.connect();
  let upserts = 0;

  try {
    await client.query('BEGIN');

    const query = `
      INSERT INTO league_matches
        (season_id, match_id, home_team_id, away_team_id, home_team_name, away_team_name,
         home_score, away_score, status, game_week, round_id, date_unix, kickoff_time,
         venue, raw_match, updated_at)
      VALUES
        ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW())
      ON CONFLICT (match_id) DO UPDATE SET
        season_id = EXCLUDED.season_id,
        home_team_id = EXCLUDED.home_team_id,
        away_team_id = EXCLUDED.away_team_id,
        home_team_name = EXCLUDED.home_team_name,
        away_team_name = EXCLUDED.away_team_name,
        home_score = EXCLUDED.home_score,
        away_score = EXCLUDED.away_score,
        status = EXCLUDED.status,
        game_week = EXCLUDED.game_week,
        round_id = EXCLUDED.round_id,
        date_unix = EXCLUDED.date_unix,
        kickoff_time = EXCLUDED.kickoff_time,
        venue = EXCLUDED.venue,
        raw_match = EXCLUDED.raw_match,
        updated_at = NOW();
    `;

    for (const match of matches) {
      if (!match?.id) {
        continue;
      }

      const params = [
        seasonId,
        match.id,
        match.homeID || null,
        match.awayID || null,
        match.home_name || null,
        match.away_name || null,
        typeof match.homeGoalCount === 'number' ? match.homeGoalCount : null,
        typeof match.awayGoalCount === 'number' ? match.awayGoalCount : null,
        match.status || null,
        match.game_week ?? null,
        match.roundID || null,
        match.date_unix || null,
        toTimestamp(match.date_unix),
        match.stadium_name || null,
        JSON.stringify(match),
      ];

      await client.query(query, params);
      upserts += 1;
    }

    await client.query('COMMIT');
    console.log(`Arquivo ${path.basename(filePath)} importado (${upserts} partidas).`);
    return upserts;
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`Erro ao importar ${filePath}:`, err.message);
    throw err;
  } finally {
    client.release();
  }
}

async function main() {
  const files = fs
    .readdirSync(DATA_DIR)
    .filter((file) => file.startsWith('season-') && file.endsWith('.json'))
    .sort();

  if (!files.length) {
    console.log('Nenhum arquivo season-*.json encontrado em league-matches.');
    return;
  }

  let total = 0;
  for (const file of files) {
    const filePath = path.join(DATA_DIR, file);
    total += await loadFile(filePath);
  }

  console.log(`Importação de partidas concluída. ${total} registros processados.`);
  await pool.end();
}

main().catch((err) => {
  console.error('Falha ao carregar league matches:', err.message);
  process.exit(1);
});

