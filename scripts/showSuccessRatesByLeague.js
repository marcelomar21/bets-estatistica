/**
 * Show success rates by LEAGUE and CATEGORY for 7, 15, 30 days and all-time
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

async function calcRates() {
  // Fetch bets with league info
  const { data } = await supabase
    .from('suggested_bets')
    .select(`
      bet_market,
      bet_result,
      league_matches!inner (
        kickoff_time,
        season_id,
        league_seasons!inner (
          league_name,
          country
        )
      )
    `)
    .in('bet_result', ['success', 'failure']);

  const now = new Date();
  const d7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const d15 = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000);
  const d30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Group by league -> category
  const leagues = {};

  for (const bet of data) {
    const leagueInfo = bet.league_matches.league_seasons;
    const leagueName = leagueInfo ? `${leagueInfo.country} - ${leagueInfo.league_name}` : 'Desconhecido';
    const cat = categorize(bet.bet_market);
    const kickoff = new Date(bet.league_matches.kickoff_time);
    const isSuccess = bet.bet_result === 'success';

    if (!leagues[leagueName]) {
      leagues[leagueName] = {
        categories: {},
        totals: { d7: {s:0,f:0}, d15: {s:0,f:0}, d30: {s:0,f:0}, all: {s:0,f:0} }
      };
    }

    if (!leagues[leagueName].categories[cat]) {
      leagues[leagueName].categories[cat] = { d7: {s:0,f:0}, d15: {s:0,f:0}, d30: {s:0,f:0}, all: {s:0,f:0} };
    }

    const lc = leagues[leagueName].categories[cat];
    const lt = leagues[leagueName].totals;

    // All time
    lc.all[isSuccess ? 's' : 'f']++;
    lt.all[isSuccess ? 's' : 'f']++;

    // 30 days
    if (kickoff >= d30) {
      lc.d30[isSuccess ? 's' : 'f']++;
      lt.d30[isSuccess ? 's' : 'f']++;
    }

    // 15 days
    if (kickoff >= d15) {
      lc.d15[isSuccess ? 's' : 'f']++;
      lt.d15[isSuccess ? 's' : 'f']++;
    }

    // 7 days
    if (kickoff >= d7) {
      lc.d7[isSuccess ? 's' : 'f']++;
      lt.d7[isSuccess ? 's' : 'f']++;
    }
  }

  const rate = (s, f) => {
    const t = s + f;
    if (t === 0) return '   -   ';
    return (((s / t) * 100).toFixed(1) + '%').padStart(6);
  };

  const frac = (s, f) => {
    const t = s + f;
    if (t === 0) return '';
    return ` (${s}/${t})`;
  };

  const cell = (s, f) => {
    return (rate(s, f) + frac(s, f)).padEnd(16);
  };

  // Sort leagues by total volume
  const sortedLeagues = Object.entries(leagues).sort((a, b) => {
    const totalA = a[1].totals.all.s + a[1].totals.all.f;
    const totalB = b[1].totals.all.s + b[1].totals.all.f;
    return totalB - totalA;
  });

  const catOrder = ['Gols', 'Escanteios', 'Cartões', 'BTTS', 'Outros'];

  for (const [leagueName, league] of sortedLeagues) {
    console.log('');
    console.log('╔════════════════════════════════════════════════════════════════════════════════════════╗');
    const title = leagueName.length > 70 ? leagueName.substring(0, 67) + '...' : leagueName;
    console.log(`║  ${title.padEnd(84)}║`);
    console.log('╠════════════════════════════════════════════════════════════════════════════════════════╣');
    console.log('║  CATEGORIA     │    7 DIAS       │   15 DIAS       │   30 DIAS       │    TOTAL       ║');
    console.log('╠════════════════════════════════════════════════════════════════════════════════════════╣');

    for (const cat of catOrder) {
      const c = league.categories[cat];
      if (!c) continue;
      const name = cat.padEnd(14);
      console.log(`║  ${name}│ ${cell(c.d7.s, c.d7.f)}│ ${cell(c.d15.s, c.d15.f)}│ ${cell(c.d30.s, c.d30.f)}│ ${cell(c.all.s, c.all.f)}║`);
    }

    console.log('╠════════════════════════════════════════════════════════════════════════════════════════╣');
    const t = league.totals;
    console.log(`║  ${'⭐ TOTAL'.padEnd(14)}│ ${cell(t.d7.s, t.d7.f)}│ ${cell(t.d15.s, t.d15.f)}│ ${cell(t.d30.s, t.d30.f)}│ ${cell(t.all.s, t.all.f)}║`);
    console.log('╚════════════════════════════════════════════════════════════════════════════════════════╝');
  }

  console.log('');
}

calcRates().then(() => process.exit(0)).catch(err => {
  console.error('Failed:', err.message);
  process.exit(1);
});
