import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler } from '@/middleware/api-handler';

type ToneRouteContext = { params: Promise<{ groupId: string }> };

/**
 * GET /api/groups/[groupId]/tone
 * Returns the copy_tone_config for a group
 */
export const GET = createApiHandler(
  async (_req: NextRequest, context, routeContext) => {
    const { groupId } = await (routeContext as ToneRouteContext).params;
    const { supabase, groupFilter, role } = context;

    // group_admin can only access their own group
    if (role === 'group_admin' && groupFilter !== groupId) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied to this group' } },
        { status: 403 },
      );
    }

    const { data, error } = await supabase
      .from('groups')
      .select('id, name, copy_tone_config')
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
        toneConfig: data.copy_tone_config || {},
      },
    });
  },
  { allowedRoles: ['super_admin', 'group_admin'] },
);

/**
 * PUT /api/groups/[groupId]/tone
 * Updates the copy_tone_config for a group
 * Accepts either structured config or raw text description
 */
export const PUT = createApiHandler(
  async (req: NextRequest, context, routeContext) => {
    const { groupId } = await (routeContext as ToneRouteContext).params;
    const { supabase, groupFilter, role } = context;

    // group_admin can only edit their own group
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

    // Validate config structure
    const toneConfig = body.toneConfig || body;

    // Basic validation
    if (toneConfig.forbiddenWords && toneConfig.forbiddenWords.length > 50) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Maximum 50 forbidden words allowed' } },
        { status: 400 },
      );
    }

    if (toneConfig.customRules && toneConfig.customRules.length > 20) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Maximum 20 custom rules allowed' } },
        { status: 400 },
      );
    }

    if (toneConfig.examplePost && typeof toneConfig.examplePost === 'string' && toneConfig.examplePost.length > 2000) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Example post must be under 2000 characters' } },
        { status: 400 },
      );
    }

    // Sanitize: only keep known fields
    const sanitizedConfig: Record<string, unknown> = {};
    const allowedFields = ['persona', 'tone', 'forbiddenWords', 'ctaText', 'customRules', 'rawDescription', 'examplePost'];
    for (const field of allowedFields) {
      if (toneConfig[field] !== undefined) {
        sanitizedConfig[field] = toneConfig[field];
      }
    }

    const { data, error } = await supabase
      .from('groups')
      .update({ copy_tone_config: sanitizedConfig })
      .eq('id', groupId)
      .select('id, name, copy_tone_config')
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
        toneConfig: data.copy_tone_config,
      },
    });
  },
  { allowedRoles: ['super_admin', 'group_admin'] },
);
