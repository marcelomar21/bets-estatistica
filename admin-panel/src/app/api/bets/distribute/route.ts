import { NextResponse } from 'next/server';
import { createApiHandler } from '@/middleware/api-handler';
import { z } from 'zod';

const MAX_BULK_ITEMS = 50;
const MAX_GROUPS = 20;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const distributeSchema = z.object({
  betIds: z.array(z.number().int().positive()).min(1).max(MAX_BULK_ITEMS),
  groupIds: z.array(z.string().regex(UUID_RE, 'groupId deve ser um UUID valido')).min(1).max(MAX_GROUPS),
});

export const POST = createApiHandler(
  async (req, context) => {
    const { supabase } = context;

    let body: z.infer<typeof distributeSchema>;
    try {
      body = distributeSchema.parse(await req.json());
    } catch (err) {
      const message = err instanceof z.ZodError ? err.issues[0]?.message : 'Corpo da requisicao invalido';
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message } },
        { status: 400 },
      );
    }

    const { betIds, groupIds } = body;

    // Validate all groups exist and are not deleted
    const { data: validGroups, error: groupsError } = await supabase
      .from('groups')
      .select('id, name, posting_schedule')
      .in('id', groupIds)
      .neq('status', 'deleted');

    if (groupsError) {
      return NextResponse.json(
        { success: false, error: { code: 'DB_ERROR', message: groupsError.message } },
        { status: 500 },
      );
    }

    if (!validGroups || validGroups.length === 0) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Nenhum grupo valido encontrado' } },
        { status: 400 },
      );
    }

    const validGroupIds = new Set(validGroups.map((g) => g.id));
    const groupNameMap = new Map(validGroups.map((g) => [g.id, g.name]));

    // Fetch current state of all bets
    const { data: currentBets, error: betsError } = await supabase
      .from('suggested_bets')
      .select('id, group_id')
      .in('id', betIds);

    if (betsError) {
      return NextResponse.json(
        { success: false, error: { code: 'DB_ERROR', message: betsError.message } },
        { status: 500 },
      );
    }

    const betMap = new Map((currentBets ?? []).map((b) => [b.id, b.group_id as string | null]));

    const results = { created: 0, alreadyExisted: 0, failed: 0 };

    // Process each bet-group combination
    for (const groupId of groupIds) {
      if (!validGroupIds.has(groupId)) continue;

      // Pre-compute posting schedule for this group
      const group = validGroups.find((g) => g.id === groupId)!;
      const schedule = group.posting_schedule as { enabled?: boolean; times?: string[] } | null;
      let availableTimes: string[] = [];
      const timeCounts: Record<string, number> = {};

      if (schedule?.times && schedule.times.length > 0) {
        const now = new Date();
        const brTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
        const currentMin = brTime.getHours() * 60 + brTime.getMinutes();
        const futureTimes = schedule.times.filter((t: string) => {
          const [h, m] = t.split(':').map(Number);
          return (h * 60 + m) > currentMin;
        });
        availableTimes = futureTimes.length > 0 ? futureTimes : schedule.times;

        for (const t of availableTimes) timeCounts[t] = 0;
        const { data: scheduled } = await supabase
          .from('suggested_bets')
          .select('post_at')
          .eq('group_id', groupId)
          .not('post_at', 'is', null)
          .neq('bet_status', 'posted');
        for (const s of (scheduled || [])) {
          if (s.post_at && timeCounts[s.post_at] !== undefined) timeCounts[s.post_at]++;
        }
      }

      function pickPostTime(): string | null {
        if (availableTimes.length === 0) return null;
        let minTime = availableTimes[0];
        let minCount = timeCounts[minTime] ?? 0;
        for (const t of availableTimes) {
          if ((timeCounts[t] ?? 0) < minCount) { minTime = t; minCount = timeCounts[t] ?? 0; }
        }
        timeCounts[minTime] = (timeCounts[minTime] ?? 0) + 1;
        return minTime;
      }

      for (const betId of betIds) {
        const currentGroupId = betMap.get(betId);

        // Bet not found in our fetch — skip
        if (currentGroupId === undefined && !betMap.has(betId)) {
          results.failed++;
          continue;
        }

        // Already assigned to this group — skip
        if (currentGroupId === groupId) {
          results.alreadyExisted++;
          continue;
        }

        const isRedistribution = currentGroupId !== null;
        const postAt = pickPostTime();
        const updatePayload: Record<string, unknown> = {
          group_id: groupId,
          bet_status: 'ready',
          distributed_at: new Date().toISOString(),
        };
        if (postAt) updatePayload.post_at = postAt;

        const { error: updateError } = await supabase
          .from('suggested_bets')
          .update(updatePayload)
          .eq('id', betId);

        if (updateError) {
          results.failed++;
          continue;
        }

        // Update local map so next group iteration sees current state
        betMap.set(betId, groupId);

        if (isRedistribution) {
          await supabase.from('audit_log').insert({
            table_name: 'suggested_bets',
            record_id: betId.toString(),
            action: 'redistribute',
            changed_by: context.user.id,
            changes: { old_group_id: currentGroupId, new_group_id: groupId },
          });
        }

        results.created++;
      }
    }

    const groupNames = groupIds
      .filter((id) => validGroupIds.has(id))
      .map((id) => groupNameMap.get(id))
      .join(', ');

    return NextResponse.json({
      success: true,
      data: {
        created: results.created,
        alreadyExisted: results.alreadyExisted,
        failed: results.failed,
        groupNames,
      },
    });
  },
  { allowedRoles: ['super_admin', 'group_admin'] },
);
