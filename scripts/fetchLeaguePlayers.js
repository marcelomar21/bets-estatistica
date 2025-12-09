require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const https = require('https');
const { Pool } = require('pg');

const OUTPUT_DIR = path.join(__dirname, '..', 'data', 'json', 'league-players');
const BASE_URL = 'https://api.football-data-api.com/league-players';
const API_KEY = process.env.api_key;

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

async function fetchSeasonIds() {
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
    page,
  };

  const response = await axios.get(BASE_URL, {
    params,
    httpsAgent,
    headers: { 'User-Agent': 'BetsEstatistica/1.0' },
  });

  return response.data;
}

async function fetchSeasonPlayers(seasonId, label) {
  console.log(`Baixando league-players para ${label} (season_id=${seasonId})...`);

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
  console.log(`Salvo ${combined.length} jogadores em ${filePath}`);
}

async function main() {
  const seasons = await fetchSeasonIds();

  if (!seasons.length) {
    console.log('Nenhuma temporada ativa encontrada para 2025.');
    return;
  }

  for (const season of seasons) {
    await fetchSeasonPlayers(season.season_id, season.display_name);
  }

  await pool.end();
}

main().catch((err) => {
  console.error('Falha ao baixar league-players:', err.response?.data || err.message);
  process.exit(1);
});









