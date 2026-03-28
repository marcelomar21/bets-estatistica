import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler } from '@/middleware/api-handler';
import { z } from 'zod';

type LinkConfigRouteContext = { params: Promise<{ groupId: string }> };

const linkConfigSchema = z.object({
  enabled: z.boolean(),
  templateUrl: z.string().url().max(2048).optional().or(z.literal('')),
  templateType: z.enum(['generic', 'search']).default('generic'),
  searchUrl: z.string().max(2048).optional().or(z.literal('')),
  bookmakerName: z.string().max(100).optional().or(z.literal('')),
  affiliateTag: z.string().max(100).optional().or(z.literal('')),
  overrideManual: z.boolean().optional(),
});

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

    const configInput = body.linkConfig || body;

    let linkConfig: z.infer<typeof linkConfigSchema>;
    try {
      linkConfig = linkConfigSchema.parse(configInput);
    } catch (err) {
      const message = err instanceof z.ZodError ? err.issues[0]?.message : 'Invalid link config';
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message } },
        { status: 400 },
      );
    }

    // Validate: if type is search, searchUrl must be provided
    if (linkConfig.enabled && linkConfig.templateType === 'search' && !linkConfig.searchUrl) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'searchUrl is required when templateType is search' } },
        { status: 400 },
      );
    }

    // Validate: if enabled, templateUrl must be provided
    if (linkConfig.enabled && !linkConfig.templateUrl) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'templateUrl is required when auto-link is enabled' } },
        { status: 400 },
      );
    }

    const { data, error } = await supabase
      .from('groups')
      .update({ link_config: linkConfig })
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
