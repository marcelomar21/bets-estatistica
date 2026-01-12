#!/usr/bin/env node
require('dotenv').config();
const { supabase } = require('../lib/supabase');

async function resetPostedBets() {
  const { data: posted, error: fetchErr } = await supabase
    .from('suggested_bets')
    .select('id, home_team_name, away_team_name, bet_market')
    .eq('bet_status', 'posted');

  if (fetchErr) {
    console.error('Erro:', fetchErr.message);
    return;
  }

  console.log('Apostas postadas encontradas:', posted?.length || 0);
  if (posted) {
    posted.forEach(b => console.log('  #' + b.id + ' - ' + b.home_team_name + ' x ' + b.away_team_name));
  }

  if (!posted || posted.length === 0) {
    console.log('Nenhuma aposta para resetar');
    return;
  }

  const { error: updateErr } = await supabase
    .from('suggested_bets')
    .update({ bet_status: 'ready' })
    .eq('bet_status', 'posted');

  if (updateErr) {
    console.error('Erro ao resetar:', updateErr.message);
    return;
  }

  console.log('✅ ' + posted.length + ' apostas resetadas para ready');
}

resetPostedBets();
