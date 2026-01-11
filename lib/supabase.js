/**
 * Supabase client singleton
 * ALL database access MUST go through this module
 */
const { createClient } = require('@supabase/supabase-js');
const { config, validateConfig } = require('./config');
const logger = require('./logger');

// Validate on module load
validateConfig();

// Create singleton client
const supabase = createClient(
  config.supabase.url,
  config.supabase.serviceKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

/**
 * Test database connection using raw SQL (works even with empty DB)
 * @returns {Promise<{success: boolean, data?: object, error?: object}>}
 */
async function testConnection() {
  try {
    const { data, error } = await supabase.rpc('get_service_status', {}).maybeSingle();
    
    // If RPC doesn't exist, try a simple query
    if (error && error.code === 'PGRST202') {
      // Function not found - try raw health check via REST
      const response = await fetch(`${config.supabase.url}/rest/v1/`, {
        headers: {
          'apikey': config.supabase.serviceKey,
          'Authorization': `Bearer ${config.supabase.serviceKey}`,
        },
      });
      
      if (response.ok) {
        logger.info('Supabase connection successful (REST check)');
        return { success: true, data: { connected: true, method: 'rest' } };
      }
      
      logger.error('Supabase REST check failed', { status: response.status });
      return { success: false, error: { code: 'REST_ERROR', message: `HTTP ${response.status}` } };
    }

    if (error) {
      logger.error('Supabase connection test failed', { error: error.message });
      return { success: false, error: { code: 'DB_ERROR', message: error.message } };
    }

    logger.info('Supabase connection successful');
    return { success: true, data: { connected: true } };
  } catch (err) {
    logger.error('Supabase connection error', { error: err.message });
    return { success: false, error: { code: 'CONNECTION_ERROR', message: err.message } };
  }
}

module.exports = { supabase, testConnection };
