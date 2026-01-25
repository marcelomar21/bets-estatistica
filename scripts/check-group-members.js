/**
 * Script: Check Group Members vs Database
 * Compara membros na tabela `members` com presença real no grupo Telegram
 *
 * Run: node scripts/check-group-members.js
 */
require('dotenv').config();

const { supabase } = require('../lib/supabase');
const { getBot } = require('../bot/telegram');
const { config } = require('../lib/config');
const { sleep } = require('../lib/utils');

const RATE_LIMIT_MS = 100; // 10 req/s para API do Telegram

async function checkMemberInGroup(bot, chatId, telegramId) {
  try {
    const member = await bot.getChatMember(chatId, telegramId);
    // Status válidos no grupo: 'member', 'administrator', 'creator', 'restricted'
    // Status fora do grupo: 'left', 'kicked'
    const inGroup = ['member', 'administrator', 'creator', 'restricted'].includes(member.status);
    return { success: true, inGroup, status: member.status };
  } catch (err) {
    // Erro 400 = usuário não encontrado no grupo
    if (err.response?.statusCode === 400) {
      return { success: true, inGroup: false, status: 'not_found' };
    }
    return { success: false, error: err.message };
  }
}

async function run() {
  console.log('🔍 Verificando membros: Banco vs Grupo Telegram\n');

  const bot = getBot();
  const publicGroupId = config.telegram.publicGroupId;

  if (!publicGroupId) {
    console.error('❌ TELEGRAM_PUBLIC_GROUP_ID não configurado');
    process.exit(1);
  }

  console.log(`📍 Grupo: ${publicGroupId}\n`);

  // 1. Buscar membros do banco com status que deveriam estar no grupo
  const { data: members, error } = await supabase
    .from('members')
    .select('id, telegram_id, telegram_username, email, status, created_at')
    .in('status', ['trial', 'ativo'])
    .order('status', { ascending: true });

  if (error) {
    console.error('❌ Erro ao buscar membros:', error.message);
    process.exit(1);
  }

  console.log(`📊 Membros no banco (trial/ativo): ${members.length}\n`);

  // Separar por quem tem telegram_id
  const withTelegramId = members.filter(m => m.telegram_id);
  const withoutTelegramId = members.filter(m => !m.telegram_id);

  console.log(`   ├─ Com telegram_id: ${withTelegramId.length}`);
  console.log(`   └─ Sem telegram_id: ${withoutTelegramId.length}\n`);

  // 2. Verificar cada membro no grupo
  const results = {
    inGroup: [],
    notInGroup: [],
    errors: []
  };

  console.log('🔄 Verificando presença no grupo...\n');

  for (let i = 0; i < withTelegramId.length; i++) {
    const member = withTelegramId[i];

    // Progress
    if ((i + 1) % 10 === 0 || i === withTelegramId.length - 1) {
      process.stdout.write(`   Progresso: ${i + 1}/${withTelegramId.length}\r`);
    }

    await sleep(RATE_LIMIT_MS);

    const result = await checkMemberInGroup(bot, publicGroupId, member.telegram_id);

    if (!result.success) {
      results.errors.push({ ...member, error: result.error });
    } else if (result.inGroup) {
      results.inGroup.push({ ...member, telegramStatus: result.status });
    } else {
      results.notInGroup.push({ ...member, telegramStatus: result.status });
    }
  }

  console.log('\n');

  // 3. Mostrar resultados
  console.log('═══════════════════════════════════════════════════════');
  console.log('                    RESULTADOS');
  console.log('═══════════════════════════════════════════════════════\n');

  // ✅ No grupo
  console.log(`✅ NO BANCO E NO GRUPO: ${results.inGroup.length}`);
  if (results.inGroup.length > 0 && results.inGroup.length <= 20) {
    results.inGroup.forEach(m => {
      const username = m.telegram_username ? `@${m.telegram_username}` : m.telegram_id;
      console.log(`   └─ ${username} (${m.status})`);
    });
  }
  console.log('');

  // ⚠️ Não no grupo (PROBLEMA)
  console.log(`⚠️  NO BANCO MAS FORA DO GRUPO: ${results.notInGroup.length}`);
  if (results.notInGroup.length > 0) {
    results.notInGroup.forEach(m => {
      const username = m.telegram_username ? `@${m.telegram_username}` : m.telegram_id;
      console.log(`   └─ ${username} | status: ${m.status} | telegram: ${m.telegramStatus}`);
    });
  }
  console.log('');

  // 🔸 Sem telegram_id
  if (withoutTelegramId.length > 0) {
    console.log(`🔸 SEM TELEGRAM_ID (aguardando /start): ${withoutTelegramId.length}`);
    withoutTelegramId.forEach(m => {
      const identifier = m.email || `id:${m.id}`;
      console.log(`   └─ ${identifier} | status: ${m.status}`);
    });
    console.log('');
  }

  // ❌ Erros
  if (results.errors.length > 0) {
    console.log(`❌ ERROS NA VERIFICAÇÃO: ${results.errors.length}`);
    results.errors.forEach(m => {
      const username = m.telegram_username ? `@${m.telegram_username}` : m.telegram_id;
      console.log(`   └─ ${username}: ${m.error}`);
    });
    console.log('');
  }

  console.log('═══════════════════════════════════════════════════════\n');

  // Resumo
  console.log('📋 RESUMO:');
  console.log(`   Total no banco (trial/ativo): ${members.length}`);
  console.log(`   Verificados no Telegram: ${withTelegramId.length}`);
  console.log(`   ✅ Presentes no grupo: ${results.inGroup.length}`);
  console.log(`   ⚠️  Ausentes do grupo: ${results.notInGroup.length}`);
  console.log(`   🔸 Aguardando /start: ${withoutTelegramId.length}`);

  if (results.notInGroup.length > 0) {
    console.log('\n💡 AÇÃO SUGERIDA: Verificar membros ausentes do grupo.');
    console.log('   Podem ter saído voluntariamente ou serem dados desatualizados.');
  }
}

run()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('❌ Erro fatal:', err.message);
    process.exit(1);
  });
