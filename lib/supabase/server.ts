import { cache } from 'react';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Request-scoped client that respects RLS as the signed-in user.
 *
 * autoRefreshToken is OFF, and that is the whole point.
 *
 * A Server Component cannot write cookies — Next throws, and the setters below
 * swallow it. So if this client were allowed to refresh, it would rotate the
 * refresh token on Supabase's side while the browser kept the old one. The
 * next time the browser presented that old token, Supabase's "detect and
 * revoke compromised refresh tokens" protection would see a reuse outside the
 * 10-second window and kill the entire session. That is the random logout.
 *
 * Refreshing happens in exactly one place: middleware.ts, which CAN persist
 * the new cookies. Everything here just reads what middleware already made
 * fresh.
 */
export function createClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
      cookies: {
        get: (name: string) => cookieStore.get(name)?.value,
        set: (name: string, value: string, options: CookieOptions) => {
          try { cookieStore.set({ name, value, ...options }); } catch { /* called from a Server Component */ }
        },
        remove: (name: string, options: CookieOptions) => {
          try { cookieStore.set({ name, value: '', ...options }); } catch { /* called from a Server Component */ }
        }
      }
    }
  );
}

/**
 * The signed-in user's profile, or null.
 *
 * Wrapped in cache() so the Header and the page body share ONE lookup per
 * request instead of each paying for its own round trip to Supabase.
 */
export const getProfile = cache(async () => {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  return data ?? null;
});

export async function requireAdmin() {
  const profile = await getProfile();
  return profile?.role === 'admin' ? profile : null;
}

/**
 * Reads the session straight from the cookie — no network call.
 *
 * Use this for DISPLAY decisions only (which nav links to render). It does not
 * re-verify the token with Supabase, which is the whole point: it saves a
 * round trip on every navigation. Anything that actually grants access still
 * goes through middleware (which calls getUser) and RLS, so a tampered cookie
 * buys nothing but a nav link that fails the moment it's clicked.
 */
export const getSessionUser = cache(async () => {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user ?? null;
});
