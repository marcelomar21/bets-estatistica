require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const DATA_PATH = path.join(__dirname, '..', 'data', 'json', 'country-list.json');
const ACTIVE_COUNTRIES = new Set(['brazil']);

if (!fs.existsSync(DATA_PATH)) {
  console.error(`Arquivo ${DATA_PATH} não encontrado. Rode o download antes de carregar os dados.`);
  process.exit(1);
}

const payload = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
const countries = Array.isArray(payload.data) ? payload.data : [];

const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: process.env.PGPORT ? Number(process.env.PGPORT) : 5432,
  database: process.env.PGDATABASE || 'bets_stats',
  user: process.env.PGUSER || 'bets',
  password: process.env.PGPASSWORD || 'bets_pass_123',
  ssl: false,
});

const TRANSLATION_KEYS = [
  'name_jp',
  'name_tr',
  'name_kr',
  'name_pt',
  'name_ru',
  'name_es',
  'name_nl',
  'name_se',
  'name_de',
];

async function main() {
  if (!countries.length) {
    console.log('Nenhum país disponível no payload.');
    return;
  }

  const client = await pool.connect();
  let upserts = 0;

  try {
    await client.query('BEGIN');

    const query = `
      INSERT INTO countries
        (source_id, iso, iso_number, name_en, translations, raw_country, active, updated_at)
      VALUES
        ($1, $2, $3, $4, $5, $6, $7, NOW())
      ON CONFLICT (source_id) DO UPDATE SET
        iso = EXCLUDED.iso,
        iso_number = EXCLUDED.iso_number,
        name_en = EXCLUDED.name_en,
        translations = EXCLUDED.translations,
        raw_country = EXCLUDED.raw_country,
        active = EXCLUDED.active,
        updated_at = NOW();
    `;

    for (const country of countries) {
      if (!country?.id || !country.country || !country.iso) {
        continue;
      }

      const translations = {};
      for (const key of TRANSLATION_KEYS) {
        if (country[key]) {
          translations[key] = country[key];
        }
      }

      const nameEn = country.country.trim();
      const params = [
        country.id,
        country.iso.trim().toLowerCase(),
        country.iso_number || null,
        nameEn,
        Object.keys(translations).length ? JSON.stringify(translations) : null,
        JSON.stringify(country),
        ACTIVE_COUNTRIES.has(nameEn.toLowerCase()),
      ];

      await client.query(query, params);
      upserts += 1;
    }

    await client.query('COMMIT');
    console.log(`Importação de países concluída. ${upserts} registros processados.`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Erro ao importar países:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(() => process.exit(1));

