#!/usr/bin/env node
/**
 * Test Production Flow - Teste Completo
 * 
 * Simula o fluxo de produção:
 * 1. Atualiza odds das apostas ativas
 * 2. Envia PRÉVIA para grupo de ADMIN
 * 3. Envia mensagens para grupo PÚBLICO
 * 
 * Usage:
 *   node scripts/test-production-flow.js              # Teste completo
 *   node scripts/test-production-flow.js --dry-run    # Só mostra, não envia
 */
require('dotenv').config();

const { supabase } = require('../lib/supabase');
const { runEnrichment } = require('../bot/jobs/enrichOdds');
const { alertAdmin, sendToPublic } = require('../bot/telegram');
const { config } = require('../lib/config');

const DRY_RUN = process.argv.includes('--dry-run');

// Message templates
const TEMPLATES = [
  { header: '🎯 *APOSTA DO DIA*', footer: '🍀 Boa sorte!' },
  { header: '⚽ *DICA QUENTE*', footer: '💪 Bora lucrar!' },
  { header: '🔥 *OPORTUNIDADE*', footer: '📈 Vamos juntos!' },
];

function getTemplate(index) {
  return TEMPLATES[index % TEMPLATES.length];
}

function formatBetMessage(bet, template) {
  const kickoff = new Date(bet.league_matches.kickoff_time).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  let msg = `${template.header}\n\n`;
  msg += `⚽ *${bet.league_matches.home_team_name} x ${bet.league_matches.away_team_name}*\n`;
  msg += `🗓 ${kickoff}\n\n`;
  msg += `📊 *${bet.bet_market}*\n`;
  msg += `💰 Odd: *${bet.odds?.toFixed(2) || 'N/A'}*\n\n`;
  
  if (bet.reasoning) {
    msg += `📝 _${bet.reasoning.substring(0, 100)}..._\n\n`;
  }
  
  if (bet.deep_link) {
    msg += `🔗 [Apostar Agora](${bet.deep_link})\n\n`;
  }
  
  msg += template.footer;
  
  return msg;
}

async function main() {
  console.log('🧪 Test Production Flow - COMPLETO\n');
  console.log('=' .repeat(60));
  
  if (DRY_RUN) {
    console.log('⚠️  MODO DRY-RUN: Não vai enviar mensagens reais\n');
  }

  // =========================================
  // STEP 1: Atualizar odds das apostas ativas
  // =========================================
  console.log('\n📊 STEP 1: Atualizando odds das apostas ativas...\n');
  
  const enrichResult = await runEnrichment();
  console.log(`   Odds atualizadas: ${enrichResult.enriched}`);
  console.log(`   Bets ativas: ${enrichResult.active}`);

  // =========================================
  // STEP 2: Buscar apostas ativas (posted)
  // =========================================
  console.log('\n📋 STEP 2: Buscando apostas ativas...\n');
  
  const { data: activeBets, error } = await supabase
    .from('suggested_bets')
    .select(`
      id, bet_market, bet_pick, odds, bet_status, deep_link, reasoning,
      league_matches!inner (home_team_name, away_team_name, kickoff_time, status)
    `)
    .eq('bet_status', 'posted')
    .eq('bet_category', 'SAFE')
    .order('odds', { ascending: false });

  if (error) {
    console.error('❌ Erro ao buscar apostas:', error.message);
    return;
  }

  console.log(`   Apostas ativas encontradas: ${activeBets.length}`);

  if (activeBets.length === 0) {
    console.log('\n⚠️  Nenhuma aposta ativa. Execute o fluxo de postagem primeiro.');
    return;
  }

  // =========================================
  // STEP 3: Enviar PRÉVIA para grupo ADMIN
  // =========================================
  console.log('\n📨 STEP 3: Enviando PRÉVIA para grupo ADMIN...\n');
  
  let previewMsg = `👁️ *PRÉVIA - APOSTAS ATIVAS*\n\n`;
  previewMsg += `_Status atual das apostas publicadas:_\n\n`;
  
  activeBets.forEach((bet, i) => {
    const kickoff = new Date(bet.league_matches.kickoff_time).toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    
    previewMsg += `${i + 1}️⃣ *${bet.league_matches.home_team_name} vs ${bet.league_matches.away_team_name}*\n`;
    previewMsg += `   📅 ${kickoff}\n`;
    previewMsg += `   📊 ${bet.bet_market}\n`;
    previewMsg += `   💰 Odds: ${bet.odds?.toFixed(2) || 'N/A'}\n`;
    previewMsg += `   🔗 ${bet.deep_link ? '✅ Link OK' : '❌ Sem link'}\n\n`;
  });

  previewMsg += `_Total: ${activeBets.length} apostas ativas_`;

  if (DRY_RUN) {
    console.log('   [DRY-RUN] Prévia que seria enviada:');
    console.log('   ---');
    console.log(previewMsg.split('\n').map(l => '   ' + l).join('\n'));
    console.log('   ---');
  } else {
    await alertAdmin('INFO', 'Prévia Apostas Ativas', previewMsg);
    console.log('   ✅ Prévia enviada para grupo admin!');
  }

  // =========================================
  // STEP 4: Enviar para grupo PÚBLICO
  // =========================================
  console.log('\n📢 STEP 4: Enviando para grupo PÚBLICO...\n');
  
  for (let i = 0; i < activeBets.length; i++) {
    const bet = activeBets[i];
    const template = getTemplate(i);
    const message = formatBetMessage(bet, template);
    
    console.log(`   ${i + 1}. ${bet.league_matches.home_team_name} vs ${bet.league_matches.away_team_name}`);
    
    if (DRY_RUN) {
      console.log('      [DRY-RUN] Mensagem que seria enviada');
    } else {
      const result = await sendToPublic(message);
      if (result.success) {
        console.log(`      ✅ Enviada! (messageId: ${result.data.messageId})`);
      } else {
        console.log(`      ❌ Erro: ${result.error?.message}`);
      }
      
      // Delay entre mensagens para não spammar
      if (i < activeBets.length - 1) {
        await new Promise(r => setTimeout(r, 2000));
      }
    }
  }

  // =========================================
  // RESUMO
  // =========================================
  console.log('\n' + '=' .repeat(60));
  console.log('\n✅ TESTE COMPLETO!\n');
  console.log('📊 Resumo:');
  console.log(`   - Odds atualizadas: ${enrichResult.enriched}`);
  console.log(`   - Prévia enviada: ✅ Admin`);
  console.log(`   - Mensagens enviadas: ${activeBets.length} (Público)`);
  
  if (DRY_RUN) {
    console.log('\n⚠️  Modo DRY-RUN - nenhuma mensagem foi enviada de verdade.');
    console.log('   Para enviar, rode sem --dry-run');
  }
  
  console.log('');
}

main().catch(err => {
  console.error('❌ Erro:', err.message);
  process.exit(1);
});
