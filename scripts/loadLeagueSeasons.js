require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { getPool, closePool } = require('./lib/db');

const DATA_PATH = path.join(__dirname, '..', 'data', 'json', 'league-list.json');

function normalizeName(name) {
  return (name || '').trim().toLowerCase();
}

const ACTIVE_LEAGUES = new Set(
  [
    'Brazil Serie A',
    'Brazil Copa do Brasil',
    'South America Copa Libertadores',
    'Europe UEFA Champions League',
  ].map(normalizeName),
);

if (!fs.existsSync(DATA_PATH)) {
  console.error(`Arquivo ${DATA_PATH} não encontrado.`);
  console.log('Dica: Baixe primeiro a lista de ligas da API FootyStats.');
  process.exit(1);
}

const payload = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
const leagues = Array.isArray(payload.data) ? payload.data : [];

const pool = getPool();

async function main() {
  if (!leagues.length) {
    console.log('Nenhuma liga encontrada no payload.');
    return;
  }

  const client = await pool.connect();
  let upserts = 0;

  try {
    await client.query('BEGIN');

    const query = `
      INSERT INTO league_seasons
        (league_name, country, display_name, image_url, season_id, season_year, raw_league, active, updated_at)
      VALUES
        ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      ON CONFLICT (season_id) DO UPDATE SET
        league_name = EXCLUDED.league_name,
        country = EXCLUDED.country,
        display_name = EXCLUDED.display_name,
        image_url = EXCLUDED.image_url,
        season_year = EXCLUDED.season_year,
        raw_league = EXCLUDED.raw_league,
        active = EXCLUDED.active,
        updated_at = NOW();
    `;

    for (const league of leagues) {
      const seasons = Array.isArray(league.season) ? league.season : [];

      for (const season of seasons) {
        if (!season?.id) {
          continue;
        }

        const displayName = league.name || league.league_name || null;
        const normalizedName = normalizeName(displayName);
        const isActive = normalizedName ? ACTIVE_LEAGUES.has(normalizedName) : false;

        const params = [
          league.league_name || league.name || 'UNKNOWN',
          league.country || null,
          displayName,
          league.image || null,
          season.id,
          season.year || null,
          JSON.stringify(league),
          isActive,
        ];

        await client.query(query, params);
        upserts += 1;
      }
    }

    await client.query('COMMIT');
    console.log(`Importação concluída. ${upserts} temporadas processadas.`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Erro ao importar dados:', error.message);
    throw error;
  } finally {
    client.release();
    await closePool();
  }
}

main().catch((err) => {
  console.error('Falha ao carregar league seasons:', err.message || err);
  closePool().catch(() => {});
  process.exit(1);
});

