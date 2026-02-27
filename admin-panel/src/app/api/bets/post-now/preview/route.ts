import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler } from '@/middleware/api-handler';
import { randomUUID } from 'crypto';
import { fetchWithRetry } from '@/lib/fetch-utils';

const BOT_API_URL = process.env.BOT_API_URL;
const BOT_PREVIEW_API_KEY = process.env.BOT_PREVIEW_API_KEY;

/**
 * POST /api/bets/post-now/preview
 * Proxies to the bot's /api/preview endpoint, which runs the SAME
 * formatBetMessage() pipeline used for real Telegram posting.
 */
export const POST = createApiHandler(
  async (req: NextRequest, context) => {
    const { supabase, groupFilter } = context;

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

    if (!BOT_API_URL || !BOT_PREVIEW_API_KEY) {
      return NextResponse.json(
        { success: false, error: { code: 'CONFIG_ERROR', message: 'BOT_API_URL or BOT_PREVIEW_API_KEY not configured' } },
        { status: 500 },
      );
    }

    // Proxy to bot's preview endpoint
    const botResponse = await fetchWithRetry(
      `${BOT_API_URL}/api/preview`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${BOT_PREVIEW_API_KEY}`,
        },
        body: JSON.stringify({ group_id: groupId }),
      },
      2,   // 2 retries (bot on Render may cold-start)
      3000, // 3s delay between retries
    );

    if (!botResponse.ok) {
      const errorBody = await botResponse.json().catch(() => ({ error: 'Unknown bot error' }));
      const statusCode = botResponse.status === 422 ? 422 : 500;
      return NextResponse.json(
        {
          success: false,
          error: {
            code: statusCode === 422 ? 'NO_VALID_BETS' : 'BOT_ERROR',
            message: errorBody.error?.message || errorBody.error || 'Bot preview failed',
          },
        },
        { status: statusCode },
      );
    }

    const botResult = await botResponse.json();

    // Persist preview
    const previewId = `prev_${randomUUID().slice(0, 8)}`;

    const { error: insertError } = await supabase
      .from('post_previews')
      .insert({
        preview_id: previewId,
        group_id: groupId,
        user_id: context.user.id,
        bets: botResult.data.bets,
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
        groupId: botResult.data.groupId,
        groupName: botResult.data.groupName,
        bets: botResult.data.bets,
        expiresInMinutes: 30,
      },
    });
  },
  { allowedRoles: ['super_admin', 'group_admin'] },
);
