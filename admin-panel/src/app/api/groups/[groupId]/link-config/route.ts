import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler } from '@/middleware/api-handler';

type LinkConfigRouteContext = { params: Promise<{ groupId: string }> };

/**
 * GET /api/groups/[groupId]/link-config
 * Returns the link_config for a group
 */
export const GET = createApiHandler(
  async (_req: NextRequest, context, routeContext) => {
    const { groupId } = await (routeContext as LinkConfigRouteContext).params;
    const { supabase, groupFilter, role } = context;

    if (role === 'group_admin' && groupFilter !== groupId) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied to this group' } },
        { status: 403 },
      );
    }

    const { data, error } = await supabase
      .from('groups')
      .select('id, name, link_config')
      .eq('id', groupId)
      .single();

    if (error) {
      const isNotFound = error.code === 'PGRST116' || String(error.message).includes('0 rows');
      if (isNotFound) {
        return NextResponse.json(
          { success: false, error: { code: 'NOT_FOUND', message: 'Group not found' } },
          { status: 404 },
        );
      }
      return NextResponse.json(
        { success: false, error: { code: 'DB_ERROR', message: error.message } },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        groupId: data.id,
        groupName: data.name,
        linkConfig: data.link_config || {},
      },
    });
  },
  { allowedRoles: ['super_admin', 'group_admin'] },
);

/**
 * PUT /api/groups/[groupId]/link-config
 * Updates the link_config for a group
 */
export const PUT = createApiHandler(
  async (req: NextRequest, context, routeContext) => {
    const { groupId } = await (routeContext as LinkConfigRouteContext).params;
    const { supabase, groupFilter, role } = context;

    if (role === 'group_admin' && groupFilter !== groupId) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied to this group' } },
        { status: 403 },
      );
    }

    let body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid JSON body' } },
        { status: 400 },
      );
    }

    const linkConfig = body.linkConfig || body;

    // Validate required fields when enabled
    if (linkConfig.enabled) {
      if (!linkConfig.templateUrl && !linkConfig.searchUrl) {
        return NextResponse.json(
          { success: false, error: { code: 'VALIDATION_ERROR', message: 'templateUrl or searchUrl is required when enabled' } },
          { status: 400 },
        );
      }
    }

    // Validate templateType
    if (linkConfig.templateType && !['generic', 'search'].includes(linkConfig.templateType)) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'templateType must be "generic" or "search"' } },
        { status: 400 },
      );
    }

    // Validate URL formats
    const urlFields = ['templateUrl', 'searchUrl'] as const;
    for (const field of urlFields) {
      if (linkConfig[field] && typeof linkConfig[field] === 'string') {
        const url = linkConfig[field].trim();
        if (url && !url.startsWith('http://') && !url.startsWith('https://')) {
          return NextResponse.json(
            { success: false, error: { code: 'VALIDATION_ERROR', message: `${field} must start with http:// or https://` } },
            { status: 400 },
          );
        }
      }
    }

    // Validate string lengths
    if (linkConfig.bookmakerName && linkConfig.bookmakerName.length > 50) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'bookmakerName max 50 characters' } },
        { status: 400 },
      );
    }
    if (linkConfig.affiliateTag && linkConfig.affiliateTag.length > 100) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'affiliateTag max 100 characters' } },
        { status: 400 },
      );
    }

    // Sanitize: only keep known fields
    const sanitized: Record<string, unknown> = {};
    const allowedFields = [
      'enabled', 'templateUrl', 'templateType', 'searchUrl',
      'bookmakerName', 'affiliateTag', 'overrideManual',
    ];
    for (const field of allowedFields) {
      if (linkConfig[field] !== undefined) {
        sanitized[field] = linkConfig[field];
      }
    }

    const { data, error } = await supabase
      .from('groups')
      .update({ link_config: sanitized })
      .eq('id', groupId)
      .select('id, name, link_config')
      .single();

    if (error) {
      const isNotFound = error.code === 'PGRST116' || String(error.message).includes('0 rows');
      if (isNotFound) {
        return NextResponse.json(
          { success: false, error: { code: 'NOT_FOUND', message: 'Group not found' } },
          { status: 404 },
        );
      }
      return NextResponse.json(
        { success: false, error: { code: 'DB_ERROR', message: error.message } },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        groupId: data.id,
        groupName: data.name,
        linkConfig: data.link_config,
      },
    });
  },
  { allowedRoles: ['super_admin', 'group_admin'] },
);
