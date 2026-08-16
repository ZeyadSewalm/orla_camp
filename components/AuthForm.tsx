'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import type { Region } from '@/lib/types';
import { lh } from '@/lib/href';

export default function AuthForm({ mode, locale }: { mode: 'login' | 'signup'; locale: string }) {
  const t = useTranslations('auth');
  const c = useTranslations('common');
  const router = useRouter();
  const params = useSearchParams();
  const supabase = createClient();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [region, setRegion] = useState<Region>('egypt');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  /**
   * Turns a Supabase auth error into something a human can act on.
   *
   * "Invalid login credentials" is the single message Supabase returns for
   * several different situations — wrong password, no such user, and an
   * account that only exists as a profiles row with no auth user behind it.
   * Showing that raw string is what made this feel unfixable.
   */
  function friendly(message: string): string {
    const m = message.toLowerCase();
    if (m.includes('invalid login credentials') || m.includes('invalid credentials')) return t('errInvalid');
    if (m.includes('email not confirmed') || m.includes('not confirmed')) return t('errUnconfirmed');
    if (m.includes('rate limit') || m.includes('too many')) return t('tooMany');
    if (m.includes('already registered') || m.includes('already been registered')) return t('errExists');
    if (m.includes('password should be') || m.includes('at least 6')) return t('errWeak');
    if (m.includes('failed to fetch') || m.includes('network') || m.includes('fetch failed')) return t('errNetwork');
    return message;
  }

  async function submit() {
    // Normalising the email is not cosmetic. Supabase stores and matches the
    // address exactly as given, and a phone keyboard adds a trailing space
    // (and often a capital first letter) on its own. " Sayyed@x.com" and
    // "sayyed@x.com" are two different accounts to the auth server — one of
    // which has no password. That alone produces "Invalid login credentials"
    // with a password the user typed perfectly.
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail || !password) {
      setError(t('errMissing'));
      return;
    }

    setBusy(true);
    setError(null);
    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: {
            data: { full_name: fullName.trim(), region },
            // lh() keeps Arabic unprefixed; a hard-coded `/${locale}/login`
            // sent Arabic users to "/ar/login", which does not exist.
            emailRedirectTo: `${window.location.origin}${lh(locale, '/login')}`
          }
        });
        if (error) throw error;
        setSent(true);
      } else {
        // No pre-flight call here on purpose: it added a full round trip
        // before the login even started. Supabase rate-limits auth attempts
        // on its own side, so the guard was latency for nothing.
        const { error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
        if (error) throw error;

        // replace() so the back button doesn't land on the login form again.
        const next = params.get('next');
        router.replace(next && next.startsWith('/') ? next : lh(locale, '/course'));
        router.refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? friendly(e.message) : c('error'));
    } finally {
      setBusy(false);
    }
  }

  if (sent) return <p className="rounded-2xl border border-brass/20 bg-brass/5 p-5 text-sm">{t('verifyNotice')}</p>;

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !busy) submit();
  };

  return (
    <div className="space-y-5" onKeyDown={onKey}>
      {mode === 'signup' && (
        <div>
          <label className="label" htmlFor="name">{t('fullName')}</label>
          <input id="name" className="field" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
      )}

      <div>
        <label className="label" htmlFor="email">{t('email')}</label>
        <input
          id="email" type="email" inputMode="email" autoComplete="email"
          autoCapitalize="none" autoCorrect="off" spellCheck={false}
          className="field" value={email}
          onChange={(e) => setEmail(e.target.value)}
          onBlur={() => setEmail(email.trim().toLowerCase())}
        />
      </div>

      <div>
        <label className="label" htmlFor="password">{t('password')}</label>
        <input
          id="password" type="password" className="field"
          autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
          value={password} onChange={(e) => setPassword(e.target.value)}
        />
      </div>

      {mode === 'signup' && (
        <div>
          <span className="label">{t('region')}</span>
          <div className="flex gap-2">
            {(['egypt', 'international'] as Region[]).map((r) => (
              <button
                key={r} type="button" onClick={() => setRegion(r)} aria-pressed={region === r}
                className={`rounded-full px-4 py-2 text-sm transition ${region === r ? 'bg-brass text-white' : 'border border-ink/15 bg-white'}`}
              >
                {r === 'egypt' ? 'Egypt / مصر' : 'International'}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && <p className="rounded-2xl bg-brandRed/10 p-4 text-sm text-red-700">{error}</p>}

      <button
        type="button"
        onClick={submit}
        disabled={busy}
        aria-busy={busy}
        className="btn-primary w-full disabled:opacity-60"
      >
        {busy ? (
          <span className="flex items-center gap-2">
            <span
              aria-hidden
              className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-paper/40 border-t-paper"
            />
            {c('loading')}
          </span>
        ) : (
          mode === 'signup' ? t('signup') : t('login')
        )}
      </button>

      <Link href={lh(locale, `/${mode === 'signup' ? 'login' : 'signup'}`)} className="block text-sm text-brass underline">
        {mode === 'signup' ? t('toLogin') : t('toSignup')}
      </Link>
    </div>
  );
}
