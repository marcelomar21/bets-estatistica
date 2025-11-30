require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const https = require('https');
const { Pool } = require('pg');

const OUTPUT_DIR = path.join(__dirname, '..', 'data', 'json', 'league-matches');
const BASE_URL = 'https://api.football-data-api.com/league-matches';
const API_KEY = process.env.api_key;
const SEASON_IDS_ARG = '--season-ids';

if (!API_KEY) {
  console.error('api_key não encontrado no .env');
  process.exit(1);
}

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: process.env.PGPORT ? Number(process.env.PGPORT) : 5432,
  database: process.env.PGDATABASE || 'bets_stats',
  user: process.env.PGUSER || 'bets',
  password: process.env.PGPASSWORD || 'bets_pass_123',
  ssl: false,
});

const parseSeasonIdsArg = () => {
  const arg = process.argv.find((token) => token.startsWith(`${SEASON_IDS_ARG}=`));
  const envValue = process.env.SEASON_IDS;
  const raw = arg ? arg.substring(SEASON_IDS_ARG.length + 1) : envValue;
  if (!raw) {
    return [];
  }

  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => Number(entry))
    .filter((value) => Number.isInteger(value) && value > 0);
};

async function fetchSeasonIds() {
  const query = `
    SELECT season_id, display_name
      FROM league_seasons
     WHERE active = true
       AND season_year = 2025
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

async function fetchSeasonMatches(seasonId, label) {
  console.log(`Baixando league-matches para ${label} (season_id=${seasonId})...`);

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

  const payload = {
    fetched_at: new Date().toISOString(),
    season_id: seasonId,
    label,
    pages: maxPage,
    data: combined,
  };

  const filePath = path.join(OUTPUT_DIR, `season-${seasonId}.json`);
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
  console.log(`Salvo ${combined.length} partidas em ${filePath}`);
}

async function main() {
  const seasonIdsFilter = parseSeasonIdsArg();
  let seasons;
  if (seasonIdsFilter.length) {
    const { rows } = await pool.query(
      `
        SELECT season_id, display_name
          FROM league_seasons
         WHERE season_id = ANY($1::int[])
      `,
      [seasonIdsFilter],
    );
    const missing = seasonIdsFilter.filter(
      (id) => !rows.some((season) => season.season_id === id),
    );
    if (missing.length) {
      console.warn(`Season IDs não encontrados na tabela league_seasons: ${missing.join(', ')}`);
    }
    seasons = rows;
  } else {
    seasons = await fetchSeasonIds();
  }

  if (!seasons.length) {
    console.log('Nenhuma temporada disponível para download.');
    await pool.end();
    return;
  }

  for (const season of seasons) {
    await fetchSeasonMatches(season.season_id, season.display_name);
  }

  await pool.end();
}

main().catch((err) => {
  console.error('Falha ao baixar league-matches:', err.response?.data || err.message);
  process.exit(1);
});

