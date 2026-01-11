#!/usr/bin/env node
/**
 * Test Production Flow
 * 
 * Simula o fluxo completo como se fosse produção:
 * 1. Enriquece odds
 * 2. Mostra prévia no grupo admin
 * 3. Publica no grupo PÚBLICO (real!)
 * 
 * ⚠️ CUIDADO: Este script PUBLICA DE VERDADE no grupo público!
 * 
 * Usage:
 *   node scripts/test-production-flow.js           # Só prévia (seguro)
 *   node scripts/test-production-flow.js --post    # Prévia + publica (real!)
 */
require('dotenv').config();

const { runEnrichment } = require('../bot/jobs/enrichOdds');
const { runRequestLinks } = require('../bot/jobs/requestLinks');
const { runPostBets } = require('../bot/jobs/postBets');
const { getBetsReadyForPosting } = require('../bot/services/betService');
const { alertAdmin, sendToPublic } = require('../bot/telegram');

const SHOULD_POST = process.argv.includes('--post');

async function main() {
  console.log('🧪 Test Production Flow\n');
  console.log('=' .repeat(60));

  // Step 1: Check ready bets
  console.log('\n📊 Step 1: Verificando bets prontas...\n');
  
  const readyResult = await getBetsReadyForPosting();
  const readyBets = readyResult.success ? readyResult.data : [];
  
  console.log(`   Bets prontas: ${readyBets.length}`);
  
  if (readyBets.length === 0) {
    console.log('\n⚠️  Nenhuma bet pronta para publicação.');
    console.log('   Verifique se as bets têm:');
    console.log('   - status = "ready"');
    console.log('   - deep_link preenchido');
    console.log('   - odds >= 1.60');
    console.log('   - eligible = true');
    
    // Run enrichment to see what we have
    console.log('\n📊 Rodando enrichment para ver status...\n');
    await runEnrichment();
    
    return;
  }

  // Step 2: Show preview
  console.log('\n📋 Step 2: Prévia das apostas:\n');
  
  for (const bet of readyBets) {
    const kickoff = new Date(bet.kickoffTime).toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
    });
    
    console.log(`   🏟️  ${bet.homeTeamName} vs ${bet.awayTeamName}`);
    console.log(`   📅  ${kickoff}`);
    console.log(`   📊  ${bet.betMarket}`);
    console.log(`   💰  Odds: ${bet.odds?.toFixed(2) || 'N/A'}`);
    console.log(`   🔗  Link: ${bet.deepLink ? '✅' : '❌'}`);
    console.log('');
  }

  // Step 3: Send preview to admin group
  console.log('\n📨 Step 3: Enviando prévia para grupo admin...\n');
  
  let previewMsg = `👁️ *PRÉVIA - TESTE*\n\n`;
  previewMsg += `⚠️ _Modo de teste - verificando fluxo_\n\n`;
  
  for (let i = 0; i < readyBets.length; i++) {
    const bet = readyBets[i];
    const kickoff = new Date(bet.kickoffTime).toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    
    previewMsg += `${i + 1}️⃣ *${bet.homeTeamName} vs ${bet.awayTeamName}*\n`;
    previewMsg += `   📅 ${kickoff}\n`;
    previewMsg += `   📊 ${bet.betMarket}\n`;
    previewMsg += `   💰 Odds: ${bet.odds?.toFixed(2) || 'N/A'}\n`;
    previewMsg += `   🔗 Link: ${bet.deepLink ? '✅' : '❌'}\n\n`;
  }

  await alertAdmin('INFO', 'Prévia de Teste', previewMsg);
  console.log('   ✅ Prévia enviada para grupo admin!');

  // Step 4: Post to public (only if --post flag)
  if (SHOULD_POST) {
    console.log('\n🚀 Step 4: PUBLICANDO NO GRUPO PÚBLICO...\n');
    
    const result = await runPostBets();
    
    console.log(`   ✅ Publicadas: ${result.posted}`);
    console.log(`   ⏭️  Puladas: ${result.skipped}`);
  } else {
    console.log('\n⏸️  Step 4: Publicação pulada (use --post para publicar)\n');
    console.log('   Para publicar de verdade, rode:');
    console.log('   node scripts/test-production-flow.js --post');
  }

  console.log('\n' + '=' .repeat(60));
  console.log('✅ Teste concluído!\n');
}

main().catch(err => {
  console.error('❌ Erro:', err.message);
  process.exit(1);
});
