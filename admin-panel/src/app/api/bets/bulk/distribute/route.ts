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

    // Validate group exists and is not deleted + load posting_schedule and link_config
    const { data: group, error: groupError } = await supabase
      .from('groups')
      .select('id, name, posting_schedule, link_config')
      .eq('id', groupId)
      .neq('status', 'deleted')
      .single();

    if (groupError || !group) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Group not found' } },
        { status: 400 },
      );
    }

    // Pre-compute available posting times for post_at assignment
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

    const results = {
      distributed: 0,
      redistributed: 0,
      failed: 0,
      errors: [] as Array<{ id: number; error: string }>,
    };

    // Prepare link config for auto-link generation
    const linkConfig = group.link_config as unknown as Record<string, unknown> | null;
    const autoLinkEnabled = !!(linkConfig?.enabled);

    // Process sequentially to avoid race conditions
    for (const betId of betIds) {
      // Fetch current bet with match data for auto-link
      const { data: currentBet, error: fetchError } = await supabase
        .from('suggested_bets')
        .select('id, group_id, deep_link, bet_market, league_matches(home_team_name, away_team_name, kickoff_time, league_seasons(league_name))')
        .eq('id', betId)
        .single();

      if (fetchError || !currentBet) {
        results.failed++;
        results.errors.push({ id: betId, error: 'NOT_FOUND' });
        continue;
      }

      const oldGroupId = currentBet.group_id;
      const isRedistribution = oldGroupId !== null;

      // Auto-generate deep link if group has link_config enabled
      let autoLink: string | null = null;
      if (autoLinkEnabled && (!currentBet.deep_link || linkConfig?.overrideManual)) {
        const matchRaw = currentBet.league_matches as unknown;
        const match = (Array.isArray(matchRaw) ? matchRaw[0] : matchRaw) as Record<string, unknown> | null;
        const seasonsRaw = match?.league_seasons as unknown;
        const leagueSeasons = (Array.isArray(seasonsRaw) ? seasonsRaw[0] : seasonsRaw) as Record<string, unknown> | null;
        const matchData = {
          homeTeam: (match?.home_team_name as string) || '',
          awayTeam: (match?.away_team_name as string) || '',
          league: (leagueSeasons?.league_name as string) || '',
          kickoffDate: match?.kickoff_time ? new Date(match.kickoff_time as string).toISOString().split('T')[0] : '',
          market: (currentBet.bet_market as string) || '',
        };

        const templateType = (linkConfig?.templateType as string) || 'generic';
        let templateUrl = templateType === 'search'
          ? (linkConfig?.searchUrl as string) || (linkConfig?.templateUrl as string)
          : (linkConfig?.templateUrl as string);

        if (templateUrl) {
          const vars: Record<string, string> = {
            '{home_team}': matchData.homeTeam,
            '{away_team}': matchData.awayTeam,
            '{league}': matchData.league,
            '{kickoff_date}': matchData.kickoffDate,
            '{market}': matchData.market,
            '{affiliate_tag}': (linkConfig?.affiliateTag as string) || '',
          };
          for (const [key, value] of Object.entries(vars)) {
            templateUrl = templateUrl!.replaceAll(key, encodeURIComponent(value));
          }
          autoLink = templateUrl;
        }
      }

      // Update bet with post_at auto-assignment
      const postAt = pickPostTime();
      const updatePayload: Record<string, unknown> = {
        group_id: groupId,
        bet_status: 'ready',
        distributed_at: new Date().toISOString(),
      };
      if (postAt) updatePayload.post_at = postAt;
      if (autoLink) updatePayload.deep_link = autoLink;

      const { error: updateError } = await supabase
        .from('suggested_bets')
        .update(updatePayload)
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
