import type { Metadata } from 'next';
import Link from 'next/link';
import { unstable_setRequestLocale } from 'next-intl/server';
import { createClient, getProfile } from '@/lib/supabase/server';
import { lh } from '@/lib/href';

export const metadata: Metadata = { robots: { index: false } };
export const dynamic = 'force-dynamic';

/**
 * Diagnostic page. Tells you exactly why /admin isn't opening instead of
 * silently redirecting. Safe to delete once you're set up.
 */
export default async function WhoAmI({ params: { locale } }: { params: { locale: string } }) {
  unstable_setRequestLocale(locale);
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const profile = await getProfile();

  const rows: Array<[string, string, boolean]> = [
    ['Logged in', user ? `yes — ${user.email}` : 'NO', !!user],
    ['Email confirmed', user?.email_confirmed_at ? 'yes' : 'NO', !!user?.email_confirmed_at],
    ['Profile row exists', profile ? 'yes' : 'NO — the trigger did not fire', !!profile],
    ['Role', profile?.role ?? '—', profile?.role === 'admin'],
    ['has_access', String(profile?.has_access ?? false), !!profile?.has_access]
  ];

  return (
    <div className="mx-auto max-w-2xl px-5 py-16">
      <h1 className="display text-3xl">Account diagnostics</h1>

      <table className="mt-8 w-full text-sm">
        <tbody>
          {rows.map(([label, value, ok]) => (
            <tr key={label} className="border-b border-line">
              <td className="py-3 text-steel">{label}</td>
              <td className="py-3 font-medium">{value}</td>
              <td className="py-3 text-end">{ok ? '✅' : '❌'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {user && (
        <div className="mt-8 border border-ink/20 bg-white p-5">
          <p className="label">Your user id</p>
          <code className="block break-all text-xs">{user.id}</code>
        </div>
      )}

      {/*
        NO SQL SNIPPETS HERE ANY MORE.

        This page used to print a ready-to-paste statement — `update profiles
        set role = 'admin' ... where email = '<yours>'` — to any signed-in
        visitor who was not an admin. It is a public page, so that handed
        every student the exact table, columns and values needed for privilege
        escalation, pre-filled with their own address. Running it needs the
        service-role key, so it was never directly exploitable; it was a map,
        published to the people most likely to want it.

        The diagnostics above are the useful part and they stay. Fixing an
        account is now pointed at the admin script, which needs a key only the
        owner has.
      */}
      {user && (!profile || profile.role !== 'admin') && (
        <div className="mt-6 border-2 border-brass bg-brass/5 p-5 text-sm leading-relaxed">
          <p className="font-medium">
            {profile
              ? 'You have a profile, but you are not an administrator.'
              : 'No profile row was created for this account.'}
          </p>
          <p className="mt-2 text-steel">
            Run this from the project on your own machine, then log out and back in:
          </p>
          <pre className="mt-3 overflow-x-auto bg-ink p-4 text-xs text-paper">{`npm run create-admin -- ${user.email} '<a-strong-password>'`}</pre>
          <p className="mt-3 text-xs text-steel">
            It repairs a missing profile, grants admin, and confirms the email in one step.
            Run <code>npm run check-auth</code> first if you want to see what is wrong before changing anything.
          </p>
        </div>
      )}

      {profile?.role === 'admin' && (
        <Link href={lh(locale, '/admin')} className="btn-brass mt-8">Open the admin panel</Link>
      )}

      {!user && <Link href={lh(locale, '/login')} className="btn-primary mt-8">Log in first</Link>}
    </div>
  );
}
