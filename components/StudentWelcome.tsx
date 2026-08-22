'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Sparkles } from 'lucide-react';
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
    <div className="relative overflow-hidden rounded-[2rem] border border-ink/10 bg-white p-5 soft-shadow sm:p-7 md:p-8">
      <div aria-hidden className="absolute -end-12 -top-12 h-40 w-40 rounded-full bg-brass/10 blur-2xl" />
      <div className="relative flex items-center gap-4 sm:gap-5">
        <div className="h-14 w-14 shrink-0 overflow-hidden rounded-full border border-brass/15 bg-brass/10 sm:h-16 sm:w-16">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
          ) : (
            <span className="flex h-full w-full items-center justify-center font-display text-lg font-black text-brass">
              {initials(name)}
            </span>
          )}
        </div>

        <div className="min-w-0">
          {email && (
            <div className="mb-1 flex items-center gap-2 text-brass">
              <Sparkles aria-hidden className="h-4 w-4" />
              <span className="truncate text-xs font-semibold">{email}</span>
            </div>
          )}
          <h1 id="student-dashboard-title" className="font-display text-xl font-black leading-tight text-ink sm:text-2xl">
            {t('welcomeBack', { name })}
          </h1>
          <p className="mt-2 text-sm text-steel sm:text-base">{t('readyToLearn')}</p>
        </div>
      </div>
    </div>
  );
}
