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
    maxDaysAhead: 2, // 2 dias conforme PRD (FR39)
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

  // Membership configuration (Story 16.4, 16.5)
  // Tech-Spec: Migração MP - trial now managed by MP, keep config for visibility
  membership: {
    trialDays: (() => {
      const days = parseInt(process.env.MEMBERSHIP_TRIAL_DAYS || '2', 10);
      if (isNaN(days) || days <= 0) {
        return 2; // Default fallback
      }
      return days;
    })(),
    // MP manages trial and checkout, but we still reference for notifications
    checkoutUrl: process.env.MP_CHECKOUT_URL || process.env.CAKTO_CHECKOUT_URL || null,
    operatorUsername: process.env.MEMBERSHIP_OPERATOR_USERNAME || 'operador',
    subscriptionPrice: process.env.MEMBERSHIP_SUBSCRIPTION_PRICE || 'R$50/mes',
  },

  // Mercado Pago configuration
  mercadoPago: {
    accessToken: process.env.MP_ACCESS_TOKEN || null,
    webhookSecret: process.env.MP_WEBHOOK_SECRET || null,
    checkoutUrl: process.env.MP_CHECKOUT_URL || null,
    webhookPort: parseInt(process.env.MP_WEBHOOK_PORT, 10) || 3001,
  },
};

// Validation
function validateConfig() {
  // Skip validation in test environment (tests mock supabase)
  if (process.env.NODE_ENV === 'test') {
    return;
  }

  const required = [
    ['SUPABASE_URL', config.supabase.url],
    ['SUPABASE_SERVICE_KEY', config.supabase.serviceKey],
    ['TELEGRAM_BOT_TOKEN', config.telegram.botToken],
    ['TELEGRAM_ADMIN_GROUP_ID', config.telegram.adminGroupId],
    ['TELEGRAM_PUBLIC_GROUP_ID', config.telegram.publicGroupId],
  ];

  const missing = required.filter(([_name, value]) => !value);

  if (missing.length > 0) {
    const names = missing.map(([name]) => name).join(', ');
    throw new Error(`Missing required environment variables: ${names}`);
  }
}

module.exports = { config, validateConfig };
