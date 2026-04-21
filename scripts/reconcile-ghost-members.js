/**
 * Script: Reconcile Ghost Members
 *
 * One-off cleanup for the 11 inconsistent members discovered in the
 * 2026-04-21 multi-tenant audit:
 *   - 2 "kicked zombies": DB shows status=ativo but user is kicked on
 *     Telegram (should be status=removido).
 *   - 9 "silent leavers": DB shows status=trial but user has left the
 *     group voluntarily (should be status=evadido).
 *
 * The script is idempotent via the reconciliation tag stored in notes —
 * members already reconciled on a previous run are skipped.
 *
 * Usage:
 *   node scripts/reconcile-ghost-members.js              # dry-run
 *   node scripts/reconcile-ghost-members.js --apply      # commit updates
 *
 * The dry-run prints the exact UPDATE statements that would be issued
 * (one per member), plus a summary.
 */
require('dotenv').config();

const { supabase } = require('../lib/supabase');
const logger = require('../lib/logger');

const RECONCILIATION_TAG = 'reconciliation_2026-04-21';
const DRY_RUN = !process.argv.includes('--apply');

/**
 * The 11 inconsistent members (IDs come from the audit run on 2026-04-21).
 *
 * kind='kicked' → DB row currently says ativo, Telegram says kicked.
 *   Target: status=removido, kicked_at=NOW() (only if null).
 * kind='left' → DB row currently says trial, Telegram says left.
 *   Target: status=evadido, left_at=NOW() (only if null).
 */
const GHOST_MEMBERS = [
  // Kicked zombies
  { id: 209, kind: 'kicked', label: '@clubedalutabr (Osmar Palpites)' },
  { id: 225, kind: 'kicked', label: '@clubedalutabr (GuruBet)' },
  // Silent leavers (9)
  { id: 514, kind: 'left', label: '@thiagocardosoaa (Zebrismos Tips)' },
  { id: 671, kind: 'left', label: 'leaver 1 (trial)' },
  { id: 673, kind: 'left', label: 'leaver 2 (trial)' },
  { id: 674, kind: 'left', label: 'leaver 3 (trial)' },
  { id: 679, kind: 'left', label: 'leaver 4 (trial)' },
  { id: 680, kind: 'left', label: 'leaver 5 (trial)' },
  { id: 681, kind: 'left', label: 'leaver 6 (trial)' },
  { id: 682, kind: 'left', label: 'leaver 7 (trial)' },
  { id: 684, kind: 'left', label: 'leaver 8 (trial)' },
];

async function fetchCurrent(memberId) {
  const { data, error } = await supabase
    .from('members')
    .select('id, telegram_id, status, kicked_at, left_at, notes')
    .eq('id', memberId)
    .maybeSingle();
  if (error) throw new Error(`SELECT failed for id=${memberId}: ${error.message}`);
  return data;
}

async function reconcileKicked(member) {
  const nowIso = new Date().toISOString();
  const noteSegment = `${RECONCILIATION_TAG}: marked removido (DB was ativo, Telegram status=kicked)`;
  const newNotes = member.notes ? `${member.notes}\n${noteSegment}` : noteSegment;

  if (DRY_RUN) {
    return {
      dry: true,
      sql: {
        update: {
          status: 'removido',
          kicked_at: member.kicked_at || nowIso,
          notes: newNotes,
        },
        whereId: member.id,
      },
    };
  }

  const { error: updateError } = await supabase
    .from('members')
    .update({
      status: 'removido',
      kicked_at: member.kicked_at || nowIso,
      notes: newNotes,
    })
    .eq('id', member.id)
    .in('status', ['ativo', 'trial', 'inadimplente']); // optimistic guard

  if (updateError) {
    throw new Error(`UPDATE failed for id=${member.id}: ${updateError.message}`);
  }

  const { error: eventError } = await supabase.from('member_events').insert({
    member_id: member.id,
    event_type: 'kick',
    payload: {
      telegram_id: member.telegram_id,
      source: 'reconciliation_script',
      reason: RECONCILIATION_TAG,
      previous_status: member.status,
      telegram_status: 'kicked',
    },
  });
  if (eventError) {
    logger.warn('[reconcile-ghost-members] member_events insert failed (non-blocking)', {
      memberId: member.id,
      error: eventError.message,
    });
  }

  return { dry: false, applied: true };
}

