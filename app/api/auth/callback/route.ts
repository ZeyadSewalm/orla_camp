import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { lh } from '@/lib/href';
import { locales, defaultLocale } from '@/i18n';

export const dynamic = 'force-dynamic';

/**
 * Where every Supabase email link lands: password reset, and email
 * confirmation too.
 *
 * WHY THIS ROUTE HAS TO EXIST
 * The reset link Supabase mails out does NOT contain a session. It carries a
 * one-time `code`, and that code has to be exchanged for a real session before
 * the user can change anything. `exchangeCodeForSession` does the exchange and
 * writes the session cookies onto the response — which is why this must be a
 * route handler and not a page: only a route handler can set cookies on a
 * redirect.
 *
 * Without it, the user clicks the email, lands on the reset page with no
 * session, and `updateUser` fails with "Auth session missing". That is the
 * usual reason a reset flow looks like it silently does nothing.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/reset-password';

  // The locale is carried through the email round trip so an Arabic user does
  // not come back to an English page.
  const localeParam = searchParams.get('locale');
  const locale = locales.includes(localeParam as never) ? (localeParam as string) : defaultLocale;

  // Supabase reports its own failures here (expired link, already used).
  const errorCode = searchParams.get('error_code') ?? searchParams.get('error');
  if (errorCode) {
    return NextResponse.redirect(new URL(`${lh(locale, '/forgot-password')}?expired=1`, origin));
  }

  if (!code) {
    return NextResponse.redirect(new URL(`${lh(locale, '/login')}`, origin));
  }

  const response = NextResponse.redirect(new URL(`${lh(locale, next)}`, origin));

  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error('Supabase env vars are missing');

    const supabase = createServerClient(url, key, {
      cookies: {
        get: (name: string) => request.cookies.get(name)?.value,
        set: (name: string, value: string, options: CookieOptions) => {
          response.cookies.set({ name, value, ...options });
        },
        remove: (name: string, options: CookieOptions) => {
          response.cookies.set({ name, value: '', ...options });
        }
      }
    });

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw error;

    return response;
  } catch (error) {
    console.error('[auth/callback] code exchange failed:', error);
    return NextResponse.redirect(new URL(`${lh(locale, '/forgot-password')}?expired=1`, origin));
  }
}
