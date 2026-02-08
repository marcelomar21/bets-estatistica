import { NextRequest, NextResponse } from 'next/server';
import { withTenant, TenantContext } from './tenant';

// ADR-002: createApiHandler is the ONLY entry point for authenticated API Routes.
// Future middlewares (rate limiting, logging, etc.) must be added as
// options WITHIN ApiHandlerOptions, NOT as separate wrappers.
// This ensures withTenant() is ALWAYS applied — impossible to forget.

export type ApiHandlerOptions = {
  allowedRoles?: ('super_admin' | 'group_admin')[];
  preventRoleChange?: boolean;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ApiHandler = (
  req: NextRequest,
  context: TenantContext,
  routeContext?: any,
) => Promise<NextResponse>;

export type PublicHandler = (
  req: NextRequest,
) => Promise<NextResponse>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createApiHandler(handler: ApiHandler, options?: ApiHandlerOptions) {
  return async (req: NextRequest, ...rest: any[]) => {
    const result = await withTenant();

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: result.status },
      );
    }

    const { context } = result;

    // Check role permission
    if (options?.allowedRoles && !options.allowedRoles.includes(context.role)) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } },
        { status: 403 },
      );
    }

    // Prevent group_admin from modifying roles in request body
    if (options?.preventRoleChange && context.role === 'group_admin') {
      try {
        const body = await req.clone().json();
        if (body && typeof body === 'object' && 'role' in body) {
          return NextResponse.json(
            { success: false, error: { code: 'FORBIDDEN', message: 'Group admins cannot modify roles' } },
            { status: 403 },
          );
        }
      } catch {
        // Body not JSON or empty — safe to proceed
      }
    }

    try {
      return rest.length > 0
        ? await handler(req, context, rest[0])
        : await handler(req, context);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return NextResponse.json(
        { success: false, error: { code: 'INTERNAL_ERROR', message } },
        { status: 500 },
      );
    }
  };
}

export function createPublicHandler(handler: PublicHandler) {
  return async (req: NextRequest) => {
    try {
      return await handler(req);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return NextResponse.json(
        { success: false, error: { code: 'INTERNAL_ERROR', message } },
        { status: 500 },
      );
    }
  };
}
