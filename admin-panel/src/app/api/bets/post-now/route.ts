import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler } from '@/middleware/api-handler';

const MIN_ODDS = Number(process.env.MIN_ODDS) || 1.60;

/**
 * POST /api/bets/post-now
 * Trigger immediate posting by setting post_now_requested_at flag.
 *
 * When betIds are provided (from preview flow), only those specific bets
 * are stored in post_now_bet_ids so the bot posts ONLY them.
 * When betIds are NOT provided, post_now_bet_ids is null → bot posts all eligible.
 */
export const POST = createApiHandler(
  async (req: NextRequest, context) => {
    const { supabase, groupFilter } = context;

    // Parse body
    let groupId = groupFilter;
    let previewId: string | null = null;
    let requestedBetIds: number[] | null = null;

    try {
      const body = await req.json();
      if (!groupId) groupId = body.group_id;
      previewId = body.previewId || null;
      if (Array.isArray(body.betIds) && body.betIds.length > 0) {
        requestedBetIds = body.betIds;
      }
    } catch {
      // No body provided
    }

    if (!groupId) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'group_id is required for super_admin' } },
        { status: 400 },
      );
    }

    const { data: group, error: groupError } = await supabase
      .from('groups')
      .select('id, enabled_modules')
      .eq('id', groupId)
      .neq('status', 'deleted')
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

    // Validate group has posting module enabled
    const modules: string[] = group.enabled_modules ?? [];
    if (!modules.includes('posting')) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Grupo nao tem o modulo de postagem habilitado' } },
        { status: 403 },
      );
    }

    // Validate preview if provided
    if (previewId) {
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
    }

    // Pre-validate bets — when requestedBetIds are provided, only validate those
    const now = new Date().toISOString();
    let query = supabase
      .from('suggested_bets')
      .select(`
        id,
        bet_status,
        odds,
        deep_link,
        promovida_manual,
        bet_group_assignments!inner (
          group_id,
          posting_status
        ),
        league_matches!inner (
          home_team_name,
          away_team_name,
          kickoff_time
        )
      `)
      .eq('bet_group_assignments.group_id', groupId)
      .in('bet_group_assignments.posting_status', ['ready', 'posted'])
      .eq('elegibilidade', 'elegivel')
      .not('deep_link', 'is', null)
      .in('bet_status', ['generated', 'pending_link', 'pending_odds', 'ready', 'posted'])
      .gt('league_matches.kickoff_time', now);

    if (requestedBetIds) {
      query = query.in('id', requestedBetIds);
    }

    const { data: queueBets, error: queueError } = await query;

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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const betIds = validBets.map((b: any) => b.id);

    // Warn about bets with distant kickoff (non-blocking)
    const MAX_DAYS_AHEAD = 2;
    const maxDate = new Date(Date.now() + MAX_DAYS_AHEAD * 24 * 60 * 60 * 1000);
    const warnings: string[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const b of validBets as any[]) {
      const kickoff = new Date(b.league_matches.kickoff_time);
      if (kickoff > maxDate) {
        const daysAhead = Math.ceil((kickoff.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
        const matchLabel = `${b.league_matches.home_team_name} x ${b.league_matches.away_team_name}`;
        warnings.push(`${matchLabel}: jogo em ${daysAhead} dia(s)`);
      }
    }

    // Set the post_now_requested_at flag + specific bet IDs + preview ID
    const updateData: Record<string, unknown> = {
      post_now_requested_at: new Date().toISOString(),
      post_now_bet_ids: betIds,
      post_now_preview_id: previewId,
    };

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

    return NextResponse.json({
      success: true,
      data: {
        message: `Postagem solicitada: ${validBets.length} aposta(s) valida(s)`,
        validCount: validBets.length,
        betIds,
        issues: issues.length > 0 ? issues : undefined,
        warnings: warnings.length > 0 ? warnings : undefined,
      },
    });
  },
  { allowedRoles: ['super_admin', 'group_admin'] },
);
