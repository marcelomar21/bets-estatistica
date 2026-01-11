/**
 * Database connection for ETL scripts
 * Uses the same connection logic as agent/db.js
 */
require('dotenv').config();

// Force IPv4 to avoid timeout issues with IPv6
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

const { Pool } = require('pg');

// Detect if using Supabase or local PG
const useSupabase = !!process.env.SUPABASE_URL;

// Supabase connection via Session Pooler (IPv4, works through firewalls)
const getSupabaseConnectionConfig = () => {
  // Use DATABASE_URL if provided (recommended - copy from Supabase Dashboard)
  if (process.env.DATABASE_URL) {
    return {
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    };
  }

  // Fallback: build from components
  const url = process.env.SUPABASE_URL;
  if (!url) return null;
  
  // Extract project ref from URL (e.g., https://xxx.supabase.co)
  const projectRef = url.replace('https://', '').split('.')[0];
  const password = process.env.SUPABASE_DB_PASSWORD;
  
  if (!password) {
    console.error('[db] SUPABASE_DB_PASSWORD não configurada!');
    console.error('[db] Obtenha em: Supabase Dashboard → Settings → Database → Database Password');
    return null;
  }
  
  // Use Session Pooler (port 5432, but via pooler subdomain with IPv4)
  return {
    connectionString: `postgresql://postgres.${projectRef}:${password}@aws-0-sa-east-1.pooler.supabase.com:5432/postgres`,
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
      console.error('[db] Erro inesperado no pool PG:', err);
    });
    if (useSupabase) {
      console.log('[db] Usando Supabase como banco de dados');
    }
  }
  return pool;
};

const closePool = async () => {
  if (pool) {
    await pool.end();
    pool = null;
  }
};

module.exports = {
  getPool,
  closePool,
  useSupabase,
};
