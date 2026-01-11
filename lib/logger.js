/**
 * Centralized logging module
 * Structured JSON logs for production, readable for development
 */
const { config } = require('./config');

const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3,
};

const currentLevel = config.isDev ? LOG_LEVELS.DEBUG : LOG_LEVELS.INFO;

function formatMessage(level, message, meta = {}) {
  const timestamp = new Date().toISOString();
  
  if (config.isDev) {
    // Readable format for development
    const metaStr = Object.keys(meta).length > 0 
      ? ` ${JSON.stringify(meta)}` 
      : '';
    return `[${timestamp}] ${level}: ${message}${metaStr}`;
  }
  
  // JSON format for production
  return JSON.stringify({
    timestamp,
    level,
    message,
    ...meta,
  });
}

const logger = {
  error(message, meta = {}) {
    if (currentLevel >= LOG_LEVELS.ERROR) {
      console.error(formatMessage('ERROR', message, meta));
    }
  },

  warn(message, meta = {}) {
    if (currentLevel >= LOG_LEVELS.WARN) {
      console.warn(formatMessage('WARN', message, meta));
    }
  },

  info(message, meta = {}) {
    if (currentLevel >= LOG_LEVELS.INFO) {
      console.log(formatMessage('INFO', message, meta));
    }
  },

  debug(message, meta = {}) {
    if (currentLevel >= LOG_LEVELS.DEBUG) {
      console.log(formatMessage('DEBUG', message, meta));
    }
  },
};

module.exports = logger;
