import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler } from '@/middleware/api-handler';

const MAX_BATCH_SIZE = 100; // F10: limit batch upsert size
const MAX_DISPLAY_NAME_LENGTH = 200; // F17: max length for display_name
const MAX_RESULTS = 1000; // F5: upper bound for unbounded queries

// F3: Sanitize search input — escape PostgREST special characters
function sanitizeSearch(raw: string): string {
  return raw.replace(/[%_\\,.()"']/g, (ch) => `\\${ch}`);
}

export const GET = createApiHandler(
  async (req, context) => {
    const { supabase } = context;
    const url = new URL(req.url);

    const rawSearch = url.searchParams.get('search')?.trim() || null;
    const modifiedOnly = url.searchParams.get('modified_only') === 'true';

    let query = supabase
      .from('team_display_names')
      .select('id, api_name, display_name, is_override, updated_at')
      .order('api_name', { ascending: true })
      .limit(MAX_RESULTS); // F5: prevent unbounded result sets

    if (rawSearch) {
      const search = sanitizeSearch(rawSearch); // F3
      query = query.or(`api_name.ilike.%${search}%,display_name.ilike.%${search}%`);
    }

    if (modifiedOnly) {
      query = query.eq('is_override', true); // F1: use generated column
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json(
        { success: false, error: { code: 'DB_ERROR', message: error.message } },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, data });
  },
  { allowedRoles: ['super_admin'] },
);

interface DisplayNameUpdate {
  api_name: string;
  display_name: string;
}

export const PATCH = createApiHandler(
  async (req, context) => {
    const { supabase } = context;

    let body: { updates?: DisplayNameUpdate[] };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_BODY', message: 'Invalid JSON body' } },
        { status: 400 },
      );
    }

    const updates = body?.updates;
    if (!Array.isArray(updates) || updates.length === 0) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_BODY', message: 'updates array is required' } },
        { status: 400 },
      );
    }

    // F10: Batch size limit
    if (updates.length > MAX_BATCH_SIZE) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: `Maximum ${MAX_BATCH_SIZE} updates per request` } },
        { status: 400 },
      );
    }

    // Validate all entries
    for (const entry of updates) {
      if (!entry.api_name || typeof entry.api_name !== 'string' || !entry.api_name.trim()) { // F12: also check trim
        return NextResponse.json(
          { success: false, error: { code: 'VALIDATION_ERROR', message: 'api_name is required for each update' } },
          { status: 400 },
        );
      }
      if (!entry.display_name || typeof entry.display_name !== 'string' || !entry.display_name.trim()) {
        return NextResponse.json(
          { success: false, error: { code: 'VALIDATION_ERROR', message: 'display_name cannot be empty' } },
          { status: 400 },
        );
      }
      // F17: max length
      if (entry.display_name.trim().length > MAX_DISPLAY_NAME_LENGTH) {
        return NextResponse.json(
          { success: false, error: { code: 'VALIDATION_ERROR', message: `display_name max length is ${MAX_DISPLAY_NAME_LENGTH} characters` } },
          { status: 400 },
        );
      }
    }

    // Upsert in batch — F12: trim both api_name and display_name
    const upsertData = updates.map((u) => ({
      api_name: u.api_name.trim(),
      display_name: u.display_name.trim(),
    }));

    const { data, error } = await supabase
      .from('team_display_names')
      .upsert(upsertData, { onConflict: 'api_name' })
      .select('id, api_name, display_name, is_override, updated_at');

    if (error) {
      return NextResponse.json(
        { success: false, error: { code: 'DB_ERROR', message: error.message } },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, data });
  },
  { allowedRoles: ['super_admin'] },
);
