#!/usr/bin/env node
/**
 * Busca lista de ligas e temporadas da API FootyStats
 * Salva em data/json/league-list.json
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const https = require('https');

const OUTPUT_DIR = path.join(__dirname, '..', 'data', 'json');
const OUTPUT_PATH = path.join(OUTPUT_DIR, 'league-list.json');
const BASE_URL = 'https://api.football-data-api.com/league-list';
const API_KEY = process.env.FOOTYSTATS_API_KEY || process.env.api_key || process.env.API_KEY;

if (!API_KEY) {
  console.error('FOOTYSTATS_API_KEY não encontrado no .env');
  process.exit(1);
}

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

// Ligas habilitadas no FootyStats (Story 10.3)
const TARGET_LEAGUES = [
  // Europe - Top 5 leagues
  'spain la liga',
  'england premier league',
  'italy serie a',
  'germany bundesliga',
  'france ligue 1',
  // Brazil - Serie A + Estaduais
  'brazil serie a',
  'brazil mineiro 1',
  'brazil carioca 1',
  'brazil paulista a1',
  'brazil paranaense 1',
  'brazil copa do nordeste',
];

function normalizeLeagueName(name) {
  return (name || '').toLowerCase().trim();
}

// Exclude women's and youth leagues
function isExcluded(name) {
  const lower = (name || '').toLowerCase();
  return lower.includes('women') || lower.includes('feminino') ||
         lower.includes('femenil') || lower.includes('u19') ||
         lower.includes('u20') || lower.includes('u21') ||
         lower.includes('u23') || lower.includes('youth') ||
         lower.includes('cup u') || lower.includes('play') ||
         lower.includes('summer series');
}

async function fetchLeagues() {
  console.log('Buscando lista de ligas da API FootyStats...');
  
  const response = await axios.get(BASE_URL, {
    params: { 
      key: API_KEY,
      chosen_leagues_only: false,
    },
    httpsAgent,
    headers: { 'User-Agent': 'BetsEstatistica/1.0' },
  });

  return response.data;
}

function filterActiveSeasons(leagues) {
  const currentYear = new Date().getFullYear();
  const results = [];

  for (const league of leagues) {
    const leagueName = normalizeLeagueName(league.name || league.league_name);
    const isTarget = TARGET_LEAGUES.some(target => leagueName.includes(target));

    if (!isTarget) continue;
    if (isExcluded(league.name || league.league_name)) continue;

    // Só temporada ATUAL: termina no ano atual (20252026 ou 2026)
    const seasons = Array.isArray(league.season) ? league.season : [];
    const activeSeasons = seasons.filter(s => {
      const year = String(s.year || '');
      return year.endsWith(String(currentYear));
    });

    if (activeSeasons.length > 0) {
      results.push({
        name: league.name || league.league_name,
        country: league.country,
        image: league.image,
        seasons: activeSeasons.map(s => ({
          id: s.id,
          year: s.year,
        })),
      });
    }
  }

  return results;
}

async function main() {
  try {
    const response = await fetchLeagues();
    const leagues = Array.isArray(response.data) ? response.data : [];
    
    console.log(`Total de ligas na API: ${leagues.length}`);
    
    // Salvar resposta completa
    const payload = {
      fetched_at: new Date().toISOString(),
      total: leagues.length,
      data: leagues,
    };
    
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(payload, null, 2));
    console.log(`Lista completa salva em ${OUTPUT_PATH}`);
    
    // Filtrar e mostrar temporadas ativas
    const activeLeagues = filterActiveSeasons(leagues);
    
    console.log('\n📋 Temporadas ativas encontradas:');
    console.log('─'.repeat(60));
    
    for (const league of activeLeagues) {
      for (const season of league.seasons) {
        console.log(`  ${league.name} (${season.year}) → season_id: ${season.id}`);
      }
    }
    
    console.log('─'.repeat(60));
    console.log(`\nTotal: ${activeLeagues.reduce((acc, l) => acc + l.seasons.length, 0)} temporadas ativas`);
    
    // Salvar resumo das temporadas ativas
    const activePath = path.join(OUTPUT_DIR, 'active-seasons.json');
    fs.writeFileSync(activePath, JSON.stringify({
      fetched_at: new Date().toISOString(),
      leagues: activeLeagues,
      season_ids: activeLeagues.flatMap(l => l.seasons.map(s => s.id)),
    }, null, 2));
    console.log(`\nTemporadas ativas salvas em ${activePath}`);
    
  } catch (err) {
    console.error('Falha ao buscar ligas:', err.response?.data || err.message);
    process.exit(1);
  }
}

main();
