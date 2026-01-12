/**
 * Test script for Market Interpreter
 * Run: node scripts/test-market-interpreter.js
 */
require('dotenv').config();

const { interpretMarket, fallbackParsing } = require('../bot/services/marketInterpreter');

const TEST_MARKETS = [
  // Should map to totals
  'Proteja com mais de 1,5 gols no jogo',
  'Mais de 2.5 gols',
  'Under 3.5 goals',
  'Menos de 2,5 gols na partida',
  
  // Should map to btts
  'Busque ambas as equipes marcarem com proteção moderada',
  'Ambas equipes marcam - Sim',
  'Both teams to score',
  
  // Should NOT be supported (corners, cards)
  'Segure cartões em mais de 3,5 no jogo',
  'Explore mais de 7,5 escanteios totais',
  'Mais de 10 escanteios',
  'Menos de 4 cartões amarelos',
  
  // Edge cases
  'Vitória do time da casa',
  'Empate',
  'Handicap -1.5 para o visitante',
];

async function runTest() {
  console.log('🧪 Testing Market Interpreter\n');
  console.log('=' .repeat(80));
  
  for (const market of TEST_MARKETS) {
    console.log(`\n📝 Input: "${market}"`);
    
    // Test AI interpretation
    const aiResult = await interpretMarket(market);
    console.log('🤖 AI Result:', JSON.stringify(aiResult, null, 2));
    
    // Test fallback parsing
    const fallbackResult = fallbackParsing(market);
    console.log('🔧 Fallback:', JSON.stringify(fallbackResult, null, 2));
    
    console.log('-'.repeat(80));
  }
  
  console.log('\n✅ Test complete!');
}

runTest().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
