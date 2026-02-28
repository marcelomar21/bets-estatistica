import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler } from '@/middleware/api-handler';

const WHATSAPP_SERVER_URL = process.env.WHATSAPP_SERVER_URL || 'http://localhost:3100';

type GroupRouteContext = { params: Promise<{ groupId: string }> };

export const POST = createApiHandler(
  async (_req: NextRequest, context, routeContext) => {
    const { groupId } = await (routeContext as GroupRouteContext).params;

    // Validate group exists before proxying
    const { data: group, error: groupError } = await context.supabase
      .from('groups')
      .select('id, whatsapp_group_jid')
      .eq('id', groupId)
      .single();

    if (groupError || !group) {
      return NextResponse.json(
        { success: false, error: { code: 'GROUP_NOT_FOUND', message: 'Grupo nao encontrado' } },
        { status: 404 },
      );
    }

    if (group.whatsapp_group_jid) {
      return NextResponse.json(
        { success: false, error: { code: 'ALREADY_EXISTS', message: 'Grupo ja possui WhatsApp' } },
        { status: 400 },
      );
    }

    try {
      const res = await fetch(`${WHATSAPP_SERVER_URL}/api/whatsapp/groups/${groupId}/add-channel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const body = await res.json();

      if (!body.success) {
        return NextResponse.json(
          { success: false, error: body.error || { code: 'WA_ERROR', message: 'Erro ao adicionar WhatsApp' } },
          { status: res.status >= 400 ? res.status : 400 },
        );
      }

      return NextResponse.json({ success: true, data: body.data }, { status: 201 });
    } catch {
      return NextResponse.json(
        { success: false, error: { code: 'WA_SERVER_ERROR', message: 'Servidor WhatsApp indisponivel' } },
        { status: 502 },
      );
    }
  },
  { allowedRoles: ['super_admin'] },
);
