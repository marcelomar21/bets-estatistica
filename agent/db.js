require('dotenv').config();

const { Pool } = require('pg');

const connectionConfig = {
  host: process.env.PGHOST || 'localhost',
  port: process.env.PGPORT ? Number(process.env.PGPORT) : 5432,
  database: process.env.PGDATABASE || 'bets_stats',
  user: process.env.PGUSER || 'bets',
  password: process.env.PGPASSWORD || 'bets_pass_123',
  ssl:
    process.env.PGSSL === 'true'
      ? { rejectUnauthorized: process.env.PGSSL_REJECT_UNAUTHORIZED === 'true' }
      : false,
};

let pool;

const getPool = () => {
  if (!pool) {
    pool = new Pool(connectionConfig);
    pool.on('error', (err) => {
      console.error('[agent][db] Erro inesperado no pool PG:', err);
    });
  }
  return pool;
};

const runQuery = async (queryText, params = []) => {
  if (!queryText || typeof queryText !== 'string') {
    throw new Error('SQL inválido para runQuery');
  }

  const client = await getPool().connect();
  try {
    const start = Date.now();
    const result = await client.query(queryText, params);
    const duration = Date.now() - start;
    console.debug(`[agent][db] ${queryText.split('\n')[0]} (${duration}ms)`);
    return result;
  } finally {
    client.release();
  }
};

const closePool = async () => {
  if (pool) {
    await pool.end();
    pool = null;
  }
};

module.exports = {
  getPool,
  runQuery,
  closePool,
};


