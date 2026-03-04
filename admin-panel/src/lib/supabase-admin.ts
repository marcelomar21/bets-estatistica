import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase client with service_role key — bypasses RLS.
 * ONLY use server-side in API routes for admin operations (e.g. creating Auth users).
 * NEVER import from client components.
 * Cached as module-level singleton to avoid creating a new client per request.
 */
let _cached: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (!_cached) {
    _cached = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!,
    );
  }
  return _cached;
}
