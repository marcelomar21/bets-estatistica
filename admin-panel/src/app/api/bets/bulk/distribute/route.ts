import { NextResponse } from 'next/server';
import { createApiHandler } from '@/middleware/api-handler';
import { z } from 'zod';

const MAX_BULK_ITEMS = 50;

// Relaxed UUID pattern — Zod's .uuid() rejects non-RFC-4122 UUIDs (e.g. seed data)
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const bulkDistributeSchema = z.object({
  betIds: z.array(z.number().int().positive()).min(1).max(MAX_BULK_ITEMS),
  groupId: z.string().regex(UUID_RE, 'groupId deve ser um UUID valido'),
});

export const POST = createApiHandler(
  async (req, context) => {
    const { supabase } = context;

    // Parse and validate body
    let body: z.infer<typeof bulkDistributeSchema>;
    try {
      body = bulkDistributeSchema.parse(await req.json());
    } catch (err) {
      const message = err instanceof z.ZodError ? err.issues[0]?.message : 'Corpo da requisicao invalido';
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message } },
        { status: 400 },
      );
    }

    const { betIds, groupId } = body;

    // Validate group exists
    const { data: group, error: groupError } = await supabase
      .from('groups')
      .select('id, name')
      .eq('id', groupId)
      .single();

    if (groupError || !group) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Group not found' } },
        { status: 400 },
      );
    }

    const results = {
      distributed: 0,
      redistributed: 0,
      failed: 0,
      errors: [] as Array<{ id: number; error: string }>,
    };

    // Process sequentially to avoid race conditions
    for (const betId of betIds) {
      // Fetch current bet
      const { data: currentBet, error: fetchError } = await supabase
        .from('suggested_bets')
        .select('id, group_id')
        .eq('id', betId)
        .single();

      if (fetchError || !currentBet) {
        results.failed++;
        results.errors.push({ id: betId, error: 'NOT_FOUND' });
        continue;
      }

      const oldGroupId = currentBet.group_id;
      const isRedistribution = oldGroupId !== null;

      // Update bet
      const { error: updateError } = await supabase
        .from('suggested_bets')
        .update({
          group_id: groupId,
          bet_status: 'ready',
          distributed_at: new Date().toISOString(),
        })
        .eq('id', betId);

      if (updateError) {
        results.failed++;
        results.errors.push({ id: betId, error: updateError.message });
        continue;
      }

      // Audit log for redistribution (P5)
      if (isRedistribution) {
        await supabase.from('audit_log').insert({
          table_name: 'suggested_bets',
          record_id: betId.toString(),
          action: 'redistribute',
          changed_by: context.user.id,
          changes: { old_group_id: oldGroupId, new_group_id: groupId },
        });
        results.redistributed++;
      }

      results.distributed++;
    }

    return NextResponse.json({
      success: true,
      data: {
        ...results,
        groupName: group.name,
      },
    });
  },
  { allowedRoles: ['super_admin'] },
);
