import { NextResponse } from 'next/server';
import { createApiHandler } from '@/middleware/api-handler';
import { z } from 'zod';

// Relaxed UUID pattern — Zod's .uuid() rejects non-RFC-4122 UUIDs (e.g. seed data)
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const distributeSchema = z.object({
  groupId: z.string().regex(UUID_RE, 'groupId deve ser um UUID valido'),
});

export const POST = createApiHandler(
  async (req, context, routeContext) => {
    const { supabase } = context;
    const { id } = await routeContext.params;
    const betId = Number.parseInt(id, 10);

    if (Number.isNaN(betId) || betId <= 0) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'ID de aposta invalido' } },
        { status: 400 },
      );
    }

    // Parse and validate body
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

    const { groupId } = body;

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

    // Fetch current bet with match data for auto-link
    const { data: currentBet, error: fetchError } = await supabase
      .from('suggested_bets')
      .select('id, group_id, bet_status, deep_link, bet_market, league_matches(home_team_name, away_team_name, kickoff_time, league_seasons(league_name))')
      .eq('id', betId)
      .single();

    if (fetchError || !currentBet) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Aposta nao encontrada' } },
        { status: 404 },
      );
    }

    const oldGroupId = currentBet.group_id;
    const isRedistribution = oldGroupId !== null;

    // Auto-assign post_at from posting_schedule (pick time with fewest bets)
    let postAt: string | null = null;
    const schedule = group.posting_schedule as { enabled?: boolean; times?: string[] } | null;
    if (schedule?.times && schedule.times.length > 0) {
      const now = new Date();
      const brTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
      const currentMin = brTime.getHours() * 60 + brTime.getMinutes();
      const futureTimes = schedule.times.filter((t: string) => {
        const [h, m] = t.split(':').map(Number);
        return (h * 60 + m) > currentMin;
      });
      const availableTimes = futureTimes.length > 0 ? futureTimes : schedule.times;

      // Count already-scheduled bets per time slot
      const { data: scheduled } = await supabase
        .from('suggested_bets')
        .select('post_at')
        .eq('group_id', groupId)
        .not('post_at', 'is', null)
        .neq('bet_status', 'posted');

      const counts: Record<string, number> = {};
      for (const t of availableTimes) counts[t] = 0;
      for (const s of (scheduled || [])) {
        if (s.post_at && counts[s.post_at] !== undefined) counts[s.post_at]++;
      }

      // Pick time with fewest bets
      let minTime = availableTimes[0];
      let minCount = counts[minTime] ?? 0;
      for (const t of availableTimes) {
        if ((counts[t] ?? 0) < minCount) { minTime = t; minCount = counts[t] ?? 0; }
      }
      postAt = minTime;
    }

    // Auto-generate deep link if group has link_config enabled
    let autoLink: string | null = null;
    const linkConfig = group.link_config as unknown as Record<string, unknown> | null;
    if (linkConfig?.enabled && (!currentBet.deep_link || linkConfig.overrideManual)) {
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

      const templateType = (linkConfig.templateType as string) || 'generic';
      let templateUrl = templateType === 'search'
        ? (linkConfig.searchUrl as string) || (linkConfig.templateUrl as string)
        : (linkConfig.templateUrl as string);

      if (templateUrl) {
        const vars: Record<string, string> = {
          '{home_team}': matchData.homeTeam,
          '{away_team}': matchData.awayTeam,
          '{league}': matchData.league,
          '{kickoff_date}': matchData.kickoffDate,
          '{market}': matchData.market,
          '{affiliate_tag}': (linkConfig.affiliateTag as string) || '',
        };
        for (const [key, value] of Object.entries(vars)) {
          templateUrl = templateUrl.replaceAll(key, encodeURIComponent(value));
        }
        autoLink = templateUrl;
      }
    }

    // Update bet: set group_id, bet_status='ready', distributed_at=now, post_at (D4)
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
      return NextResponse.json(
        { success: false, error: { code: 'DB_ERROR', message: 'Erro ao distribuir aposta' } },
        { status: 500 },
      );
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
    }

    // Fetch updated bet
    const { data: updatedBet } = await supabase
      .from('suggested_bets')
      .select('id, group_id, bet_status, distributed_at')
      .eq('id', betId)
      .single();

    return NextResponse.json({
      success: true,
      data: {
        bet: updatedBet ?? currentBet,
        redistributed: isRedistribution,
        groupName: group.name,
      },
    });
  },
  { allowedRoles: ['super_admin'] },
);
