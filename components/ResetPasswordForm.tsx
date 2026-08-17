'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { lh } from '@/lib/href';

export default function ResetPasswordForm({ locale }: { locale: string }) {
  const t = useTranslations('auth');
  const c = useTranslations('common');
  const router = useRouter();
  const supabase = createClient();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [hasSession, setHasSession] = useState(false);

  /*
   * The callback route already exchanged the emailed code for a session, so by
   * the time this page renders there should be one. Checking explicitly means
   * a user who opens /reset-password directly gets told to request a link,
   * instead of filling in the form and hitting "Auth session missing" on
   * submit.
   */
  useEffect(() => {
    let alive = true;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!alive) return;
        setHasSession(Boolean(data.session));
        setChecking(false);
      })
      .catch(() => {
        if (!alive) return;
        setChecking(false);
      });
    return () => {
      alive = false;
    };
  }, [supabase]);

  async function submit() {
    if (password.length < 8) {
      setError(t('errShort'));
      return;
    }
    if (password !== confirm) {
      setError(t('errMismatch'));
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setDone(true);
      // The recovery session is a real session, so they are already logged in.
      setTimeout(() => {
        router.replace(lh(locale, '/course'));
        router.refresh();
      }, 1800);
    } catch (e) {
      setError(e instanceof Error ? e.message : c('error'));
    } finally {
      setBusy(false);
    }
  }

  if (checking) return <p className="text-sm text-steel">{c('loading')}</p>;

  if (!hasSession) {
    return (
      <div className="space-y-4">
        <p className="rounded-2xl border border-brass/40 bg-brass/5 p-4 text-sm text-brassInk">
          {t('resetExpired')}
        </p>
        <Link href={lh(locale, '/forgot-password')} className="block text-sm text-brass underline">
          {t('forgotLink')}
        </Link>
      </div>
    );
  }

  if (done) {
    return <p className="rounded-2xl bg-paper p-5 text-sm leading-relaxed">{t('resetDone')}</p>;
  }

  return (
    <div className="space-y-5">
      <div>
        <label htmlFor="password" className="label mb-2 block">{t('newPassword')}</label>
        <input
          id="password" type="password" autoComplete="new-password" className="field"
          value={password} onChange={(e) => setPassword(e.target.value)}
        />
      </div>

      <div>
        <label htmlFor="confirm" className="label mb-2 block">{t('confirmPassword')}</label>
        <input
          id="confirm" type="password" autoComplete="new-password" className="field"
          value={confirm} onChange={(e) => setConfirm(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
        />
      </div>

      {error && <p className="text-sm text-brandCoral">{error}</p>}

      <button
        type="button" onClick={submit} disabled={busy} aria-busy={busy}
        className="btn-primary w-full justify-center disabled:opacity-60"
      >
        {busy ? c('loading') : t('savePassword')}
      </button>
    </div>
  );
}
