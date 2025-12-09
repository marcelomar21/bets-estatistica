require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const https = require('https');

const API_KEY = process.env.api_key;
const OUTPUT_DIR = path.join(__dirname, '..', 'data', 'json', 'lastx');
const BASE_URL = 'https://api.football-data-api.com/lastx';

const TEAMS = [
  { id: 612, name: 'Flamengo' },
  { id: 619, name: 'Palmeiras' },
];

if (!API_KEY) {
  console.error('api_key não encontrado no .env');
  process.exit(1);
}

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

async function fetchLastX(team) {
  console.log(`Buscando últimos jogos para ${team.name} (team_id=${team.id})...`);

  const response = await axios.get(BASE_URL, {
    params: {
      key: API_KEY,
      team_id: team.id,
    },
    httpsAgent,
    headers: { 'User-Agent': 'BetsEstatistica/1.0' },
  });

  const payload = {
    fetched_at: new Date().toISOString(),
    team_id: team.id,
    team_name: team.name,
    data: response.data,
  };

  const filePath = path.join(OUTPUT_DIR, `team-${team.id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
  console.log(`Salvo em ${filePath}`);
}

async function main() {
  for (const team of TEAMS) {
    await fetchLastX(team);
  }
}

main().catch((err) => {
  console.error('Falha ao baixar lastx:', err.response?.data || err.message);
  process.exit(1);
});









