/**
 * Script: Evict Ghost Members (GuruBet, 2026-05-01)
 *
 * One-off mass eviction for GuruBet ghost members — users who were added
 * to the group manually by an admin before the Gate Entry flow existed and
 * never interacted with the bot. The 2026-04-22→2026-05-01 countdown
 * campaign (scheduled_messages) asks them to /start the bot; whoever still
 * has not done so by 2026-05-01 15h BRT gets kicked.
 *
 * Filter: members in GuruBet with status in (ativo, trial), no payment,
 * no MP subscription, no invite_link, not admin, AND no `started_bot`
 * member_notifications row since the countdown cutoff. The `started_bot`
 * tracking was shipped in PR #228 (migration 068).
 *
 * Usage:
 *   node scripts/evict-ghost-members.js                 # dry-run (default)
 *   node scripts/evict-ghost-members.js --apply         # commit kicks
 *   node scripts/evict-ghost-members.js --notify-admin  # post result to admin group
 *   # flags are composable: --apply --notify-admin
 *
 * Idempotency: members already status='removido' are skipped. Each kick
 * writes a member_events row tagged with EVICTION_TAG so re-runs are safe.
 */
require('dotenv').config();

const TelegramBot = require('node-telegram-bot-api');
const { supabase } = require('../lib/supabase');
const logger = require('../lib/logger');

const GURUBET_GROUP_ID = '98f21545-f918-49a1-9499-5043bcdc6fb8';
const GURUBET_TELEGRAM_CHAT_ID = '-1003659711655';
const GURUBET_ADMIN_CHAT_ID = '-1003363567204';
const COUNTDOWN_CUTOFF_ISO = '2026-04-22T00:00:00Z';
const EVICTION_TAG = 'mass_eviction_20260501';

const DRY_RUN = !process.argv.includes('--apply');
const NOTIFY_ADMIN = process.argv.includes('--notify-admin');

function normalizeChatId(raw) {
  if (raw === null || raw === undefined) return null;
  const str = String(raw).trim();
  if (!str) return null;
  if (str.startsWith('-100')) return str;
  const num = Number(str);
  if (!Number.isFinite(num)) return null;
  return num < 0 ? String(num) : `-100${num}`;
}

async function loadGuruBetToken() {
  const { data, error } = await supabase
    .from('groups')
    .select('bot_token, telegram_group_id, telegram_admin_group_id')
    .eq('id', GURUBET_GROUP_ID)
    .maybeSingle();

  if (error) throw new Error(`Failed to load GuruBet group config: ${error.message}`);
  if (!data) throw new Error(`GuruBet group ${GURUBET_GROUP_ID} not found`);
  if (!data.bot_token) throw new Error('GuruBet group has no bot_token');

  return {
    token: data.bot_token,
    chatId: normalizeChatId(data.telegram_group_id) || GURUBET_TELEGRAM_CHAT_ID,
    adminChatId: normalizeChatId(data.telegram_admin_group_id) || GURUBET_ADMIN_CHAT_ID,
  };
}

async function fetchGhostCandidates() {
  // Two-step filter because PostgREST cannot easily express "NOT EXISTS (SELECT 1 FROM
  // member_notifications WHERE ...)" with JOIN-back. We fetch the candidate set from
  // members, then subtract members who have a 'started_bot' notification since the
  // countdown cutoff.
  const { data: baseMembers, error: baseError } = await supabase
    .from('members')
    .select('id, telegram_id, telegram_username, status, joined_group_at, notes')
    .eq('group_id', GURUBET_GROUP_ID)
    .in('status', ['ativo', 'trial'])
    .is('last_payment_at', null)
    .is('mp_subscription_id', null)
    .is('is_admin', false)
    .is('invite_link', null);

  if (baseError) throw new Error(`SELECT members failed: ${baseError.message}`);
  if (!baseMembers || baseMembers.length === 0) return [];

  const memberIds = baseMembers.map((m) => m.id);

  const { data: starters, error: starterError } = await supabase
    .from('member_notifications')
    .select('member_id')
    .eq('type', 'started_bot')
    .gte('sent_at', COUNTDOWN_CUTOFF_ISO)
    .in('member_id', memberIds);

  if (starterError) throw new Error(`SELECT notifications failed: ${starterError.message}`);

  const startedSet = new Set((starters || []).map((r) => r.member_id));
  return baseMembers.filter((m) => !startedSet.has(m.id));
}

