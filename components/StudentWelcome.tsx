'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Mail, Sparkles } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || '?';
}

export default function StudentWelcome({
  initialName,
  initialEmail,
  initialAvatarUrl
}: {
  initialName: string;
  initialEmail: string;
  initialAvatarUrl: string | null;
}) {
  const t = useTranslations('studentDashboardWelcome');
  const fallbackStudent = t('studentFallback');
  const supabase = useMemo(() => createClient(), []);
  const [name, setName] = useState(initialName || fallbackStudent);
  const [email, setEmail] = useState(initialEmail);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initialAvatarUrl);

  useEffect(() => {
    let cancelled = false;

    async function hydrateCurrentUser() {
      try {
        const { data: authData } = await supabase.auth.getUser();
        const user = authData.user;
        if (!user || cancelled) return;

        const metadataName =
          (typeof user.user_metadata?.full_name === 'string' && user.user_metadata.full_name.trim()) ||
          (typeof user.user_metadata?.name === 'string' && user.user_metadata.name.trim()) ||
          '';
        const metadataAvatar =
          (typeof user.user_metadata?.avatar_url === 'string' && user.user_metadata.avatar_url) ||
          (typeof user.user_metadata?.picture === 'string' && user.user_metadata.picture) ||
          null;

        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name,email')
          .eq('id', user.id)
          .maybeSingle();

        if (cancelled) return;

        const resolvedEmail = profile?.email || user.email || initialEmail || '';
        const resolvedName =
          profile?.full_name?.trim() ||
          metadataName ||
          resolvedEmail.split('@')[0] ||
          initialName ||
          fallbackStudent;

        setName(resolvedName);
        setEmail(resolvedEmail);
        setAvatarUrl(metadataAvatar || initialAvatarUrl);
      } catch {
        // Keep the server-provided values. The welcome card should never
        // disappear because a client-side profile refresh failed.
      }
    }

    hydrateCurrentUser();
    return () => {
      cancelled = true;
    };
  }, [fallbackStudent, initialAvatarUrl, initialEmail, initialName, supabase]);

  return (
    <div className="relative overflow-hidden rounded-[1.75rem] border border-ink/10 bg-gradient-to-br from-white via-white to-brass/5 px-5 py-5 soft-shadow sm:px-6 sm:py-6 md:px-7">
      <div aria-hidden className="absolute -end-16 -top-20 h-48 w-48 rounded-full bg-brass/10 blur-3xl" />
      <div aria-hidden className="absolute -bottom-20 start-1/3 h-32 w-32 rounded-full bg-brandSun/15 blur-3xl" />

      <div className="relative flex items-center gap-4 sm:gap-5">
        <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-2xl border border-brass/15 bg-brass/10 shadow-sm sm:h-14 sm:w-14">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
          ) : (
            <span className="flex h-full w-full items-center justify-center font-display text-base font-black text-brass sm:text-lg">
              {initials(name)}
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex items-center gap-2 text-brass">
            <Sparkles aria-hidden className="h-3.5 w-3.5" />
            <span className="text-xs font-semibold uppercase tracking-[0.08em]">{t('dashboardLabel')}</span>
          </div>
          <h1 id="student-dashboard-title" className="max-w-4xl font-display text-[clamp(1.45rem,2.5vw,2.15rem)] font-black leading-[1.2] tracking-[-0.025em] text-ink">
            {t('welcomeBack', { name })}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5">
            <p className="text-xs text-steel sm:text-sm">{t('readyToLearn')}</p>
            {email && (
              <span className="inline-flex min-w-0 items-center gap-1.5 text-xs text-steel/75">
                <Mail aria-hidden className="h-3.5 w-3.5 shrink-0" />
                <span dir="ltr" className="max-w-[18rem] truncate">{email}</span>
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
