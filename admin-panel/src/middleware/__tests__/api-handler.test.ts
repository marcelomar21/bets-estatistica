import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, createPublicHandler } from '../api-handler';
import type { TenantContext, TenantResult } from '../tenant';

// Mock the tenant module
const mockWithTenant = vi.fn<() => Promise<TenantResult>>();
vi.mock('../tenant', () => ({
  withTenant: () => mockWithTenant(),
}));

function createMockRequest(method = 'GET', url = 'http://localhost/api/test'): NextRequest {
  return new NextRequest(new Request(url, { method }));
}

function createMockContext(overrides?: Partial<TenantContext>): TenantContext {
  return {
    user: { id: 'user-1', email: 'test@test.com' },
    role: 'super_admin',
    groupFilter: null,
    supabase: {} as TenantContext['supabase'],
    ...overrides,
  };
}

describe('createApiHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls handler with correct TenantContext on success', async () => {
    const context = createMockContext();
    mockWithTenant.mockResolvedValue({ success: true, context });

    const handler = vi.fn().mockResolvedValue(
      NextResponse.json({ success: true, data: { ok: true } }),
    );
    const wrappedHandler = createApiHandler(handler);
    const req = createMockRequest();

    const response = await wrappedHandler(req);
    const body = await response.json();

    expect(handler).toHaveBeenCalledWith(req, context);
    expect(body).toEqual({ success: true, data: { ok: true } });
  });

  it('returns 401 when user is not authenticated', async () => {
    mockWithTenant.mockResolvedValue({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      status: 401,
    });

    const handler = vi.fn();
    const wrappedHandler = createApiHandler(handler);
    const req = createMockRequest();

    const response = await wrappedHandler(req);
    const body = await response.json();

    expect(handler).not.toHaveBeenCalled();
    expect(response.status).toBe(401);
    expect(body).toEqual({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    });
  });

  it('returns 403 when user role is not in allowedRoles', async () => {
    const context = createMockContext({ role: 'group_admin', groupFilter: 'some-id' });
    mockWithTenant.mockResolvedValue({ success: true, context });

    const handler = vi.fn();
    const wrappedHandler = createApiHandler(handler, { allowedRoles: ['super_admin'] });
    const req = createMockRequest();

    const response = await wrappedHandler(req);
    const body = await response.json();

    expect(handler).not.toHaveBeenCalled();
    expect(response.status).toBe(403);
    expect(body).toEqual({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Insufficient permissions' },
    });
  });

  it('allows access when user role IS in allowedRoles', async () => {
    const context = createMockContext({ role: 'super_admin' });
    mockWithTenant.mockResolvedValue({ success: true, context });

    const handler = vi.fn().mockResolvedValue(
      NextResponse.json({ success: true, data: {} }),
    );
    const wrappedHandler = createApiHandler(handler, { allowedRoles: ['super_admin'] });
    const req = createMockRequest();

    await wrappedHandler(req);

    expect(handler).toHaveBeenCalledWith(req, context);
  });

  it('returns 500 with correct format when handler throws', async () => {
    const context = createMockContext();
    mockWithTenant.mockResolvedValue({ success: true, context });

    const handler = vi.fn().mockRejectedValue(new Error('Database connection failed'));
    const wrappedHandler = createApiHandler(handler);
    const req = createMockRequest();

    const response = await wrappedHandler(req);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Database connection failed' },
    });
  });

  it('returns 500 with "Unknown error" for non-Error throws', async () => {
    const context = createMockContext();
    mockWithTenant.mockResolvedValue({ success: true, context });

    const handler = vi.fn().mockRejectedValue('string error');
    const wrappedHandler = createApiHandler(handler);
    const req = createMockRequest();

    const response = await wrappedHandler(req);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('INTERNAL_ERROR');
    expect(body.error.message).toBe('Unknown error');
  });

  it('response always follows { success, data/error } format', async () => {
    // Success case
    const context = createMockContext();
    mockWithTenant.mockResolvedValue({ success: true, context });
    const handler = vi.fn().mockResolvedValue(
      NextResponse.json({ success: true, data: { test: true } }),
    );
    const wrappedHandler = createApiHandler(handler);
    const successResponse = await wrappedHandler(createMockRequest());
    const successBody = await successResponse.json();
    expect(successBody).toHaveProperty('success');
    expect(successBody).toHaveProperty('data');

    // Error case (auth failure)
    mockWithTenant.mockResolvedValue({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Auth required' },
      status: 401,
    });
    const errorWrapped = createApiHandler(vi.fn());
    const errorResponse = await errorWrapped(createMockRequest());
    const errorBody = await errorResponse.json();
    expect(errorBody).toHaveProperty('success', false);
    expect(errorBody).toHaveProperty('error');
    expect(errorBody.error).toHaveProperty('code');
    expect(errorBody.error).toHaveProperty('message');
  });
});

