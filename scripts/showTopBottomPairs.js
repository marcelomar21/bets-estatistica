/**
 * Show top 10 and bottom 10 league/category pairs by performance
 */
require('dotenv').config();
const { supabase } = require('../lib/supabase');

function categorize(market) {
  const m = (market || '').toLowerCase();
  if (m.includes('escanteio') || m.includes('corner')) return 'Escanteios';
  if (m.includes('cartõ') || m.includes('cartao') || m.includes('card')) return 'Cartões';
  if (m.includes('ambas') || m.includes('btts') || m.includes('marcam') || m.includes('marcar')) return 'BTTS';
  if (m.includes('gol') || m.includes('goal')) return 'Gols';
  return 'Outros';
}

async function showPairs() {
  const { data } = await supabase
    .from('suggested_bets')
    .select(`
      bet_market,
      bet_result,
      league_matches!inner (
        league_seasons!inner (league_name, country)
      )
    `)
    .in('bet_result', ['success', 'failure']);

  const pairs = {};

  for (const bet of data) {
    const leagueInfo = bet.league_matches.league_seasons;
    const league = leagueInfo ? `${leagueInfo.country} - ${leagueInfo.league_name}` : 'Desconhecido';
    const cat = categorize(bet.bet_market);
    const key = `${league} | ${cat}`;

    if (!pairs[key]) pairs[key] = { s: 0, f: 0 };
    pairs[key][bet.bet_result === 'success' ? 's' : 'f']++;
  }

  // Convert to array with rate calculation
  const results = Object.entries(pairs)
    .filter(([_, v]) => (v.s + v.f) >= 3) // Min 3 bets
    .map(([key, v]) => ({
      key,
      rate: (v.s / (v.s + v.f)) * 100,
      total: v.s + v.f,
      wins: v.s
    }))
    .sort((a, b) => b.rate - a.rate);

  console.log('');
  console.log('╔════════════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                           🏆 TOP 10 - MELHORES PARES                               ║');
  console.log('╠════════════════════════════════════════════════════════════════════════════════════╣');
  console.log('║  #  │ CAMPEONATO / CATEGORIA                              │   TAXA    │   BETS    ║');
  console.log('╠════════════════════════════════════════════════════════════════════════════════════╣');

  results.slice(0, 10).forEach((r, i) => {
    const num = String(i + 1).padStart(2);
    const name = r.key.length > 50 ? r.key.substring(0, 47) + '...' : r.key.padEnd(50);
    const rate = (r.rate.toFixed(1) + '%').padStart(6);
    const bets = (`${r.wins}/${r.total}`).padStart(7);
    console.log(`║  ${num} │ ${name} │ ${rate}    │ ${bets}   ║`);
  });

  console.log('╚════════════════════════════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                           💀 BOTTOM 10 - PIORES PARES                              ║');
  console.log('╠════════════════════════════════════════════════════════════════════════════════════╣');
  console.log('║  #  │ CAMPEONATO / CATEGORIA                              │   TAXA    │   BETS    ║');
  console.log('╠════════════════════════════════════════════════════════════════════════════════════╣');

  results.slice(-10).reverse().forEach((r, i) => {
    const num = String(i + 1).padStart(2);
    const name = r.key.length > 50 ? r.key.substring(0, 47) + '...' : r.key.padEnd(50);
    const rate = (r.rate.toFixed(1) + '%').padStart(6);
    const bets = (`${r.wins}/${r.total}`).padStart(7);
    console.log(`║  ${num} │ ${name} │ ${rate}    │ ${bets}   ║`);
  });

  console.log('╚════════════════════════════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log('(Mínimo 3 bets para entrar no ranking)');
}

showPairs().then(() => process.exit(0)).catch(err => {
  console.error('Failed:', err.message);
  process.exit(1);
});