async function getTelegramStatus(bot, chatId, telegramId) {
  try {
    const m = await bot.getChatMember(chatId, telegramId);
    return { ok: true, status: m.status };
  } catch (err) {
    const desc = err.response?.body?.description || err.message || '';
    if (err.response?.statusCode === 400 && desc.includes('user not found')) {
      return { ok: true, status: 'not_found' };
    }
    return { ok: false, error: desc };
  }
}

async function kickMember(bot, chatId, telegramId) {
  const until_date = Math.floor(Date.now() / 1000) + 24 * 60 * 60;
  try {
    await bot.banChatMember(chatId, telegramId, { until_date });
    return { ok: true, until_date };
  } catch (err) {
    const desc = err.response?.body?.description || err.message || '';
    if (desc.includes('already kicked') || desc.includes('user not found')) {
      return { ok: true, until_date, already: true };
    }
    return { ok: false, error: desc };
  }
}

async function markRemovedInDb(member, telegramStatusBeforeKick, telegramStatusAfterKick) {
  const nowIso = new Date().toISOString();
  const noteSegment = `${EVICTION_TAG}: mass kick 01/05 — não deu /start na campanha de countdown`;
  const newNotes = member.notes ? `${member.notes}\n${noteSegment}` : noteSegment;

  const { error: updateError } = await supabase
    .from('members')
    .update({
      status: 'removido',
      kicked_at: nowIso,
      notes: newNotes,
    })
    .eq('id', member.id)
    .in('status', ['ativo', 'trial', 'inadimplente']);

  if (updateError) {
    throw new Error(`UPDATE members id=${member.id} failed: ${updateError.message}`);
  }

  const { error: eventError } = await supabase.from('member_events').insert({
    member_id: member.id,
    event_type: 'kick',
    payload: {
      telegram_id: member.telegram_id,
      source: 'evict_ghost_members_script',
      reason: EVICTION_TAG,
      previous_status: member.status,
      telegram_status_before: telegramStatusBeforeKick,
      telegram_status_after: telegramStatusAfterKick,
    },
  });

  if (eventError) {
    logger.warn('[evict-ghost-members] member_events insert failed (non-blocking)', {
      memberId: member.id,
      error: eventError.message,
    });
  }
}

function formatAdminMessage(results, mode) {
  const header = mode === 'DRY-RUN'
    ? `[EVICT GHOST — DRY-RUN ${new Date().toISOString().slice(0, 16).replace('T', ' ')}]`
    : `[EVICT GHOST — APPLY ${new Date().toISOString().slice(0, 16).replace('T', ' ')}]`;

  const lines = [header, 'Grupo: GuruBet'];
  const tally = results.reduce((acc, r) => {
    acc[r.outcome] = (acc[r.outcome] || 0) + 1;
    return acc;
  }, {});

  lines.push(`Candidatos processados: ${results.length}`);
  lines.push(`Tally: ${JSON.stringify(tally)}`);
  lines.push('');

  const kicked = results.filter((r) =>
    r.outcome === 'would_kick' || r.outcome === 'kicked'
  );
  if (kicked.length > 0) {
    lines.push(mode === 'DRY-RUN' ? 'Seriam kickados:' : 'Kickados:');
    for (const r of kicked) {
      const uname = r.telegram_username ? `@${r.telegram_username}` : '—';
      lines.push(`  id=${r.memberId} tg=${r.telegramId} ${uname} (telegram: ${r.telegramStatus})`);
    }
  }

  const skipped = results.filter((r) =>
    r.outcome !== 'would_kick' && r.outcome !== 'kicked'
  );
  if (skipped.length > 0) {
    lines.push('');
    lines.push('Ignorados/erros:');
    for (const r of skipped) {
      lines.push(`  [${r.outcome}] id=${r.memberId} tg=${r.telegramId}${r.error ? ` — ${r.error}` : ''}`);
    }
  }

  if (mode === 'DRY-RUN') {
    lines.push('');
    lines.push('Apply às 15h BRT. Pra cancelar:');
    lines.push('`launchctl unload ~/Library/LaunchAgents/com.gurubet.evict-ghost-apply.plist`');
  }

  return lines.join('\n');
}

