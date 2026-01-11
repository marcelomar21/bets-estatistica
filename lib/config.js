/**
 * Centralized configuration from environment variables
 */
require('dotenv').config();

const config = {
  // Supabase
  supabase: {
    url: process.env.SUPABASE_URL,
    serviceKey: process.env.SUPABASE_SERVICE_KEY,
  },

  // Telegram
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN,
    adminGroupId: process.env.TELEGRAM_ADMIN_GROUP_ID,
    publicGroupId: process.env.TELEGRAM_PUBLIC_GROUP_ID,
  },

  // External APIs
  apis: {
    theOddsApiKey: process.env.THE_ODDS_API_KEY,
    openaiApiKey: process.env.OPENAI_API_KEY,
    footystatsApiKey: process.env.FOOTYSTATS_API_KEY,
  },

  // Environment
  env: process.env.NODE_ENV || 'development',
  isDev: process.env.NODE_ENV !== 'production',

  // Betting rules
  betting: {
    minOdds: 1.60,
    maxActiveBets: 3,
    maxDaysAhead: 14, // 2 semanas para cobrir jogos de fim de semana
    validBookmakerDomains: [
      'bet365.com',
      'betano.com',
      'betano.com.br',
      'betano.bet.br',
      'betway.com',
      'sportingbet.com',
    ],
  },

  // Retry configuration
  retry: {
    maxAttempts: 3,
    baseDelayMs: 1000,
  },
};

// Validation
function validateConfig() {
  const required = [
    ['SUPABASE_URL', config.supabase.url],
    ['SUPABASE_SERVICE_KEY', config.supabase.serviceKey],
    ['TELEGRAM_BOT_TOKEN', config.telegram.botToken],
    ['TELEGRAM_ADMIN_GROUP_ID', config.telegram.adminGroupId],
    ['TELEGRAM_PUBLIC_GROUP_ID', config.telegram.publicGroupId],
  ];

  const missing = required.filter(([name, value]) => !value);
  
  if (missing.length > 0) {
    const names = missing.map(([name]) => name).join(', ');
    throw new Error(`Missing required environment variables: ${names}`);
  }
}

module.exports = { config, validateConfig };
