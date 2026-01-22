#!/usr/bin/env node
/**
 * Script de teste para avaliar resultados de bets com LLM
 * Uso: node scripts/testResultEvaluator.js [--limit=10] [--dry-run] [--all-status]
 */
require('dotenv').config();

const { supabase } = require('../lib/supabase');
const { evaluateBetsWithLLM } = require('../bot/services/resultEvaluator');
const { markBetResult } = require('../bot/services/betService');

const args = process.argv.slice(2);
const limit = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1] || '500');
const dryRun = args.includes('--dry-run');
const allStatus = args.includes('--all-status');

async function main() {
  console.log(`\n🔍 Buscando até ${limit} bets pendentes com jogos finalizados...`);
  if (allStatus) console.log('   (incluindo todos os bet_status, não apenas posted)\n');

  // Query base
  let query = supabase
    .from('suggested_bets')
    .select(`
      id,
      match_id,
      bet_market,
      bet_pick,
      bet_status,
      league_matches!inner (
        home_team_name,
        away_team_name,
        status,
        raw_match
      )
    `)
    .eq('bet_result', 'pending')
    .in('league_matches.status', ['complete', 'finished', 'ft', 'aet', 'pen'])
    .limit(limit);

  // Filtrar por posted apenas se não for --all-status
  if (!allStatus) {
    query = query.eq('bet_status', 'posted');
  }

  const { data: bets, error } = await query;

  if (error) {
    console.error('❌ Erro ao buscar bets:', error.message);
    process.exit(1);
  }

  if (!bets || bets.length === 0) {
    console.log('✅ Nenhuma bet pendente com jogo finalizado encontrada.');
    process.exit(0);
  }

  console.log(`📊 Encontradas ${bets.length} bets para avaliar:\n`);

  // Agrupar por matchId
  const betsByMatch = new Map();
  for (const bet of bets) {
    const matchId = bet.match_id;
    if (!betsByMatch.has(matchId)) {
      betsByMatch.set(matchId, {
        matchInfo: {
          matchId,
          homeTeamName: bet.league_matches.home_team_name,
          awayTeamName: bet.league_matches.away_team_name,
          rawMatch: bet.league_matches.raw_match,
        },
        bets: [],
      });
    }
    betsByMatch.get(matchId).bets.push({
      id: bet.id,
      betMarket: bet.bet_market,
      betPick: bet.bet_pick,
      betStatus: bet.bet_status,
    });
  }

  console.log(`🎮 ${betsByMatch.size} jogos diferentes\n`);
  console.log('─'.repeat(60));

  let totalSuccess = 0;
  let totalFailure = 0;
  let totalUnknown = 0;
  let processed = 0;

  for (const [matchId, { matchInfo, bets: matchBets }] of betsByMatch) {
    const rawMatch = matchInfo.rawMatch || {};
    const homeScore = rawMatch.homeGoalCount ?? rawMatch.home_score ?? '?';
    const awayScore = rawMatch.awayGoalCount ?? rawMatch.away_score ?? '?';

    console.log(`\n⚽ ${matchInfo.homeTeamName} ${homeScore} x ${awayScore} ${matchInfo.awayTeamName}`);
    console.log(`   Bets: ${matchBets.length}`);

    const evalResult = await evaluateBetsWithLLM(matchInfo, matchBets);

    if (!evalResult.success) {
      console.log(`   ❌ Erro: ${evalResult.error?.message}`);
      continue;
    }

    for (const result of evalResult.data) {
      const bet = matchBets.find(b => b.id === result.id);
      const icon = result.result === 'success' ? '✅' : result.result === 'failure' ? '❌' : '❓';

      console.log(`   ${icon} [${result.result.toUpperCase()}] ${bet?.betMarket} - ${bet?.betPick}`);
      console.log(`      Reason: ${result.reason}`);

      if (result.result === 'success') totalSuccess++;
      else if (result.result === 'failure') totalFailure++;
      else totalUnknown++;

      processed++;

      // Salvar no banco se não for dry-run
      if (!dryRun) {
        const updateResult = await markBetResult(result.id, result.result, result.reason);
        if (!updateResult.success) {
          console.log(`      ⚠️  Erro ao salvar: ${updateResult.error?.message}`);
        }
      }
    }

    // Progress a cada 50 bets
    if (processed % 50 === 0) {
      console.log(`\n📈 Progresso: ${processed}/${bets.length} bets processadas...`);
    }
  }

  console.log('\n' + '─'.repeat(60));
  console.log(`\n📈 RESUMO:`);
  console.log(`   ✅ Success: ${totalSuccess}`);
  console.log(`   ❌ Failure: ${totalFailure}`);
  console.log(`   ❓ Unknown: ${totalUnknown}`);
  console.log(`   📊 Total:   ${totalSuccess + totalFailure + totalUnknown}`);

  const total = totalSuccess + totalFailure + totalUnknown;
  if (total > 0) {
    console.log(`\n   📊 Taxa de acerto: ${((totalSuccess / total) * 100).toFixed(1)}%`);
  }

  if (dryRun) {
    console.log(`\n⚠️  DRY-RUN: Nenhuma alteração foi salva no banco.`);
    console.log(`   Para salvar, rode sem --dry-run`);
  } else {
    console.log(`\n✅ Resultados salvos no banco.`);
  }
}

main().catch(err => {
  console.error('❌ Erro:', err.message);
  process.exit(1);
});
