// ESLint Configuration - bets-estatistica
// CommonJS modules, Node.js 20+, ES2022

module.exports = {
  env: {
    node: true,
    es2022: true,
    jest: true,
  },
  extends: ['eslint:recommended'],
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'script', // CommonJS
  },
  rules: {
    // Variáveis não usadas são warnings (não bloqueiam CI), exceto as que começam com _
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    // Permitir console pois usamos logger (mas console.log pode existir em scripts)
    'no-console': 'off',
    // Permitir require() em qualquer lugar (CommonJS)
    'global-require': 'off',
    // Blocos vazios são warnings (para permitir catch vazio temporário)
    'no-empty': 'warn',
    // Try/catch desnecessário é warning
    'no-useless-catch': 'warn',
  },
  ignorePatterns: [
    'node_modules/',
    '_bmad/',
    '_bmad-output/',
    '*.md',
    '*.yaml',
    '*.yml',
    '*.json',
  ],
};
