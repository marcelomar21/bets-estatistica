/**
 * Compara contagem de membros: Grupo Telegram vs Banco
 *
 * Run: node scripts/compare-counts.js
 */
require('dotenv').config();

const { supabase } = require('../lib/supabase');
const { getBot } = require('../bot/telegram');
const { config } = require('../lib/config');

async function run() {
  const bot = getBot();
  const publicGroupId = config.telegram.publicGroupId;

  console.log('📊 Comparando contagens...\n');

  // Contagem no grupo Telegram
  const telegramCount = await bot.getChatMemberCount(publicGroupId);

  // Contagem no banco (trial + ativo com telegram_id)
  const { data: dbMembers, error } = await supabase
    .from('members')
    .select('id')
    .in('status', ['trial', 'ativo'])
    .not('telegram_id', 'is', null);

  if (error) {
    console.error('Erro:', error.message);
    return;
  }

  const dbCount = dbMembers.length;

  // Admins do grupo (não contam como membros pagantes)
  const admins = await bot.getChatAdministrators(publicGroupId);
  const adminCount = admins.length;

  console.log('═══════════════════════════════════════');
  console.log('         COMPARAÇÃO DE CONTAGENS');
  console.log('═══════════════════════════════════════\n');

  console.log(`👥 Total no grupo Telegram: ${telegramCount}`);
  console.log(`   └─ Admins/bots: ${adminCount}`);
  console.log(`   └─ Membros "comuns": ~${telegramCount - adminCount}\n`);

  console.log(`🗃️  No banco (trial/ativo): ${dbCount}\n`);

  const diff = (telegramCount - adminCount) - dbCount;

  if (diff > 0) {
    console.log(`⚠️  DIFERENÇA: ~${diff} pessoas no grupo SEM cadastro no banco`);
    console.log('   Essas pessoas entraram mas você não tem controle delas.\n');
    console.log('💡 SOLUÇÕES POSSÍVEIS:');
    console.log('   1. Exportar membros via Telegram Desktop (admin)');
    console.log('   2. Usar bot que detecta novos membros entrando');
    console.log('   3. Revisar histórico de quem entrou no grupo');
  } else if (diff < 0) {
    console.log(`🔸 Mais cadastros que membros (${Math.abs(diff)} a mais no banco)`);
    console.log('   Possível: membros que saíram mas ainda estão no banco.');
  } else {
    console.log('✅ Contagens batem! Tudo sincronizado.');
  }

  console.log('\n═══════════════════════════════════════\n');

  // Listar admins
  console.log('👑 ADMINS DO GRUPO:');
  admins.forEach(a => {
    const name = a.user.username ? `@${a.user.username}` : a.user.first_name;
    const isBot = a.user.is_bot ? ' (bot)' : '';
    console.log(`   └─ ${name}${isBot} - ${a.status}`);
  });
}

run()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Erro:', err.message);
    process.exit(1);
  });
