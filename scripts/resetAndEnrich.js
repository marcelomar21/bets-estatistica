#!/usr/bin/env node
/**
 * Reset posted bets to ready and run odds enrichment
 */
require('dotenv').config();
const { getActivePostedBets, updateBetStatus } = require('../bot/services/betService');
const { runEnrichment } = require('../bot/jobs/enrichOdds');

async function main() {
  console.log('🔄 Resetando apostas postadas...\n');

  // 1. Get active posted bets
  const result = await getActivePostedBets();

  if (!result.success) {
    console.error('Erro ao buscar apostas:', result.error.message);
    process.exit(1);
  }

  const postedBets = result.data || [];
  console.log(`Apostas postadas encontradas: ${postedBets.length}`);

  for (const bet of postedBets) {
    console.log(`  #${bet.id} - ${bet.homeTeamName} x ${bet.awayTeamName}`);
  }

  // 2. Reset each to 'ready'
  if (postedBets.length > 0) {
    console.log('\n📝 Resetando para ready...');
    for (const bet of postedBets) {
      const updateResult = await updateBetStatus(bet.id, 'ready');
      if (updateResult.success) {
        console.log(`  ✅ #${bet.id} resetado`);
      } else {
        console.log(`  ❌ #${bet.id} erro: ${updateResult.error.message}`);
      }
    }
  }

  // 3. Run odds enrichment
  console.log('\n📊 Enriquecendo odds...\n');
  try {
    const enrichResult = await runEnrichment();
    console.log('\n✅ Enriquecimento concluído!');
    console.log(`   Enriquecidas: ${enrichResult.enriched || 0}`);
    console.log(`   Puladas: ${enrichResult.skipped || 0}`);
    console.log(`   Erros: ${enrichResult.errors || 0}`);
  } catch (err) {
    console.error('Erro no enriquecimento:', err.message);
  }

  process.exit(0);
}

main();
