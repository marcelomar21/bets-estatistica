import { NextResponse } from 'next/server';
import { createPublicHandler } from '@/middleware/api-handler';

export const GET = createPublicHandler(async () => {
  return NextResponse.json({
    success: true,
    data: { status: 'ok', timestamp: new Date().toISOString() },
  });
});
