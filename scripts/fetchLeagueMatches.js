require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const https = require('https');
const { getPool, closePool } = require('./lib/db');

const OUTPUT_DIR = path.join(__dirname, '..', 'data', 'json', 'league-matches');
const BASE_URL = 'https://api.football-data-api.com/league-matches';
const API_KEY = process.env.FOOTYSTATS_API_KEY || process.env.api_key || process.env.API_KEY;
const SEASON_IDS_ARG = '--season-ids';

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
    // Try to get from DB first
    try {
      const { rows } = await pool.query(
        `
          SELECT season_id, display_name
            FROM league_seasons
           WHERE season_id = ANY($1::int[])
        `,
        [seasonIdsFilter],
      );
      const found = rows.map(r => r.season_id);
      const missing = seasonIdsFilter.filter(id => !found.includes(id));
      
      // For missing ones, create placeholder entries to fetch anyway
      seasons = [
        ...rows,
        ...missing.map(id => ({ season_id: id, display_name: `Season ${id}` }))
      ];
      
      if (missing.length) {
        console.log(`Season IDs não estão no BD, buscando direto da API: ${missing.join(', ')}`);
      }
    } catch (err) {
      // If DB query fails, just use the IDs directly
      console.log('Tabela league_seasons não disponível, buscando direto da API...');
      seasons = seasonIdsFilter.map(id => ({ season_id: id, display_name: `Season ${id}` }));
    }
  } else {
    seasons = await fetchSeasonIds();
  }

  if (!seasons.length) {
    console.log('Nenhuma temporada disponível para download.');
    console.log('Dica: Use --season-ids=ID para buscar direto (ex: --season-ids=7883)');
    await closePool();
    return;
  }

  for (const season of seasons) {
    await fetchSeasonMatches(season.season_id, season.display_name);
  }

  await closePool();
}

main().catch((err) => {
  console.error('Falha ao baixar league-matches:', err.response?.data || err.message || err);
  closePool().catch(() => {});
  process.exit(1);
});