async function reconcileLeft(member) {
  const nowIso = new Date().toISOString();
  const noteSegment = `${RECONCILIATION_TAG}: marked evadido (DB was ${member.status}, Telegram status=left)`;
  const newNotes = member.notes ? `${member.notes}\n${noteSegment}` : noteSegment;

  if (DRY_RUN) {
    return {
      dry: true,
      sql: {
        update: {
          status: 'evadido',
          left_at: member.left_at || nowIso,
          notes: newNotes,
        },
        whereId: member.id,
      },
    };
  }

  const { error: updateError } = await supabase
    .from('members')
    .update({
      status: 'evadido',
      left_at: member.left_at || nowIso,
      notes: newNotes,
    })
    .eq('id', member.id)
    .in('status', ['ativo', 'trial', 'inadimplente']);

  if (updateError) {
    throw new Error(`UPDATE failed for id=${member.id}: ${updateError.message}`);
  }

  const { error: eventError } = await supabase.from('member_events').insert({
    member_id: member.id,
    event_type: 'left',
    payload: {
      telegram_id: member.telegram_id,
      source: 'reconciliation_script',
      reason: RECONCILIATION_TAG,
      previous_status: member.status,
      telegram_status: 'left',
    },
  });
  if (eventError) {
    logger.warn('[reconcile-ghost-members] member_events insert failed (non-blocking)', {
      memberId: member.id,
      error: eventError.message,
    });
  }

  return { dry: false, applied: true };
}

async function processOne(entry) {
  const member = await fetchCurrent(entry.id);
  if (!member) {
    return { id: entry.id, outcome: 'skip_not_found', label: entry.label };
  }

  // Idempotency: if notes already carry the tag, skip.
  if (typeof member.notes === 'string' && member.notes.includes(RECONCILIATION_TAG)) {
    return { id: entry.id, outcome: `skip_already_${entry.kind}`, label: entry.label };
  }

  // Already in target terminal status — stamp the tag if missing but do not
  // mutate anything else; fall back to skip to avoid touching timestamps.
  if (entry.kind === 'kicked' && member.status === 'removido') {
    return { id: entry.id, outcome: 'skip_already_removido', label: entry.label };
  }
  if (entry.kind === 'left' && member.status === 'evadido') {
    return { id: entry.id, outcome: 'skip_already_evadido', label: entry.label };
  }

  if (entry.kind === 'kicked') {
    const r = await reconcileKicked(member);
    return {
      id: entry.id,
      outcome: DRY_RUN ? 'would_mark_removido' : 'applied_removido',
      label: entry.label,
      sql: r.sql || null,
    };
  }

  const r = await reconcileLeft(member);
  return {
    id: entry.id,
    outcome: DRY_RUN ? 'would_mark_evadido' : 'applied_evadido',
    label: entry.label,
    sql: r.sql || null,
  };
}

async function run() {
  console.log(`Ghost-member reconciliation ${DRY_RUN ? '(DRY-RUN — pass --apply to commit)' : '(APPLY MODE)'}`);
  console.log(`Tag: ${RECONCILIATION_TAG}`);
  console.log(`Targets: ${GHOST_MEMBERS.length} members`);
  console.log('');

  const results = [];
  for (const entry of GHOST_MEMBERS) {
    try {
      const res = await processOne(entry);
      results.push(res);
      console.log(`  [${res.outcome}] id=${res.id} ${res.label}`);
      if (res.sql) {
        console.log(`    UPDATE members SET ${JSON.stringify(res.sql.update)} WHERE id = ${res.sql.whereId};`);
      }
    } catch (err) {
      results.push({ id: entry.id, outcome: 'error', label: entry.label, error: err.message });
      console.error(`  [error] id=${entry.id} ${entry.label}: ${err.message}`);
    }
  }

  console.log('');
  const tally = results.reduce((acc, r) => {
    acc[r.outcome] = (acc[r.outcome] || 0) + 1;
    return acc;
  }, {});
  console.log('Summary:', JSON.stringify(tally));
  console.log('');
  console.log(DRY_RUN
    ? 'DRY-RUN complete. Review the output above, then re-run with --apply to commit.'
    : 'APPLY complete.');
}

if (require.main === module) {
  run().catch((err) => {
    console.error('Fatal error in reconcile-ghost-members:', err);
    process.exit(1);
  });
}

module.exports = { run, GHOST_MEMBERS, RECONCILIATION_TAG };
