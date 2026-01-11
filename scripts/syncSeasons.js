#!/usr/bin/env node
/**
 * Sincroniza temporadas ativas:
 * 1. Busca ligas da API FootyStats
 * 2. Identifica temporadas atuais
 * 3. Carrega no banco de dados
 * 4. Busca jogos dessas temporadas
 * 5. Carrega jogos no banco
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const https = require('https');
const { getPool, closePool } = require('./lib/db');

const DATA_DIR = path.join(__dirname, '..', 'data', 'json');
const LEAGUE_MATCHES_DIR = path.join(DATA_DIR, 'league-matches');
const LEAGUES_API = 'https://api.football-data-api.com/league-list';
const MATCHES_API = 'https://api.football-data-api.com/league-matches';
const API_KEY = process.env.FOOTYSTATS_API_KEY || process.env.api_key || process.env.API_KEY;

if (!API_KEY) {
  console.error('FOOTYSTATS_API_KEY não encontrado no .env');
  process.exit(1);
}

[DATA_DIR, LEAGUE_MATCHES_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const httpsAgent = new https.Agent({ rejectUnauthorized: false });
const pool = getPool();

// Ligas alvo
const TARGET_LEAGUES = [
  'brazil serie a',
  'brazil copa do brasil',
  'south america copa libertadores',
  'europe uefa champions league',
];

function normalizeLeagueName(name) {
  return (name || '').toLowerCase().trim();
}

function toTimestamp(dateUnix) {
  if (!dateUnix || Number.isNaN(dateUnix)) return null;
  const ms = Number(dateUnix) * 1000;
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

async function fetchLeagues() {
  console.log('📡 Buscando lista de ligas...');
  const response = await axios.get(LEAGUES_API, {
    params: { key: API_KEY, chosen_leagues_only: false },
    httpsAgent,
    headers: { 'User-Agent': 'BetsEstatistica/1.0' },
  });
  return Array.isArray(response.data?.data) ? response.data.data : [];
}

function getActiveSeasons(leagues) {
  const currentYear = new Date().getFullYear();
  const results = [];

  for (const league of leagues) {
    const leagueName = normalizeLeagueName(league.name || league.league_name);
    const isTarget = TARGET_LEAGUES.some(target => leagueName.includes(target));
    if (!isTarget) continue;

    const seasons = Array.isArray(league.season) ? league.season : [];
    for (const season of seasons) {
      const year = String(season.year || '');
      // Aceita temporadas do ano atual ou que incluem o ano atual
      if (year.includes(String(currentYear)) || year.includes(String(currentYear - 1))) {
        results.push({
          season_id: season.id,
          year: season.year,
          league_name: league.name || league.league_name,
          country: league.country,
          image: league.image,
          raw_league: league,
        });
      }
    }
  }

  return results;
}

async function upsertSeasons(seasons) {
  console.log(`\n📥 Salvando ${seasons.length} temporadas no banco...`);
  
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    const query = `
      INSERT INTO league_seasons
        (league_name, country, display_name, image_url, season_id, season_year, raw_league, active, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, true, NOW())
      ON CONFLICT (season_id) DO UPDATE SET
        league_name = EXCLUDED.league_name,
        country = EXCLUDED.country,
        display_name = EXCLUDED.display_name,
        image_url = EXCLUDED.image_url,
        season_year = EXCLUDED.season_year,
        raw_league = EXCLUDED.raw_league,
        active = true,
        updated_at = NOW();
    `;

    for (const season of seasons) {
      await client.query(query, [
        season.league_name,
        season.country,
        season.league_name,
        season.image,
        season.season_id,
        season.year,
        JSON.stringify(season.raw_league),
      ]);
    }

    await client.query('COMMIT');
    console.log(`   ✅ ${seasons.length} temporadas salvas`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function fetchSeasonMatches(seasonId, label) {
  console.log(`   📡 Buscando jogos: ${label}...`);
  
  const combined = [];
  let page = 1;
  let maxPage = 1;

  do {
    const response = await axios.get(MATCHES_API, {
      params: { key: API_KEY, season_id: seasonId, include: 'stats', page },
      httpsAgent,
      headers: { 'User-Agent': 'BetsEstatistica/1.0' },
    });

    if (!Array.isArray(response.data?.data)) break;
    
    combined.push(...response.data.data);
    maxPage = response.data.pager?.max_page || 1;
    page += 1;
  } while (page <= maxPage);

  // Salvar em arquivo
  const filePath = path.join(LEAGUE_MATCHES_DIR, `season-${seasonId}.json`);
  fs.writeFileSync(filePath, JSON.stringify({
    fetched_at: new Date().toISOString(),
    season_id: seasonId,
    label,
    pages: maxPage,
    data: combined,
  }, null, 2));

  console.log(`      → ${combined.length} jogos encontrados`);
  return combined;
}

async function upsertMatches(seasonId, matches) {
  if (!matches.length) return 0;
  
  const client = await pool.connect();
  let upserts = 0;

  try {
    await client.query('BEGIN');

    const query = `
      INSERT INTO league_matches
        (season_id, match_id, home_team_id, away_team_id, home_team_name, away_team_name,
         home_score, away_score, status, game_week, round_id, date_unix, kickoff_time,
         venue, raw_match, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW())
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
      if (!match?.id) continue;

      await client.query(query, [
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
      ]);
      upserts += 1;
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  return upserts;
}

async function main() {
  console.log('🚀 Sincronização de Temporadas\n');
  console.log('═'.repeat(60));

  try {
    // 1. Buscar ligas
    const leagues = await fetchLeagues();
    console.log(`   Total de ligas na API: ${leagues.length}`);

    // 2. Filtrar temporadas ativas
    const activeSeasons = getActiveSeasons(leagues);
    console.log(`\n📋 Temporadas ativas encontradas: ${activeSeasons.length}`);
    
    for (const s of activeSeasons) {
      console.log(`   • ${s.league_name} (${s.year}) → ID: ${s.season_id}`);
    }

    if (!activeSeasons.length) {
      console.log('\n⚠️  Nenhuma temporada ativa encontrada!');
      await closePool();
      return;
    }

    // 3. Salvar temporadas no banco
    await upsertSeasons(activeSeasons);

    // 4. Buscar e salvar jogos de cada temporada
    console.log('\n📥 Buscando jogos das temporadas...');
    let totalMatches = 0;

    for (const season of activeSeasons) {
      const matches = await fetchSeasonMatches(season.season_id, `${season.league_name} ${season.year}`);
      const saved = await upsertMatches(season.season_id, matches);
      totalMatches += saved;
      console.log(`      ✅ ${saved} jogos salvos no banco`);
    }

    console.log('\n' + '═'.repeat(60));
    console.log(`🎉 Sincronização concluída!`);
    console.log(`   • ${activeSeasons.length} temporadas`);
    console.log(`   • ${totalMatches} jogos`);
    console.log('═'.repeat(60));

  } catch (err) {
    console.error('\n❌ Erro:', err.response?.data || err.message);
    process.exit(1);
  } finally {
    await closePool();
  }
}

main();
