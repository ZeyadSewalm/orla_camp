'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { lh } from '@/lib/href';

export default function ForgotPasswordForm({ locale }: { locale: string }) {
  const t = useTranslations('auth');
  const c = useTranslations('common');
  const params = useSearchParams();
  const supabase = createClient();

  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const expired = params.get('expired') === '1';

  async function submit() {
    // Same normalisation as the login form — a trailing space from a phone
    // keyboard makes this a different address to Supabase, and the reset mail
    // goes nowhere.
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      setError(t('errMissing'));
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        // Must point at the callback route, NOT the reset page: the link
        // carries a one-time code that has to be exchanged for a session
        // server-side first. `locale` rides along so an Arabic user comes back
        // to an Arabic page.
        redirectTo: `${window.location.origin}/api/auth/callback?next=/reset-password&locale=${locale}`
      });
      if (error) throw error;
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : c('error'));
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="space-y-4">
        <p className="rounded-2xl bg-paper p-5 text-sm leading-relaxed">{t('resetSent')}</p>
        <p className="text-xs leading-relaxed text-steel">{t('resetSpamHint')}</p>
        <Link href={lh(locale, '/login')} className="block text-sm text-brass underline">
          {t('toLogin')}
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/*
        Shown when the callback route bounced them back: reset links are
        single-use and time-limited, and "nothing happened" is a terrible
        explanation for an expired link.
      */}
      {expired && (
        <p className="rounded-2xl border border-brass/40 bg-brass/5 p-4 text-sm text-brassInk">
          {t('resetExpired')}
        </p>
      )}

      <p className="text-sm leading-relaxed text-steel">{t('forgotIntro')}</p>

      <div>
        <label htmlFor="email" className="label mb-2 block">{t('email')}</label>
        <input
          id="email" type="email" inputMode="email" autoComplete="email"
          autoCapitalize="none" autoCorrect="off" spellCheck={false}
          className="field" value={email}
          onChange={(e) => setEmail(e.target.value)}
          onBlur={() => setEmail(email.trim().toLowerCase())}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
        />
      </div>

      {error && <p className="text-sm text-brandCoral">{error}</p>}

      <button
        type="button" onClick={submit} disabled={busy} aria-busy={busy}
        className="btn-primary w-full justify-center disabled:opacity-60"
      >
        {busy ? c('loading') : t('sendResetLink')}
      </button>

      <Link href={lh(locale, '/login')} className="block text-sm text-brass underline">
        {t('toLogin')}
      </Link>
    </div>
  );
}
