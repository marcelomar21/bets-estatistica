import { createClient } from '@supabase/supabase-js';

/**
 * Supabase client with service_role key — bypasses RLS.
 * ONLY use server-side in API routes for admin operations (e.g. creating Auth users).
 * NEVER import from client components.
 */
export function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
  );
}
