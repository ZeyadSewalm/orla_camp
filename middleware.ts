import createIntlMiddleware from 'next-intl/middleware';
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { locales, defaultLocale } from './i18n';
import { lh } from './lib/href';

const intlMiddleware = createIntlMiddleware({ locales: [...locales], defaultLocale, localePrefix: 'as-needed' });

const PROTECTED = ['/course', '/admin', '/community', '/live-sessions', '/checkout'];

/**
 * Reads the access token's expiry straight out of the cookie, with no network
 * call and no signature check.
 *
 * This is ONLY used to answer "is it worth asking Supabase to refresh?".
 * A forged expiry buys an attacker nothing: it either triggers a real,
 * verified getUser() call, or skips one on a route that then still enforces
 * access through getUser() and RLS.
 */
function accessTokenExpiringSoon(request: NextRequest): boolean {
  const ref = process.env.NEXT_PUBLIC_SUPABASE_URL?.match(/https:\/\/([^.]+)\./)?.[1];
  if (!ref) return true;

  // @supabase/ssr stores the session as sb-<ref>-auth-token, chunked when large.
  const base = `sb-${ref}-auth-token`;
  const raw =
    request.cookies.get(base)?.value ??
    [0, 1, 2, 3, 4]
      .map((i) => request.cookies.get(`${base}.${i}`)?.value)
      .filter(Boolean)
      .join('');

  if (!raw) return false; // no session at all — nothing to refresh

  try {
    const json = raw.startsWith('base64-')
      ? Buffer.from(raw.slice(7), 'base64').toString('utf8')
      : decodeURIComponent(raw);
    const session = JSON.parse(json);
    const token: string | undefined = session?.access_token ?? session?.[0];
    if (!token) return true;

    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString('utf8'));
    const secondsLeft = payload.exp - Math.floor(Date.now() / 1000);

    // Refresh with a minute to spare; otherwise leave the token alone.
    return secondsLeft < 60;
  } catch {
    return true; // unreadable cookie — let Supabase decide
  }
}

export async function middleware(request: NextRequest) {
  // Dev-only timing. If a page ever feels slow again, the terminal says
  // exactly how much of it was the auth check rather than guesswork.
  const started = Date.now();
  const log = (label: string) => {
    if (process.env.NODE_ENV === 'development') {
      const ms = Date.now() - started;
      if (ms > 150) console.log(`[mw] ${label} ${request.nextUrl.pathname} — ${ms}ms`);
    }
  };

  const response = intlMiddleware(request);

  const pathname = request.nextUrl.pathname;
  const locale = locales.find((l) => pathname === `/${l}` || pathname.startsWith(`/${l}/`)) ?? defaultLocale;
  const bare = pathname.replace(/^\/(ar|en)(?=\/|$)/, '') || '/';

  /**
   * PUBLIC ROUTES RETURN IMMEDIATELY — no Supabase call at all.
   *
   * This one line fixes both symptoms at once.
   *
   * Speed: every visit to /, /pricing, /faq was paying for a round trip to
   * Supabase before a single byte of HTML was produced. From Egypt that is
   * most of a second, on every click, for a check the page never used.
   *
   * Session stability: the browser client refreshes tokens on its own in the
   * background, and it CAN write cookies. When the middleware refreshed on
   * every request too, the two of them raced — both presenting the same
   * refresh token. Supabase's "detect and revoke compromised refresh tokens"
   * then treats the second use as a replay attack and kills the session.
   * That is the random logout.
   *
   * Now there is exactly one server-side refresher, and it only runs on the
   * handful of routes that genuinely need to know who you are.
   */
  const isProtected = PROTECTED.some((p) => bare.startsWith(p));

  /**
   * On public routes we still keep the session alive — but only when the token
   * is actually about to expire. That satisfies both requirements at once:
   * the session never dies from neglect, and browsing the marketing pages
   * costs zero network calls in the normal case.
   */
  if (!isProtected) {
    if (!accessTokenExpiringSoon(request)) {
      log('public (token still fresh, no auth call)');
      return response;
    }
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name: string) => request.cookies.get(name)?.value,
        set: (name: string, value: string, options: CookieOptions) => {
          request.cookies.set({ name, value, ...options });
          response.cookies.set({ name, value, ...options });
        },
        remove: (name: string, options: CookieOptions) => {
          request.cookies.set({ name, value: '', ...options });
          response.cookies.set({ name, value: '', ...options });
        }
      }
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  // Public route: the refresh was the only reason we were here.
  if (!isProtected) {
    log('public (refreshed session)');
    return response;
  }

  if (!user) {
    return NextResponse.redirect(
      new URL(`${lh(locale, '/login')}?next=${encodeURIComponent(pathname)}`, request.url)
    );
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('has_access, role')
    .eq('id', user.id)
    .single();

  log('auth + profile');

  const staff = profile?.role === 'admin' || profile?.role === 'reviewer';

  if (bare.startsWith('/admin') && !staff) {
    return NextResponse.redirect(new URL(lh(locale, ''), request.url));
  }

  // /checkout is for signed-in users who have not paid yet, so auth is enough.
  if (!bare.startsWith('/checkout') && !profile?.has_access && !staff) {
    return NextResponse.redirect(new URL(lh(locale, '/pricing'), request.url));
  }

  return response;
}

export const config = {
  // Skip static assets and API routes entirely — they never need locale
  // handling or an auth check, and every excluded path is one less hop.
  matcher: ['/((?!api|_next|_vercel|favicon.ico|logo|.*\\..*).*)']
};
