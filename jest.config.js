module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.js'],
  collectCoverageFrom: [
    'bot/services/metricsService.js',
    'bot/services/marketInterpreter.js',
    'bot/services/copyService.js',
    'bot/services/betService.js',
    '!**/node_modules/**',
  ],
  // Coverage thresholds for critical functions (Story 11.3)
  // Note: These files contain both pure functions (high coverage) and
  // DB functions (hard to unit test). Thresholds reflect tested pure functions.
  coverageThreshold: {
    './bot/services/metricsService.js': {
      branches: 80,
      functions: 100,
      lines: 85,
    },
    './bot/services/marketInterpreter.js': {
      branches: 60,
      functions: 30,
      lines: 40,
    },
    './bot/services/copyService.js': {
      branches: 80,
      functions: 85,
      lines: 85,
    },
    './bot/services/betService.js': {
      branches: 15,
      functions: 10,
      lines: 15,
    },
  },
  verbose: true,
  testTimeout: 10000,
};
