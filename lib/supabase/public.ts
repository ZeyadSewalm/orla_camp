import { createClient } from '@supabase/supabase-js';

/**
 * Cookie-less anon client for PUBLIC data only (tiers, modules, site settings).
 *
 * It has no session attached, which is exactly why it can be wrapped in
 * unstable_cache — a request-scoped client can't be, because it reads cookies.
 * RLS still applies; these tables have a public read policy.
 */
export const createPublicClient = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
