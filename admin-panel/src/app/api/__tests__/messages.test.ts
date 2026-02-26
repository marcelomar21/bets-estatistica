import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { TenantContext, TenantResult } from '@/middleware/tenant';

// Mock the tenant module
const mockWithTenant = vi.fn<() => Promise<TenantResult>>();
vi.mock('@/middleware/tenant', () => ({
  withTenant: () => mockWithTenant(),
}));

function createRouteContext(params: Record<string, string>) {
  return { params: Promise.resolve(params) };
}

function createMockRequest(method: string, url: string, body?: unknown): NextRequest {
  const init: RequestInit = { method };
  if (body) {
    init.body = JSON.stringify(body);
    init.headers = { 'Content-Type': 'application/json' };
  }
  return new NextRequest(new Request(url, init));
}

function createMockContext(
  role: 'super_admin' | 'group_admin' = 'super_admin',
  supabaseMock?: { from: ReturnType<typeof vi.fn> },
): TenantContext {
  return {
    user: { id: 'user-1', email: 'admin@test.com' },
    role,
    groupFilter: role === 'super_admin' ? null : 'group-uuid-1',
    supabase: (supabaseMock ?? { from: vi.fn() }) as unknown as TenantContext['supabase'],
  };
}

const futureDate = new Date(Date.now() + 86400000).toISOString(); // 24h from now

// ============================================================
// GET /api/messages
// ============================================================
describe('GET /api/messages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('returns list of messages', async () => {
    const sampleMessage = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      group_id: 'group-uuid-1',
      message_text: 'Hello world',
      scheduled_at: futureDate,
      status: 'pending',
      groups: { name: 'Guru da Bet' },
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mockFrom = vi.fn(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const chain: Record<string, any> = {};
      chain.select = vi.fn(() => chain);
      chain.order = vi.fn(() => ({ data: [sampleMessage], error: null }));
      chain.eq = vi.fn(() => chain);
      return chain;
    });

    const context = createMockContext('super_admin', { from: mockFrom });
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('@/app/api/messages/route');
    const req = createMockRequest('GET', 'http://localhost/api/messages');

    const response = await GET(req);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].message_text).toBe('Hello world');
  });

  it('group_admin sees only their group messages', async () => {
    const eqCalls: Array<[string, unknown]> = [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mockFrom = vi.fn(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const chain: Record<string, any> = {};
      chain.select = vi.fn(() => chain);
      chain.eq = vi.fn((col: string, val: unknown) => {
        eqCalls.push([col, val]);
        return chain;
      });
      chain.order = vi.fn(() => ({ data: [], error: null }));
      return chain;
    });

    const context = createMockContext('group_admin', { from: mockFrom });
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('@/app/api/messages/route');
    const req = createMockRequest('GET', 'http://localhost/api/messages');

    const response = await GET(req);

    expect(response.status).toBe(200);
    expect(eqCalls).toContainEqual(['group_id', 'group-uuid-1']);
  });
});

// ============================================================
// POST /api/messages
// ============================================================
describe('POST /api/messages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('creates a message with status pending', async () => {
    const createdMessage = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      status: 'pending',
      scheduled_at: futureDate,
      group_id: '550e8400-e29b-41d4-a716-446655440001',
      message_text: 'Hello world',
      created_at: new Date().toISOString(),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mockFrom = vi.fn(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const chain: Record<string, any> = {};
      chain.insert = vi.fn(() => chain);
      chain.select = vi.fn(() => chain);
      chain.single = vi.fn(() => ({ data: createdMessage, error: null }));
      return chain;
    });

    const context = createMockContext('super_admin', { from: mockFrom });
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/messages/route');
    const req = createMockRequest('POST', 'http://localhost/api/messages', {
      message_text: 'Hello world',
      scheduled_at: futureDate,
      group_id: '550e8400-e29b-41d4-a716-446655440001',
    });

    const response = await POST(req);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('pending');
  });

  it('rejects past scheduled_at', async () => {
    const context = createMockContext('super_admin');
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/messages/route');
    const pastDate = new Date(Date.now() - 86400000).toISOString();
    const req = createMockRequest('POST', 'http://localhost/api/messages', {
      message_text: 'Hello',
      scheduled_at: pastDate,
      group_id: '550e8400-e29b-41d4-a716-446655440001',
    });

    const response = await POST(req);

    expect(response.status).toBe(400);
  });

  it('rejects empty message_text without media', async () => {
    const context = createMockContext('super_admin');
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/messages/route');
    const req = createMockRequest('POST', 'http://localhost/api/messages', {
      message_text: '',
      scheduled_at: futureDate,
      group_id: '550e8400-e29b-41d4-a716-446655440001',
    });

    const response = await POST(req);

    expect(response.status).toBe(400);
  });

  it('creates message with media fields', async () => {
    const createdMessage = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      status: 'pending',
      scheduled_at: futureDate,
      group_id: '550e8400-e29b-41d4-a716-446655440001',
      message_text: 'See attached',
      media_storage_path: 'group-uuid-1/abc.pdf',
      media_type: 'pdf',
      created_at: new Date().toISOString(),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mockFrom = vi.fn(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const chain: Record<string, any> = {};
      chain.insert = vi.fn(() => chain);
      chain.select = vi.fn(() => chain);
      chain.single = vi.fn(() => ({ data: createdMessage, error: null }));
      return chain;
    });

    const context = createMockContext('super_admin', { from: mockFrom });
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/messages/route');
    const req = createMockRequest('POST', 'http://localhost/api/messages', {
      message_text: 'See attached',
      scheduled_at: futureDate,
      group_id: '550e8400-e29b-41d4-a716-446655440001',
      media_storage_path: 'group-uuid-1/abc.pdf',
      media_type: 'pdf',
    });

    const response = await POST(req);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.data.media_storage_path).toBe('group-uuid-1/abc.pdf');
    expect(body.data.media_type).toBe('pdf');
  });

  it('creates media-only message (no text)', async () => {
    const createdMessage = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      status: 'pending',
      scheduled_at: futureDate,
      group_id: '550e8400-e29b-41d4-a716-446655440001',
      message_text: null,
      media_storage_path: 'group-uuid-1/img.png',
      media_type: 'image',
      created_at: new Date().toISOString(),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mockFrom = vi.fn(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const chain: Record<string, any> = {};
      chain.insert = vi.fn(() => chain);
      chain.select = vi.fn(() => chain);
      chain.single = vi.fn(() => ({ data: createdMessage, error: null }));
      return chain;
    });

    const context = createMockContext('super_admin', { from: mockFrom });
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/messages/route');
    const req = createMockRequest('POST', 'http://localhost/api/messages', {
      scheduled_at: futureDate,
      group_id: '550e8400-e29b-41d4-a716-446655440001',
      media_storage_path: 'group-uuid-1/img.png',
      media_type: 'image',
    });

    const response = await POST(req);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.data.message_text).toBeNull();
    expect(body.data.media_type).toBe('image');
  });

  it('group_admin cannot schedule for other group', async () => {
    const context = createMockContext('group_admin');
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/messages/route');
    const req = createMockRequest('POST', 'http://localhost/api/messages', {
      message_text: 'Hello',
      scheduled_at: futureDate,
      group_id: '550e8400-e29b-41d4-a716-446655440099', // different from group-uuid-1
    });

    const response = await POST(req);

    expect(response.status).toBe(403);
  });
});

