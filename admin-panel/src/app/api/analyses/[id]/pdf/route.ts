import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createApiHandler } from '@/middleware/api-handler';

const SIGNED_URL_EXPIRY = 3600; // 1 hour

export const GET = createApiHandler(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async (_req, context, routeContext: any) => {
    const { supabase, groupFilter } = context;
    const { id } = await routeContext.params;

    const analysisId = Number.parseInt(id, 10);
    if (Number.isNaN(analysisId) || analysisId <= 0) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'ID invalido' } },
        { status: 400 },
      );
    }

    // Fetch analysis record
    const { data: analysis, error: fetchError } = await supabase
      .from('game_analysis')
      .select('id, match_id, pdf_storage_path')
      .eq('id', analysisId)
      .single();

    if (fetchError || !analysis) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Analise nao encontrada' } },
        { status: 404 },
      );
    }

    // Group admin check: verify this analysis belongs to a match in their group
    if (groupFilter) {
      const { data: bet } = await supabase
        .from('suggested_bets')
        .select('id')
        .eq('match_id', analysis.match_id)
        .eq('group_id', groupFilter)
        .limit(1)
        .single();

      if (!bet) {
        return NextResponse.json(
          { success: false, error: { code: 'FORBIDDEN', message: 'Acesso negado' } },
          { status: 403 },
        );
      }
    }

    if (!analysis.pdf_storage_path) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'PDF not available' } },
        { status: 404 },
      );
    }

    // Use service_role client for signed URL generation
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!,
    );

    const { data: signedData, error: signError } = await supabaseAdmin.storage
      .from('analysis-pdfs')
      .createSignedUrl(analysis.pdf_storage_path, SIGNED_URL_EXPIRY);

    if (signError || !signedData?.signedUrl) {
      return NextResponse.json(
        { success: false, error: { code: 'STORAGE_ERROR', message: 'Erro ao gerar URL do PDF' } },
        { status: 500 },
      );
    }

    const expiresAt = new Date(Date.now() + SIGNED_URL_EXPIRY * 1000).toISOString();

    return NextResponse.json({
      success: true,
      data: { url: signedData.signedUrl, expiresAt },
    });
  },
);
