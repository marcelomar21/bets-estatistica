import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createApiHandler } from '@/middleware/api-handler';

const SIGNED_URL_EXPIRY = 300; // 5 minutes

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const GET = createApiHandler(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async (_req, context, routeContext: any) => {
    const { supabase, groupFilter } = context;
    const { id } = await routeContext.params;

    if (!UUID_RE.test(id)) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'ID invalido' } },
        { status: 400 },
      );
    }

    // Fetch message record
    let query = supabase
      .from('scheduled_messages')
      .select('id, group_id, media_storage_path, media_type')
      .eq('id', id);

    if (groupFilter) {
      query = query.eq('group_id', groupFilter);
    }

    const { data: message, error: fetchError } = await query.single();

    if (fetchError || !message) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Mensagem nao encontrada' } },
        { status: 404 },
      );
    }

    if (!message.media_storage_path) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Mensagem nao possui midia' } },
        { status: 404 },
      );
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!,
    );

    const { data: signedData, error: signError } = await supabaseAdmin.storage
      .from('message-media')
      .createSignedUrl(message.media_storage_path, SIGNED_URL_EXPIRY);

    if (signError || !signedData?.signedUrl) {
      return NextResponse.json(
        { success: false, error: { code: 'STORAGE_ERROR', message: 'Erro ao gerar URL da midia' } },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        url: signedData.signedUrl,
        media_type: message.media_type,
        expires_at: new Date(Date.now() + SIGNED_URL_EXPIRY * 1000).toISOString(),
      },
    });
  },
);
