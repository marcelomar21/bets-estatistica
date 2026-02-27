import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler } from '@/middleware/api-handler';
import { randomUUID } from 'crypto';
import { generatePreviewCopy } from '@/lib/copy-generator';

/**
 * POST /api/bets/post-now/preview
 * Generates message previews without sending to Telegram
 * Returns previewId + generated texts for each bet
 */
export const POST = createApiHandler(
  async (req: NextRequest, context) => {
    const { supabase, groupFilter, role } = context;

    let body;
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const groupId = groupFilter || body.group_id;

    if (!groupId) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'group_id is required' } },
        { status: 400 },
      );
    }

    // Verify group exists
    const { data: group, error: groupError } = await supabase
      .from('groups')
      .select('id, name, copy_tone_config')
      .eq('id', groupId)
      .single();

    if (groupError || !group) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Group not found' } },
        { status: 404 },
      );
    }

    // Fetch eligible bets (same logic as post-now)
    const MIN_ODDS = Number(process.env.MIN_ODDS) || 1.60;
    const now = new Date().toISOString();

    const { data: queueBets, error: queueError } = await supabase
      .from('suggested_bets')
      .select(`
        id,
        bet_market,
        bet_pick,
        bet_status,
        odds,
        deep_link,
        reasoning,
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const validBets = (queueBets || []).filter((b: any) =>
      b.promovida_manual === true || (b.odds && b.odds >= MIN_ODDS)
    );

    if (validBets.length === 0) {
      return NextResponse.json({
        success: false,
        error: { code: 'NO_VALID_BETS', message: 'Nenhuma aposta valida para preview' },
      }, { status: 422 });
    }

    // Generate preview texts using LLM copy generator
    const toneConfig = group.copy_tone_config || null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const previewBets = await Promise.all(validBets.map(async (b: any) => {
      const betData = {
        homeTeamName: b.league_matches.home_team_name,
        awayTeamName: b.league_matches.away_team_name,
        betMarket: b.bet_market,
        betPick: b.bet_pick,
        odds: b.odds,
        kickoffTime: b.league_matches.kickoff_time,
        deepLink: b.deep_link,
        reasoning: b.reasoning,
      };

      let preview: string;
      try {
        const copyResult = await generatePreviewCopy(betData, toneConfig);
        if (copyResult.fullMessage) {
          preview = copyResult.copy;
        } else {
          // Assemble with template
          const kickoffDate = new Date(b.league_matches.kickoff_time);
          const kickoffStr = kickoffDate.toLocaleString('pt-BR', {
            timeZone: 'America/Sao_Paulo',
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          });
          const parts = [
            `🎯 *APOSTA DO DIA*`,
            '',
            `⚽ *${b.league_matches.home_team_name} x ${b.league_matches.away_team_name}*`,
            `🗓 ${kickoffStr}`,
            '',
            `📊 ${b.bet_market}: ${b.bet_pick}`,
            `💰 Odd: ${b.odds}`,
          ];
          if (copyResult.copy) {
            parts.push('', copyResult.copy);
          }
          if (b.deep_link) {
            parts.push('', `🔗 [Apostar Agora](${b.deep_link})`);
          }
          parts.push('', '🍀 Boa sorte!');
          preview = parts.join('\n');
        }
      } catch {
        // Fallback to static template
        preview = `🎯 ${b.league_matches.home_team_name} x ${b.league_matches.away_team_name}\n📊 ${b.bet_market}: ${b.bet_pick}\n💰 Odd: ${b.odds}\n🔗 ${b.deep_link}`;
      }

      return {
        betId: b.id,
        preview,
        betInfo: {
          homeTeam: b.league_matches.home_team_name,
          awayTeam: b.league_matches.away_team_name,
          market: b.bet_market,
          pick: b.bet_pick,
          odds: b.odds,
          kickoffTime: b.league_matches.kickoff_time,
          deepLink: b.deep_link,
        },
      };
    }));

    // Persist preview
    const previewId = `prev_${randomUUID().slice(0, 8)}`;

    const { error: insertError } = await supabase
      .from('post_previews')
      .insert({
        preview_id: previewId,
        group_id: groupId,
        user_id: context.user.id,
        bets: previewBets,
        status: 'draft',
      });

    if (insertError) {
      return NextResponse.json(
        { success: false, error: { code: 'DB_ERROR', message: insertError.message } },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        previewId,
        groupId,
        groupName: group.name,
        bets: previewBets,
        expiresInMinutes: 30,
      },
    });
  },
  { allowedRoles: ['super_admin', 'group_admin'] },
);
