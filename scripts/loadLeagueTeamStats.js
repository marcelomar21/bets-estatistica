require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const DATA_DIR = path.join(__dirname, '..', 'data', 'json', 'league-teams');

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

const parseSeasonIdsArg = () => {
  const args = process.argv.slice(2);
  let rawValue = null;
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token.startsWith('--season-ids=')) {
      rawValue = token.split('=')[1];
      break;
    }
    if (token === '--season-ids') {
      rawValue = args[index + 1];
      break;
    }
  }
  if (!rawValue) {
    return [];
  }
  return rawValue
    .split(',')
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value) && value > 0);
};

const requestedSeasonIds = parseSeasonIdsArg();

const parseTeamIdsArg = () => {
  const args = process.argv.slice(2);
  let rawValue = null;
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token.startsWith('--team-ids=')) {
      rawValue = token.split('=')[1];
      break;
    }
    if (token === '--team-ids') {
      rawValue = args[index + 1];
      break;
    }
  }
  if (!rawValue) {
    return [];
  }
  return rawValue
    .split(',')
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value) && value > 0);
};

const requestedTeamIds = new Set(parseTeamIdsArg());

async function loadFile(filePath) {
  const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const seasonId = payload.season_id;
  const fetchedAt = payload.fetched_at || new Date().toISOString();
  const label = payload.label || '';
  let teams = Array.isArray(payload.data) ? payload.data : [];

  console.log(`Carregando ${teams.length} times de ${label} (season_id=${seasonId})...`);

  if (!seasonId) {
    console.warn(`season_id ausente no arquivo ${filePath}, ignorando.`);
    return 0;
  }

  if (!teams.length) {
    console.warn(`Nenhum time no arquivo ${filePath}, ignorando.`);
    return 0;
  }

  if (requestedTeamIds.size) {
    teams = teams.filter((team) => requestedTeamIds.has(Number(team?.id)));
    if (!teams.length) {
      console.warn(
        `Nenhum dos times solicitados (${Array.from(requestedTeamIds).join(', ')}) está presente em ${filePath}, ignorando.`,
      );
      return 0;
    }
  }

  const client = await pool.connect();
  let upserts = 0;

  try {
    await client.query('BEGIN');
    const query = `
      INSERT INTO league_team_stats
        (season_id, team_id, team_name, team_clean_name, team_short_name, country, table_position, fetched_at, raw_team, stats, updated_at)
      VALUES
        ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
      ON CONFLICT (season_id, team_id) DO UPDATE SET
        team_name = EXCLUDED.team_name,
        team_clean_name = EXCLUDED.team_clean_name,
        team_short_name = EXCLUDED.team_short_name,
        country = EXCLUDED.country,
        table_position = EXCLUDED.table_position,
        fetched_at = EXCLUDED.fetched_at,
        raw_team = EXCLUDED.raw_team,
        stats = EXCLUDED.stats,
        updated_at = NOW();
    `;

    for (const team of teams) {
      if (!team?.id) {
        continue;
      }

      const params = [
        seasonId,
        team.id,
        team.name || team.cleanName || team.english_name || 'UNKNOWN',
        team.cleanName || null,
        team.shortHand || null,
        team.country || null,
        team.table_position || null,
        fetchedAt,
        JSON.stringify(team),
        team.stats ? JSON.stringify(team.stats) : null,
      ];

      await client.query(query, params);
      upserts += 1;
    }

    await client.query('COMMIT');
    console.log(`Arquivo ${path.basename(filePath)} importado (${upserts} registros).`);
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
  let files;
  if (requestedSeasonIds.length) {
    files = requestedSeasonIds
      .map((id) => `season-${id}.json`)
      .filter((file) => fs.existsSync(path.join(DATA_DIR, file)));
    if (!files.length) {
      console.warn(
        `Nenhum arquivo encontrado para os season_ids solicitados: ${requestedSeasonIds.join(', ')}`,
      );
      return;
    }
  } else {
    files = fs
      .readdirSync(DATA_DIR)
      .filter((file) => file.startsWith('season-') && file.endsWith('.json'))
      .sort();

  if (!files.length) {
    console.log('Nenhum arquivo season-*.json encontrado em league-teams.');
    return;
  }
  }

  let total = 0;
  for (const file of files) {
    const filePath = path.join(DATA_DIR, file);
    total += await loadFile(filePath);
  }

  console.log(`Importação concluída. ${total} times processados.`);
  await pool.end();
}

main().catch((err) => {
  console.error('Falha ao carregar league team stats:', err.message);
  process.exit(1);
});

