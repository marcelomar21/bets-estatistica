/**
 * Busca o nome real de cada membro do banco via API do Telegram
 */
require('dotenv').config();

const { supabase } = require('../lib/supabase');
const { getBot } = require('../bot/telegram');
const { config } = require('../lib/config');

const RATE_LIMIT_MS = 100;

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
  const bot = getBot();
  const publicGroupId = config.telegram.publicGroupId;

  const { data: members, error } = await supabase
    .from('members')
    .select('telegram_id, telegram_username, status')
    .in('status', ['trial', 'ativo'])
    .not('telegram_id', 'is', null)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Erro:', error.message);
    return;
  }

  console.log('══════════════════════════════════════════════════════════════════');
  console.log('                    NOMES DOS MEMBROS');
  console.log('══════════════════════════════════════════════════════════════════\n');

  for (let i = 0; i < members.length; i++) {
    const m = members[i];
    await sleep(RATE_LIMIT_MS);

    try {
      const chatMember = await bot.getChatMember(publicGroupId, m.telegram_id);
      const user = chatMember.user;
      const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ');
      const username = user.username ? `@${user.username}` : '(sem @)';

      console.log(`${(i+1).toString().padStart(2)}. ${fullName.padEnd(25)} | ${username.padEnd(20)} | ID: ${m.telegram_id}`);
    } catch (err) {
      const username = m.telegram_username ? `@${m.telegram_username}` : '(sem @)';
      console.log(`${(i+1).toString().padStart(2)}. (não encontrado)`.padEnd(28) + ` | ${username.padEnd(20)} | ID: ${m.telegram_id}`);
    }
  }

  console.log('\n══════════════════════════════════════════════════════════════════');
  console.log(`Total: ${members.length} membros`);
  console.log('══════════════════════════════════════════════════════════════════');
}

run()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Erro:', err.message);
    process.exit(1);
  });
