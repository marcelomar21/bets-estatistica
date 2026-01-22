/**
 * Show success rates by CATEGORY for 7, 15, 30 days and all-time
 * Filters by KICKOFF TIME (match date), not result_updated_at
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
  const { data } = await supabase
    .from('suggested_bets')
    .select(`
      bet_market,
      bet_result,
      league_matches!inner (kickoff_time)
    `)
    .in('bet_result', ['success', 'failure']);

  const now = new Date();
  const d7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const d15 = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000);
  const d30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const categories = {};
  const totals = { d7: {s:0,f:0}, d15: {s:0,f:0}, d30: {s:0,f:0}, all: {s:0,f:0} };

  for (const bet of data) {
    const cat = categorize(bet.bet_market);
    const kickoff = new Date(bet.league_matches.kickoff_time);
    const isSuccess = bet.bet_result === 'success';

    if (!categories[cat]) {
      categories[cat] = { d7: {s:0,f:0}, d15: {s:0,f:0}, d30: {s:0,f:0}, all: {s:0,f:0} };
    }

    // All time
    categories[cat].all[isSuccess ? 's' : 'f']++;
    totals.all[isSuccess ? 's' : 'f']++;

    // 30 days
    if (kickoff >= d30) {
      categories[cat].d30[isSuccess ? 's' : 'f']++;
      totals.d30[isSuccess ? 's' : 'f']++;
    }

    // 15 days
    if (kickoff >= d15) {
      categories[cat].d15[isSuccess ? 's' : 'f']++;
      totals.d15[isSuccess ? 's' : 'f']++;
    }

    // 7 days
    if (kickoff >= d7) {
      categories[cat].d7[isSuccess ? 's' : 'f']++;
      totals.d7[isSuccess ? 's' : 'f']++;
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

  console.log('');
  console.log('╔════════════════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                        TAXA DE SUCESSO POR CATEGORIA                                   ║');
  console.log('╠════════════════════════════════════════════════════════════════════════════════════════╣');
  console.log('║  Fórmula: Taxa = success / (success + failure) * 100                                   ║');
  console.log('║  Filtro por: DATA DO JOGO (kickoff_time)                                               ║');
  console.log('║  Não conta: pending, cancelled, unknown                                                ║');
  console.log('╠════════════════════════════════════════════════════════════════════════════════════════╣');
  console.log('║  CATEGORIA     │    7 DIAS       │   15 DIAS       │   30 DIAS       │    TOTAL       ║');
  console.log('╠════════════════════════════════════════════════════════════════════════════════════════╣');

  // Sort by total volume
  const sorted = Object.entries(categories).sort((a, b) => {
    const totalA = a[1].all.s + a[1].all.f;
    const totalB = b[1].all.s + b[1].all.f;
    return totalB - totalA;
  });

  for (const [cat, c] of sorted) {
    const name = cat.padEnd(14);
    console.log(`║  ${name}│ ${cell(c.d7.s, c.d7.f)}│ ${cell(c.d15.s, c.d15.f)}│ ${cell(c.d30.s, c.d30.f)}│ ${cell(c.all.s, c.all.f)}║`);
  }

  console.log('╠════════════════════════════════════════════════════════════════════════════════════════╣');
  const t = totals;
  console.log(`║  ${'⭐ TOTAL'.padEnd(14)}│ ${cell(t.d7.s, t.d7.f)}│ ${cell(t.d15.s, t.d15.f)}│ ${cell(t.d30.s, t.d30.f)}│ ${cell(t.all.s, t.all.f)}║`);
  console.log('╚════════════════════════════════════════════════════════════════════════════════════════╝');
  console.log('');
}

calcRates().then(() => process.exit(0)).catch(err => {
  console.error('Failed:', err.message);
  process.exit(1);
});
