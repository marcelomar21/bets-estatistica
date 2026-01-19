/**
 * Database adapter - supports both local PostgreSQL and Supabase
 *
 * This is the SINGLE SOURCE OF TRUTH for PostgreSQL connections.
 * Both agent/ and scripts/ modules should use this.
 *
 * For Supabase REST API, use lib/supabase.js instead.
 */
require('dotenv').config();

// Force IPv4 to avoid timeout issues with IPv6
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

const { Pool } = require('pg');
const logger = require('./logger');

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
    logger.error('SUPABASE_DB_PASSWORD not configured');
    logger.error('Get it from: Supabase Dashboard -> Settings -> Database -> Database Password');
    return null;
  }

  // Use Session Pooler (port 5432, but via pooler subdomain with IPv4)
  return {
    connectionString: `postgresql://postgres.${projectRef}:${password}@aws-0-sa-east-1.pooler.supabase.com:5432/postgres`,
    ssl: { rejectUnauthorized: false },
  };
};

// Local PostgreSQL connection
const getLocalConnectionConfig = () => {
  // Validate required credentials - no hardcoded defaults for security
  if (!process.env.PGPASSWORD) {
    logger.error('PGPASSWORD not configured');
    logger.error('Configure PostgreSQL environment variables in .env');
    return null;
  }

  return {
    host: process.env.PGHOST || 'localhost',
    port: process.env.PGPORT ? Number(process.env.PGPORT) : 5432,
    database: process.env.PGDATABASE || 'bets_stats',
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD,
    ssl:
      process.env.PGSSL === 'true'
        ? { rejectUnauthorized: process.env.PGSSL_REJECT_UNAUTHORIZED === 'true' }
        : false,
  };
};

const connectionConfig = useSupabase
  ? getSupabaseConnectionConfig()
  : getLocalConnectionConfig();

let pool;

const getPool = () => {
  if (!pool) {
    pool = new Pool({
      ...connectionConfig,
      max: 10, // Suporta até 10 conexões simultâneas (default pg)
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });
    pool.on('error', (err) => {
      logger.error('Unexpected PG pool error', { error: err.message });
    });
    if (useSupabase) {
      logger.info('Using Supabase as database');
    }
  }
  return pool;
};

/**
 * Run a SQL query with parameters
 * @param {string} queryText - SQL query
 * @param {Array} params - Query parameters
 * @returns {Promise<object>} Query result
 */
const runQuery = async (queryText, params = []) => {
  if (!queryText || typeof queryText !== 'string') {
    throw new Error('Invalid SQL for runQuery');
  }

  const client = await getPool().connect();
  try {
    const start = Date.now();
    const result = await client.query(queryText, params);
    const duration = Date.now() - start;
    logger.debug('Query executed', {
      query: queryText.split('\n')[0].substring(0, 50),
      duration: `${duration}ms`
    });
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
