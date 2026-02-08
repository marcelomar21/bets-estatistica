import { NextResponse } from 'next/server';
import { createApiHandler } from '@/middleware/api-handler';

export const GET = createApiHandler(async (_req, context) => {
  return NextResponse.json({
    success: true,
    data: {
      userId: context.user.id,
      email: context.user.email,
      role: context.role,
      groupId: context.groupFilter,
    },
  });
});
