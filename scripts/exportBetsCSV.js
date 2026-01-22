/**
 * Export all bets with results to CSV
 */
require('dotenv').config();
const { supabase } = require('../lib/supabase');
const fs = require('fs');

async function exportBets() {
  const { data, error } = await supabase
    .from('suggested_bets')
    .select(`
      id,
      bet_market,
      bet_pick,
      bet_status,
      bet_result,
      result_reason,
      odds_at_post,
      reasoning,
      created_at,
      telegram_posted_at,
      result_updated_at,
      league_matches!inner (
        match_id,
        home_team_name,
        away_team_name,
        home_score,
        away_score,
        kickoff_time,
        status
      )
    `)
    .in('bet_result', ['success', 'failure', 'unknown'])
    .order('result_updated_at', { ascending: false });

  if (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }

  // CSV header
  const header = [
    'id',
    'data_jogo',
    'horario_jogo',
    'home',
    'away',
    'placar',
    'mercado',
    'pick',
    'odds',
    'resultado',
    'reason',
    'postado',
    'data_postagem',
    'data_resultado',
    'status_jogo'
  ].join(',');

  const rows = data.map(bet => {
    const m = bet.league_matches;
    const kickoff = new Date(m.kickoff_time);
    const dataJogo = kickoff.toLocaleDateString('pt-BR', {timeZone: 'America/Sao_Paulo'});
    const horarioJogo = kickoff.toLocaleTimeString('pt-BR', {timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit'});
    const placar = (m.home_score !== null && m.away_score !== null) ? `${m.home_score}-${m.away_score}` : '';
    const postado = bet.telegram_posted_at ? 'sim' : 'nao';
    const dataPostagem = bet.telegram_posted_at ? new Date(bet.telegram_posted_at).toLocaleDateString('pt-BR', {timeZone: 'America/Sao_Paulo'}) : '';
    const dataResultado = bet.result_updated_at ? new Date(bet.result_updated_at).toLocaleDateString('pt-BR', {timeZone: 'America/Sao_Paulo'}) : '';

    // Escape fields with commas or quotes
    const escape = (str) => {
      if (!str) return '';
      str = String(str).replace(/"/g, '""');
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str}"`;
      }
      return str;
    };

    return [
      bet.id,
      dataJogo,
      horarioJogo,
      escape(m.home_team_name),
      escape(m.away_team_name),
      placar,
      escape(bet.bet_market),
      escape(bet.bet_pick),
      bet.odds_at_post || '',
      bet.bet_result,
      escape(bet.result_reason),
      postado,
      dataPostagem,
      dataResultado,
      m.status
    ].join(',');
  });

  const csv = [header, ...rows].join('\n');
  const filename = 'bets_resultados.csv';
  fs.writeFileSync(filename, csv);
  console.log(`Exportado ${data.length} bets para ${filename}`);
}

exportBets().then(() => process.exit(0)).catch(err => {
  console.error('Failed:', err.message);
  process.exit(1);
});
