import { cache } from 'react';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { rethrowIfControlFlow } from '../next-errors';

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
  // Read them into locals so a missing value fails with a message that names
  // the actual problem, instead of Supabase's generic "URL and Key are
  // required" thrown from somewhere deep in the call stack.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase env vars are missing');

  return createServerClient(
    url,
    key,
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
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
    return data ?? null;
  } catch (error) {
    rethrowIfControlFlow(error);
    // Never throw from here. Callers read null as "signed out", which is the
    // safe answer: middleware and RLS are what actually gate access, not this.
    console.error('[supabase] getProfile failed:', error);
    return null;
  }
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
  try {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    return session?.user ?? null;
  } catch (error) {
    rethrowIfControlFlow(error);
    // The HEADER calls this, on every page. If it throws, every route on the
    // site returns a 500 - including the landing page, which has no reason to
    // care who you are. Verified against a production build with the
    // credentials removed: the home page used to 500 from exactly here.
    // Falling back to null just renders the signed-out navigation.
    console.error('[supabase] getSessionUser failed:', error);
    return null;
  }
});