describe('createApiHandler with preventRoleChange', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('blocks group_admin from sending role in request body', async () => {
    const context = createMockContext({ role: 'group_admin', groupFilter: 'group-1' });
    mockWithTenant.mockResolvedValue({ success: true, context });

    const handler = vi.fn();
    const wrappedHandler = createApiHandler(handler, { preventRoleChange: true });
    const req = new NextRequest(
      new Request('http://localhost/api/admin-users/123', {
        method: 'PUT',
        body: JSON.stringify({ role: 'super_admin', name: 'hacker' }),
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const response = await wrappedHandler(req);
    const body = await response.json();

    expect(handler).not.toHaveBeenCalled();
    expect(response.status).toBe(403);
    expect(body).toEqual({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Group admins cannot modify roles' },
    });
  });

  it('allows super_admin to send role in request body', async () => {
    const context = createMockContext({ role: 'super_admin' });
    mockWithTenant.mockResolvedValue({ success: true, context });

    const handler = vi.fn().mockResolvedValue(
      NextResponse.json({ success: true, data: {} }),
    );
    const wrappedHandler = createApiHandler(handler, { preventRoleChange: true });
    const req = new NextRequest(
      new Request('http://localhost/api/admin-users/123', {
        method: 'PUT',
        body: JSON.stringify({ role: 'group_admin' }),
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await wrappedHandler(req);

    expect(handler).toHaveBeenCalled();
  });

  it('allows group_admin when body has no role field', async () => {
    const context = createMockContext({ role: 'group_admin', groupFilter: 'group-1' });
    mockWithTenant.mockResolvedValue({ success: true, context });

    const handler = vi.fn().mockResolvedValue(
      NextResponse.json({ success: true, data: {} }),
    );
    const wrappedHandler = createApiHandler(handler, { preventRoleChange: true });
    const req = new NextRequest(
      new Request('http://localhost/api/admin-users/123', {
        method: 'PUT',
        body: JSON.stringify({ name: 'New Name' }),
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await wrappedHandler(req);

    expect(handler).toHaveBeenCalled();
  });

  it('allows group_admin when preventRoleChange is not set', async () => {
    const context = createMockContext({ role: 'group_admin', groupFilter: 'group-1' });
    mockWithTenant.mockResolvedValue({ success: true, context });

    const handler = vi.fn().mockResolvedValue(
      NextResponse.json({ success: true, data: {} }),
    );
    const wrappedHandler = createApiHandler(handler);
    const req = new NextRequest(
      new Request('http://localhost/api/admin-users/123', {
        method: 'PUT',
        body: JSON.stringify({ role: 'super_admin' }),
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await wrappedHandler(req);

    expect(handler).toHaveBeenCalled();
  });
});

describe('createPublicHandler', () => {
  it('calls handler without TenantContext', async () => {
    const handler = vi.fn().mockResolvedValue(
      NextResponse.json({ success: true, data: { status: 'ok' } }),
    );
    const wrappedHandler = createPublicHandler(handler);
    const req = createMockRequest();

    const response = await wrappedHandler(req);
    const body = await response.json();

    expect(handler).toHaveBeenCalledWith(req);
    expect(body).toEqual({ success: true, data: { status: 'ok' } });
  });

  it('returns 500 when handler throws', async () => {
    const handler = vi.fn().mockRejectedValue(new Error('Unexpected failure'));
    const wrappedHandler = createPublicHandler(handler);
    const req = createMockRequest();

    const response = await wrappedHandler(req);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Unexpected failure' },
    });
  });
});
