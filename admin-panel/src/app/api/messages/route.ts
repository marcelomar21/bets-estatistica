import { NextResponse } from 'next/server';
import { createApiHandler } from '@/middleware/api-handler';
import { z } from 'zod';

const createMessageSchema = z.object({
  message_text: z.string().min(1, 'Texto da mensagem e obrigatorio'),
  scheduled_at: z.string().datetime({ message: 'Data deve estar no formato ISO 8601' }).refine(
    (val) => new Date(val) > new Date(),
    'Data de agendamento deve ser no futuro',
  ),
  group_id: z.string().uuid('group_id deve ser um UUID valido'),
});

export const GET = createApiHandler(
  async (_req, context) => {
    const { supabase, groupFilter } = context;

    let query = supabase
      .from('scheduled_messages')
      .select('*, groups(name)');

    if (groupFilter) {
      query = query.eq('group_id', groupFilter);
    }

    const { data, error } = await query.order('scheduled_at', { ascending: true });

    if (error) {
      return NextResponse.json(
        { success: false, error: { code: 'DB_ERROR', message: error.message } },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, data });
  },
);

export const POST = createApiHandler(
  async (req, context) => {
    const { supabase, groupFilter, user } = context;

    let body: z.infer<typeof createMessageSchema>;
    try {
      body = createMessageSchema.parse(await req.json());
    } catch (err) {
      const message = err instanceof z.ZodError ? err.issues[0]?.message : 'Corpo da requisicao invalido';
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message } },
        { status: 400 },
      );
    }

    // Group admin can only schedule for their own group
    if (groupFilter && body.group_id !== groupFilter) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Cannot schedule for other groups' } },
        { status: 403 },
      );
    }

    const { data, error } = await supabase
      .from('scheduled_messages')
      .insert({
        group_id: body.group_id,
        created_by: user.id,
        message_text: body.message_text,
        scheduled_at: body.scheduled_at,
        status: 'pending',
      })
      .select('id, status, scheduled_at, group_id, message_text, created_at')
      .single();

    if (error) {
      return NextResponse.json(
        { success: false, error: { code: 'DB_ERROR', message: error.message } },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, data }, { status: 201 });
  },
);
