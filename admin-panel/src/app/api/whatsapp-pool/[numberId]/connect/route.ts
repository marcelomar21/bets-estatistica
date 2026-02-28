import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler } from '@/middleware/api-handler';

const WHATSAPP_SERVER_URL = process.env.WHATSAPP_SERVER_URL || 'http://localhost:3100';

type RouteContext = { params: Promise<{ numberId: string }> };

export const POST = createApiHandler(
  async (_req: NextRequest, _context, routeContext) => {
    const { numberId } = await (routeContext as RouteContext).params;

    try {
      const res = await fetch(`${WHATSAPP_SERVER_URL}/api/whatsapp/numbers/${numberId}/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const body = await res.json();

      if (!body.success) {
        return NextResponse.json(
          { success: false, error: body.error || { code: 'WA_ERROR', message: 'Erro ao conectar numero' } },
          { status: res.status >= 400 ? res.status : 400 },
        );
      }

      return NextResponse.json({ success: true });
    } catch {
      return NextResponse.json(
        { success: false, error: { code: 'WA_SERVER_ERROR', message: 'Servidor WhatsApp indisponivel' } },
        { status: 502 },
      );
    }
  },
  { allowedRoles: ['super_admin'] },
);
