require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const https = require('https');
const { getPool, closePool } = require('./lib/db');

const OUTPUT_DIR = path.join(__dirname, '..', 'data', 'json', 'league-teams');
const BASE_URL = 'https://api.football-data-api.com/league-teams';
const API_KEY = process.env.FOOTYSTATS_API_KEY || process.env.api_key || process.env.API_KEY;

if (!API_KEY) {
  console.error('FOOTYSTATS_API_KEY não encontrado no .env');
  process.exit(1);
}

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const httpsAgent = new https.Agent({ rejectUnauthorized: false });
const pool = getPool();

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

const requestedSeasonIds = parseSeasonIdsArg();
const requestedTeamIds = new Set(parseTeamIdsArg());

async function fetchSeasonIds() {
  if (requestedSeasonIds.length) {
    const { rows } = await pool.query(
      `
        SELECT season_id, display_name
          FROM league_seasons
         WHERE season_id = ANY($1::int[])
         ORDER BY display_name;
      `,
      [requestedSeasonIds],
    );
    return rows;
  }

  const query = `
    SELECT season_id, display_name
      FROM league_seasons
     WHERE active = true
     ORDER BY display_name;
  `;
  const { rows } = await pool.query(query);
  return rows;
}

async function fetchPage(seasonId, page = 1) {
  const params = {
    key: API_KEY,
    season_id: seasonId,
    include: 'stats',
    page,
  };

  const response = await axios.get(BASE_URL, {
    params,
    httpsAgent,
    headers: { 'User-Agent': 'BetsEstatistica/1.0' },
  });

  return response.data;
}

async function fetchSeasonData(seasonId, label) {
  console.log(`Baixando league-teams para ${label} (season_id=${seasonId})...`);
  const combined = [];
  let page = 1;
  let maxPage = 1;

  do {
    const data = await fetchPage(seasonId, page);
    if (!Array.isArray(data.data)) {
      console.warn(`Sem dados na página ${page} para season_id=${seasonId}`);
      break;
    }
    combined.push(...data.data);
    maxPage = data.pager?.max_page || 1;
    page += 1;
  } while (page <= maxPage);

  let filtered = combined;
  if (requestedTeamIds.size) {
    filtered = combined.filter((team) => requestedTeamIds.has(Number(team.id)));
    console.log(
      `  ↳ Filtrando times solicitados: ${filtered.length}/${combined.length} registros mantidos.`,
    );
  }

  if (!filtered.length) {
    console.log('  ↳ Nenhum time solicitado encontrado nesta temporada, pulando escrita.');
    return;
  }

  const payload = {
    fetched_at: new Date().toISOString(),
    season_id: seasonId,
    label,
    data: filtered,
  };

  const filePath = path.join(OUTPUT_DIR, `season-${seasonId}.json`);
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
  console.log(`Salvo ${filtered.length} registros em ${filePath}`);
}

async function main() {
  const seasons = await fetchSeasonIds();
  if (!seasons.length) {
    if (requestedSeasonIds.length) {
      console.warn(`Nenhuma season encontrada para os IDs solicitados: ${requestedSeasonIds.join(', ')}`);
    } else {
      console.log('Nenhuma temporada ativa encontrada para 2025.');
    }
    return;
  }

  for (const season of seasons) {
    await fetchSeasonData(season.season_id, season.display_name);
  }

  await closePool();
}

main().catch((err) => {
  console.error('Falha ao baixar league-teams:', err.response?.data || err.message || err);
  closePool().catch(() => {});
  process.exit(1);
});

