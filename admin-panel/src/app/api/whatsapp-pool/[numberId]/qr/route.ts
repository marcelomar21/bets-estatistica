import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler } from '@/middleware/api-handler';

type RouteContext = { params: Promise<{ numberId: string }> };

export const GET = createApiHandler(
  async (_req: NextRequest, context, routeContext) => {
    const { numberId } = await (routeContext as RouteContext).params;

    const { data, error } = await context.supabase
      .from('whatsapp_sessions')
      .select('qr_code, connection_state, last_qr_update, updated_at')
      .eq('number_id', numberId)
      .single();

    if (error || !data) {
      return NextResponse.json({
        success: true,
        data: { qrCode: null, connectionState: 'unknown', lastUpdate: null },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        qrCode: data.qr_code,
        connectionState: data.connection_state,
        lastUpdate: data.last_qr_update || data.updated_at,
      },
    });
  },
  { allowedRoles: ['super_admin'] },
);
