/**
 * Lista membros do banco para comparação manual
 *
 * Run: node scripts/list-db-members.js
 */
require('dotenv').config();

const { supabase } = require('../lib/supabase');

async function run() {
  const { data, error } = await supabase
    .from('members')
    .select('telegram_id, telegram_username, email, status, created_at')
    .in('status', ['trial', 'ativo'])
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Erro:', error.message);
    return;
  }

  console.log('══════════════════════════════════════════════════════════════');
  console.log('        MEMBROS NO BANCO (trial/ativo) - PARA COMPARAR');
  console.log('══════════════════════════════════════════════════════════════\n');

  data.forEach((m, i) => {
    const username = m.telegram_username ? '@' + m.telegram_username : '(sem username)';
    const tgId = m.telegram_id || '(sem id)';
    console.log((i+1).toString().padStart(2) + '. ' + username.padEnd(25) + ' | ID: ' + tgId);
  });

  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('Total: ' + data.length + ' membros');
  console.log('══════════════════════════════════════════════════════════════\n');

  console.log('📋 LISTA DE USERNAMES (copiar):');
  console.log('─────────────────────────────────');
  data.filter(m => m.telegram_username).forEach(m => {
    console.log('@' + m.telegram_username);
  });

  const withoutUsername = data.filter(m => !m.telegram_username);
  if (withoutUsername.length > 0) {
    console.log('\n📋 SEM USERNAME (buscar por ID no Telegram):');
    console.log('─────────────────────────────────');
    withoutUsername.forEach(m => {
      console.log('ID: ' + m.telegram_id);
    });
  }
}

run();