async function run() {
  const mode = DRY_RUN ? 'DRY-RUN' : 'APPLY';
  console.log(`=== evict-ghost-members ${mode} ===`);
  console.log(`Group: GuruBet (${GURUBET_GROUP_ID})`);
  console.log(`Countdown cutoff: ${COUNTDOWN_CUTOFF_ISO}`);
  console.log('');

  const groupConfig = await loadGuruBetToken();
  const bot = new TelegramBot(groupConfig.token, { polling: false });

  const candidates = await fetchGhostCandidates();
  console.log(`Candidates from DB: ${candidates.length}`);
  console.log('');

  const results = [];
  for (const member of candidates) {
    const res = {
      memberId: member.id,
      telegramId: member.telegram_id,
      telegram_username: member.telegram_username,
      telegramStatus: null,
      outcome: null,
    };

    const tgBefore = await getTelegramStatus(bot, groupConfig.chatId, member.telegram_id);
    if (!tgBefore.ok) {
      res.outcome = 'telegram_error';
      res.error = tgBefore.error;
      results.push(res);
      console.log(`  [telegram_error] id=${member.id} tg=${member.telegram_id}: ${tgBefore.error}`);
      continue;
    }

    res.telegramStatus = tgBefore.status;

    if (tgBefore.status === 'kicked' || tgBefore.status === 'left' || tgBefore.status === 'not_found') {
      res.outcome = `skip_${tgBefore.status}`;
      results.push(res);
      console.log(`  [${res.outcome}] id=${member.id} tg=${member.telegram_id}`);
      continue;
    }

    if (DRY_RUN) {
      res.outcome = 'would_kick';
      results.push(res);
      const uname = member.telegram_username ? `@${member.telegram_username}` : '';
      console.log(`  [would_kick] id=${member.id} tg=${member.telegram_id} ${uname} (in group: ${tgBefore.status})`);
      continue;
    }

    const kickRes = await kickMember(bot, groupConfig.chatId, member.telegram_id);
    if (!kickRes.ok) {
      res.outcome = 'kick_failed';
      res.error = kickRes.error;
      results.push(res);
      console.error(`  [kick_failed] id=${member.id}: ${kickRes.error}`);
      continue;
    }

    await markRemovedInDb(member, tgBefore.status, 'kicked');
    res.outcome = 'kicked';
    results.push(res);
    const uname = member.telegram_username ? `@${member.telegram_username}` : '';
    console.log(`  [kicked] id=${member.id} tg=${member.telegram_id} ${uname}`);
  }

  console.log('');
  const tally = results.reduce((acc, r) => {
    acc[r.outcome] = (acc[r.outcome] || 0) + 1;
    return acc;
  }, {});
  console.log(`Summary: ${JSON.stringify(tally)}`);

  if (NOTIFY_ADMIN) {
    const message = formatAdminMessage(results, mode);
    try {
      await bot.sendMessage(groupConfig.adminChatId, message);
      console.log(`\nAdmin notification sent to ${groupConfig.adminChatId}`);
    } catch (err) {
      console.error(`Admin notification failed: ${err.message}`);
    }
  }

  console.log(DRY_RUN
    ? '\nDRY-RUN complete. Re-run with --apply to commit kicks.'
    : '\nAPPLY complete.');
}

if (require.main === module) {
  run().catch((err) => {
    console.error('Fatal error in evict-ghost-members:', err);
    process.exit(1);
  });
}

module.exports = {
  run,
  fetchGhostCandidates,
  GURUBET_GROUP_ID,
  COUNTDOWN_CUTOFF_ISO,
  EVICTION_TAG,
};
