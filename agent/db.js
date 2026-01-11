/**
 * Database adapter - supports both local PostgreSQL and Supabase
 * Story 6.4: Migrar para Supabase quando SUPABASE_URL está definido
 */
require('dotenv').config();

const { Pool } = require('pg');

// Detect if using Supabase or local PG
const useSupabase = !!process.env.SUPABASE_URL;

// Supabase connection (uses pooler URL from Supabase)
const getSupabaseConnectionConfig = () => {
  const url = process.env.SUPABASE_URL;
  if (!url) return null;
  
  // Extract project ref from URL (e.g., https://xxx.supabase.co)
  const projectRef = url.replace('https://', '').split('.')[0];
  
  return {
    host: `aws-0-sa-east-1.pooler.supabase.com`,
    port: 6543,
    database: 'postgres',
    user: `postgres.${projectRef}`,
    password: process.env.SUPABASE_DB_PASSWORD || process.env.SUPABASE_SERVICE_KEY,
    ssl: { rejectUnauthorized: false },
  };
};

// Local PostgreSQL connection
const getLocalConnectionConfig = () => ({
  host: process.env.PGHOST || 'localhost',
  port: process.env.PGPORT ? Number(process.env.PGPORT) : 5432,
  database: process.env.PGDATABASE || 'bets_stats',
  user: process.env.PGUSER || 'bets',
  password: process.env.PGPASSWORD || 'bets_pass_123',
  ssl:
    process.env.PGSSL === 'true'
      ? { rejectUnauthorized: process.env.PGSSL_REJECT_UNAUTHORIZED === 'true' }
      : false,
});

const connectionConfig = useSupabase 
  ? getSupabaseConnectionConfig() 
  : getLocalConnectionConfig();

let pool;

const getPool = () => {
  if (!pool) {
    pool = new Pool(connectionConfig);
    pool.on('error', (err) => {
      console.error('[agent][db] Erro inesperado no pool PG:', err);
    });
    if (useSupabase) {
      console.log('[agent][db] Usando Supabase como banco de dados');
    }
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
  useSupabase,
};


