import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler } from '@/middleware/api-handler';

const MIN_ODDS = Number(process.env.MIN_ODDS) || 1.60;

/**
 * POST /api/bets/post-now
 * Story 5.5: Trigger immediate posting by setting post_now_requested_at flag
 *
 * Pre-validates bets before setting the flag so the admin gets real feedback
 * instead of a blind "Postagem solicitada".
 */
export const POST = createApiHandler(
  async (req: NextRequest, context) => {
    const { supabase, groupFilter } = context;

    // Determine group ID
    let groupId = groupFilter;
    // Check for preview overrides
    let previewId: string | null = null;
    if (!groupId) {
      try {
        const body = await req.json();
        groupId = body.group_id;
        previewId = body.previewId || null;
      } catch {
        // No body provided
      }
    } else {
      try {
        const bodyForPreview = await req.clone().json();
        previewId = bodyForPreview.previewId || null;
      } catch {
        // No body or already consumed
      }
    }

    if (!groupId) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'group_id is required for super_admin' } },
        { status: 400 },
      );
    }

    const { data: group, error: groupError } = await supabase
      .from('groups')
      .select('id')
      .eq('id', groupId)
      .single();

    if (groupError) {
      const msg = String(groupError.message || '');
      const isNotFound = groupError.code === 'PGRST116' || msg.includes('0 rows');
      if (isNotFound) {
        return NextResponse.json(
          { success: false, error: { code: 'NOT_FOUND', message: 'Group not found' } },
          { status: 404 },
        );
      }
      return NextResponse.json(
        { success: false, error: { code: 'DB_ERROR', message: groupError.message } },
        { status: 500 },
      );
    }

    if (!group) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Group not found' } },
        { status: 404 },
      );
    }

    // Pre-validate: mirror the bot's getBetsReadyForPosting() logic exactly
    // — eligible bets with link, any active status, future kickoff
    const now = new Date().toISOString();
    const { data: queueBets, error: queueError } = await supabase
      .from('suggested_bets')
      .select(`
        id,
        bet_status,
        odds,
        deep_link,
        promovida_manual,
        league_matches!inner (
          home_team_name,
          away_team_name,
          kickoff_time
        )
      `)
      .eq('group_id', groupId)
      .eq('elegibilidade', 'elegivel')
      .not('deep_link', 'is', null)
      .in('bet_status', ['generated', 'pending_link', 'pending_odds', 'ready', 'posted'])
      .gt('league_matches.kickoff_time', now);

    if (queueError) {
      return NextResponse.json(
        { success: false, error: { code: 'DB_ERROR', message: queueError.message } },
        { status: 500 },
      );
    }

    // Apply same filter as bot: odds >= minOdds OR promovida_manual = true
    const issues: string[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const validBets = (queueBets || []).filter((b: any) => {
      const matchLabel = b.league_matches
        ? `${b.league_matches.home_team_name} x ${b.league_matches.away_team_name}`
        : `#${b.id}`;
      if (!b.promovida_manual && (!b.odds || b.odds < MIN_ODDS)) {
        issues.push(`${matchLabel}: odds insuficientes (${b.odds ?? 'N/A'} < ${MIN_ODDS})`);
        return false;
      }
      return true;
    });

    if (validBets.length === 0) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'NO_VALID_BETS',
          message: 'Nenhuma aposta valida para enviar',
          details: issues.length > 0 ? issues : ['Nenhuma aposta elegivel na fila'],
        },
      }, { status: 422 });
    }

    // Set the post_now_requested_at flag, with optional preview link
    const updateData: Record<string, unknown> = {
      post_now_requested_at: new Date().toISOString(),
    };

    if (previewId) {
      // Validate preview exists and is not expired
      const { data: preview, error: previewError } = await supabase
        .from('post_previews')
        .select('id, status, expires_at')
        .eq('preview_id', previewId)
        .eq('group_id', groupId)
        .eq('status', 'draft')
        .single();

      if (previewError || !preview) {
        return NextResponse.json(
          { success: false, error: { code: 'PREVIEW_NOT_FOUND', message: 'Preview not found or expired' } },
          { status: 404 },
        );
      }

      if (new Date(preview.expires_at) < new Date()) {
        return NextResponse.json(
          { success: false, error: { code: 'PREVIEW_EXPIRED', message: 'Preview has expired' } },
          { status: 410 },
        );
      }

      updateData.active_preview_id = previewId;
    }

    const { error: updateError } = await supabase
      .from('groups')
      .update(updateData)
      .eq('id', groupId);

    if (updateError) {
      return NextResponse.json(
        { success: false, error: { code: 'DB_ERROR', message: updateError.message } },
        { status: 500 },
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const betIds = validBets.map((b: any) => b.id);

    return NextResponse.json({
      success: true,
      data: {
        message: `Postagem solicitada: ${validBets.length} aposta(s) valida(s)`,
        validCount: validBets.length,
        betIds,
        issues: issues.length > 0 ? issues : undefined,
      },
    });
  },
  { allowedRoles: ['super_admin', 'group_admin'] },
);
