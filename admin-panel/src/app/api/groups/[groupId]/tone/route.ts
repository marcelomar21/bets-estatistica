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

    // oddLabel validation
    if (toneConfig.oddLabel !== undefined) {
      if (typeof toneConfig.oddLabel !== 'string' || toneConfig.oddLabel.length > 30) {
        return NextResponse.json(
          { success: false, error: { code: 'VALIDATION_ERROR', message: 'oddLabel must be a string with max 30 characters' } },
          { status: 400 },
        );
      }
    }

    // headers validation (max 10 items, each max 50 chars)
    if (toneConfig.headers !== undefined) {
      if (!Array.isArray(toneConfig.headers) || toneConfig.headers.length > 10) {
        return NextResponse.json(
          { success: false, error: { code: 'VALIDATION_ERROR', message: 'Maximum 10 headers allowed' } },
          { status: 400 },
        );
      }
      if (toneConfig.headers.some((h: unknown) => typeof h !== 'string' || (h as string).length > 50)) {
        return NextResponse.json(
          { success: false, error: { code: 'VALIDATION_ERROR', message: 'Each header must be a string with max 50 characters' } },
          { status: 400 },
        );
      }
    }

    // footers validation (max 10 items, each max 100 chars)
    if (toneConfig.footers !== undefined) {
      if (!Array.isArray(toneConfig.footers) || toneConfig.footers.length > 10) {
        return NextResponse.json(
          { success: false, error: { code: 'VALIDATION_ERROR', message: 'Maximum 10 footers allowed' } },
          { status: 400 },
        );
      }
      if (toneConfig.footers.some((f: unknown) => typeof f !== 'string' || (f as string).length > 100)) {
        return NextResponse.json(
          { success: false, error: { code: 'VALIDATION_ERROR', message: 'Each footer must be a string with max 100 characters' } },
          { status: 400 },
        );
      }
    }

    // ctaTexts validation (max 3 items, each max 50 chars)
    if (toneConfig.ctaTexts !== undefined) {
      if (!Array.isArray(toneConfig.ctaTexts) || toneConfig.ctaTexts.length > 3) {
        return NextResponse.json(
          { success: false, error: { code: 'VALIDATION_ERROR', message: 'Maximum 3 CTA texts allowed' } },
          { status: 400 },
        );
      }
      if (toneConfig.ctaTexts.some((c: unknown) => typeof c !== 'string' || (c as string).length > 50)) {
        return NextResponse.json(
          { success: false, error: { code: 'VALIDATION_ERROR', message: 'Each CTA text must be a string with max 50 characters' } },
          { status: 400 },
        );
      }
    }

    // suggestedWords validation (max 30 items)
    if (toneConfig.suggestedWords !== undefined) {
      if (!Array.isArray(toneConfig.suggestedWords) || toneConfig.suggestedWords.length > 30) {
        return NextResponse.json(
          { success: false, error: { code: 'VALIDATION_ERROR', message: 'Maximum 30 suggested words allowed' } },
          { status: 400 },
        );
      }
    }

    // examplePosts validation (max 5 items, each max 2000 chars)
    if (toneConfig.examplePosts !== undefined) {
      if (!Array.isArray(toneConfig.examplePosts) || toneConfig.examplePosts.length > 5) {
        return NextResponse.json(
          { success: false, error: { code: 'VALIDATION_ERROR', message: 'Maximum 5 example posts allowed' } },
          { status: 400 },
        );
      }
      if (toneConfig.examplePosts.some((e: unknown) => typeof e !== 'string' || (e as string).length > 2000)) {
        return NextResponse.json(
          { success: false, error: { code: 'VALIDATION_ERROR', message: 'Each example post must be under 2000 characters' } },
          { status: 400 },
        );
      }
    }

    // Sanitize: only keep known fields
    const sanitizedConfig: Record<string, unknown> = {};
    const allowedFields = [
      'persona', 'tone', 'forbiddenWords', 'ctaText', 'customRules',
      'rawDescription', 'examplePost',
      // New fields
      'suggestedWords', 'oddLabel', 'headers', 'footers', 'ctaTexts', 'examplePosts',
    ];
    for (const field of allowedFields) {
      if (toneConfig[field] !== undefined) {
        sanitizedConfig[field] = toneConfig[field];
      }
    }

    // Auto-migrate legacy ctaText → ctaTexts[0]
    if (sanitizedConfig.ctaText && !sanitizedConfig.ctaTexts) {
      sanitizedConfig.ctaTexts = [sanitizedConfig.ctaText as string];
    }

    // Auto-migrate legacy examplePost → examplePosts[0]
    if (sanitizedConfig.examplePost && !sanitizedConfig.examplePosts) {
      sanitizedConfig.examplePosts = [sanitizedConfig.examplePost as string];
    }

    const { data, error } = await supabase
      .from('groups')
      .update({ copy_tone_config: sanitizedConfig })
      .eq('id', groupId)
      .select('id, name, copy_tone_config')
      .single();

    if (!error) {
      // Invalidate persisted generated_copy for ALL bets of this group
      // (including posted) so reposted bets also regenerate with new tone
      const { error: clearError } = await supabase
        .from('suggested_bets')
        .update({ generated_copy: null })
        .eq('group_id', groupId);
      if (clearError) {
        console.warn('[tone] Failed to clear generated_copy on tone change', { groupId, error: clearError.message });
      }
    }

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
