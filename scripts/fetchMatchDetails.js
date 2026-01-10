require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const https = require('https');

const API_KEY = process.env.api_key;
const OUTPUT_DIR = path.join(__dirname, '..', 'data', 'json', 'match-details');
const BASE_URL = 'https://api.football-data-api.com/match';

if (!API_KEY) {
  console.error('api_key não encontrado no .env');
  process.exit(1);
}

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

async function fetchMatch(matchId) {
  if (!matchId) {
    throw new Error('match_id é obrigatório');
  }

  console.log(`Buscando detalhes do match_id=${matchId}...`);

  const response = await axios.get(BASE_URL, {
    params: {
      key: API_KEY,
      match_id: matchId,
    },
    httpsAgent,
    headers: { 'User-Agent': 'BetsEstatistica/1.0' },
  });

  const payload = {
    fetched_at: new Date().toISOString(),
    match_id: matchId,
    data: response.data,
  };

  const filePath = path.join(OUTPUT_DIR, `match-${matchId}.json`);
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
  console.log(`Detalhes salvos em ${filePath}`);
}

async function main() {
  const matchIdArg = process.argv[2];
  const matchId = Number(matchIdArg);

  if (!matchIdArg || Number.isNaN(matchId)) {
    console.error('Uso: node scripts/fetchMatchDetails.js <match_id>');
    process.exit(1);
  }

  await fetchMatch(matchId);
}

main().catch((err) => {
  console.error('Falha ao baixar detalhes da partida:', err.response?.data || err.message);
  process.exit(1);
});

















