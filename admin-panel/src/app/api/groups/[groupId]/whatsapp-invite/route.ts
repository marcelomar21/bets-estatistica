import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler } from '@/middleware/api-handler';

const WHATSAPP_SERVER_URL = process.env.WHATSAPP_SERVER_URL || 'http://localhost:3100';

type GroupRouteContext = { params: Promise<{ groupId: string }> };

export const POST = createApiHandler(
  async (_req: NextRequest, context, routeContext) => {
    const { groupId } = await (routeContext as GroupRouteContext).params;

    try {
      const res = await fetch(`${WHATSAPP_SERVER_URL}/api/whatsapp/groups/${groupId}/invite-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const body = await res.json();

      if (!body.success) {
        return NextResponse.json(
          { success: false, error: body.error || { code: 'WA_ERROR', message: 'Erro ao gerar invite link' } },
          { status: res.status >= 400 ? res.status : 400 },
        );
      }

      return NextResponse.json({ success: true, data: body.data });
    } catch {
      return NextResponse.json(
        { success: false, error: { code: 'WA_SERVER_ERROR', message: 'Servidor WhatsApp indisponivel' } },
        { status: 502 },
      );
    }
  },
  { allowedRoles: ['super_admin'] },
);

export const DELETE = createApiHandler(
  async (_req: NextRequest, context, routeContext) => {
    const { groupId } = await (routeContext as GroupRouteContext).params;

    try {
      const res = await fetch(`${WHATSAPP_SERVER_URL}/api/whatsapp/groups/${groupId}/invite-link`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      });

      const body = await res.json();

      if (!body.success) {
        return NextResponse.json(
          { success: false, error: body.error || { code: 'WA_ERROR', message: 'Erro ao revogar invite link' } },
          { status: res.status >= 400 ? res.status : 400 },
        );
      }

      return NextResponse.json({ success: true, data: body.data });
    } catch {
      return NextResponse.json(
        { success: false, error: { code: 'WA_SERVER_ERROR', message: 'Servidor WhatsApp indisponivel' } },
        { status: 502 },
      );
    }
  },
  { allowedRoles: ['super_admin'] },
);
