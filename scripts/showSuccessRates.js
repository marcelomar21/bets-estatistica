/**
 * Show success rates by market for 7, 15, 30 days and all-time
 */
require('dotenv').config();
const { supabase } = require('../lib/supabase');

async function calcRates() {
  // Fetch all bets with results
  const { data } = await supabase
    .from('suggested_bets')
    .select('bet_market, bet_result, result_updated_at')
    .in('bet_result', ['success', 'failure']);

  const now = new Date();
  const d7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const d15 = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000);
  const d30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Group by market
  const markets = {};
  const totals = { d7: {s:0,f:0}, d15: {s:0,f:0}, d30: {s:0,f:0}, all: {s:0,f:0} };

  for (const bet of data) {
    const market = bet.bet_market || 'Sem mercado';
    const updated = new Date(bet.result_updated_at);
    const isSuccess = bet.bet_result === 'success';

    if (!markets[market]) {
      markets[market] = { d7: {s:0,f:0}, d15: {s:0,f:0}, d30: {s:0,f:0}, all: {s:0,f:0} };
    }

    // All time
    markets[market].all[isSuccess ? 's' : 'f']++;
    totals.all[isSuccess ? 's' : 'f']++;

    // 30 days
    if (updated >= d30) {
      markets[market].d30[isSuccess ? 's' : 'f']++;
      totals.d30[isSuccess ? 's' : 'f']++;
    }

    // 15 days
    if (updated >= d15) {
      markets[market].d15[isSuccess ? 's' : 'f']++;
      totals.d15[isSuccess ? 's' : 'f']++;
    }

    // 7 days
    if (updated >= d7) {
      markets[market].d7[isSuccess ? 's' : 'f']++;
      totals.d7[isSuccess ? 's' : 'f']++;
    }
  }

  const rate = (s, f) => {
    const t = s + f;
    if (t === 0) return '-';
    return ((s / t) * 100).toFixed(1) + '%';
  };

  const frac = (s, f) => {
    const t = s + f;
    if (t === 0) return '-';
    return s + '/' + t;
  };

  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                                    TAXA DE SUCESSO POR MERCADO                                               ║');
  console.log('╠══════════════════════════════════════════════════════════════════════════════════════════════════════════════╣');
  console.log('║ Fórmula: Taxa = (success / (success + failure)) * 100                                                        ║');
  console.log('║ Não conta: pending, cancelled, unknown                                                                       ║');
  console.log('╠══════════════════════════════════════════════════════════════════════════════════════════════════════════════╣');

  // Header
  console.log('║ ' + 'MERCADO'.padEnd(55) + '│ 7 DIAS       │ 15 DIAS      │ 30 DIAS      │ TOTAL        ║');
  console.log('╠══════════════════════════════════════════════════════════════════════════════════════════════════════════════╣');

  // Sort by all-time total (descending)
  const sorted = Object.entries(markets).sort((a, b) => {
    const totalA = a[1].all.s + a[1].all.f;
    const totalB = b[1].all.s + b[1].all.f;
    return totalB - totalA;
  });

  for (const [market, m] of sorted) {
    const name = market.length > 53 ? market.substring(0, 50) + '...' : market;
    const col7 = (rate(m.d7.s, m.d7.f) + ' ' + frac(m.d7.s, m.d7.f)).padEnd(12);
    const col15 = (rate(m.d15.s, m.d15.f) + ' ' + frac(m.d15.s, m.d15.f)).padEnd(12);
    const col30 = (rate(m.d30.s, m.d30.f) + ' ' + frac(m.d30.s, m.d30.f)).padEnd(12);
    const colAll = (rate(m.all.s, m.all.f) + ' ' + frac(m.all.s, m.all.f)).padEnd(12);
    console.log('║ ' + name.padEnd(55) + '│ ' + col7 + '│ ' + col15 + '│ ' + col30 + '│ ' + colAll + '║');
  }

  console.log('╠══════════════════════════════════════════════════════════════════════════════════════════════════════════════╣');
  const t = totals;
  const col7 = (rate(t.d7.s, t.d7.f) + ' ' + frac(t.d7.s, t.d7.f)).padEnd(12);
  const col15 = (rate(t.d15.s, t.d15.f) + ' ' + frac(t.d15.s, t.d15.f)).padEnd(12);
  const col30 = (rate(t.d30.s, t.d30.f) + ' ' + frac(t.d30.s, t.d30.f)).padEnd(12);
  const colAll = (rate(t.all.s, t.all.f) + ' ' + frac(t.all.s, t.all.f)).padEnd(12);
  console.log('║ ' + '⭐ TOTAL GERAL'.padEnd(55) + '│ ' + col7 + '│ ' + col15 + '│ ' + col30 + '│ ' + colAll + '║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════════════════════════════════════╝');
  console.log('');
}

calcRates().then(() => process.exit(0)).catch(err => {
  console.error('Failed:', err.message);
  process.exit(1);
});