// ============================================================
// DELETE /api/messages/[id]
// ============================================================
describe('DELETE /api/messages/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('cancels a pending message', async () => {
    const pendingMessage = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      status: 'pending',
      group_id: 'group-uuid-1',
    };

    let fromCallIndex = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mockFrom = vi.fn(() => {
      fromCallIndex++;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const chain: Record<string, any> = {};
      chain.select = vi.fn(() => chain);
      chain.eq = vi.fn(() => chain);
      chain.update = vi.fn(() => chain);
      chain.single = vi.fn(() => {
        if (fromCallIndex === 1) {
          return { data: pendingMessage, error: null };
        }
        return { data: null, error: null };
      });
      return chain;
    });

    const context = createMockContext('super_admin', { from: mockFrom });
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { DELETE } = await import('@/app/api/messages/[id]/route');
    const req = createMockRequest('DELETE', 'http://localhost/api/messages/550e8400-e29b-41d4-a716-446655440000');
    const routeCtx = createRouteContext({ id: '550e8400-e29b-41d4-a716-446655440000' });

    const response = await DELETE(req, routeCtx);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('rejects cancelling a sent message', async () => {
    const sentMessage = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      status: 'sent',
      group_id: 'group-uuid-1',
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mockFrom = vi.fn(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const chain: Record<string, any> = {};
      chain.select = vi.fn(() => chain);
      chain.eq = vi.fn(() => chain);
      chain.single = vi.fn(() => ({ data: sentMessage, error: null }));
      return chain;
    });

    const context = createMockContext('super_admin', { from: mockFrom });
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { DELETE } = await import('@/app/api/messages/[id]/route');
    const req = createMockRequest('DELETE', 'http://localhost/api/messages/550e8400-e29b-41d4-a716-446655440000');
    const routeCtx = createRouteContext({ id: '550e8400-e29b-41d4-a716-446655440000' });

    const response = await DELETE(req, routeCtx);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('INVALID_STATUS');
  });

  it('returns 404 for non-existent message', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mockFrom = vi.fn(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const chain: Record<string, any> = {};
      chain.select = vi.fn(() => chain);
      chain.eq = vi.fn(() => chain);
      chain.single = vi.fn(() => ({ data: null, error: { message: 'Not found' } }));
      return chain;
    });

    const context = createMockContext('super_admin', { from: mockFrom });
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { DELETE } = await import('@/app/api/messages/[id]/route');
    const req = createMockRequest('DELETE', 'http://localhost/api/messages/550e8400-e29b-41d4-a716-446655440099');
    const routeCtx = createRouteContext({ id: '550e8400-e29b-41d4-a716-446655440099' });

    const response = await DELETE(req, routeCtx);

    expect(response.status).toBe(404);
  });

  it('returns 400 for invalid UUID', async () => {
    const context = createMockContext('super_admin');
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { DELETE } = await import('@/app/api/messages/[id]/route');
    const req = createMockRequest('DELETE', 'http://localhost/api/messages/not-a-uuid');
    const routeCtx = createRouteContext({ id: 'not-a-uuid' });

    const response = await DELETE(req, routeCtx);

    expect(response.status).toBe(400);
  });
});
