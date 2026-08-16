import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations, unstable_setRequestLocale } from 'next-intl/server';
import VideoEmbed from '@/components/VideoEmbed';
import ModuleComplete from '@/components/ModuleComplete';
import { driveEmbedUrl } from '@/lib/drive';
import { bunnyThumbnail, signedEmbedUrl } from '@/lib/bunny';
import UploadCaseFile from '@/components/UploadCaseFile';
import { getSessionUser } from '@/lib/supabase/server';
import { getCachedProfile, getModules } from '@/lib/data';
import type { CourseModule } from '@/lib/types';
import { lh } from '@/lib/href';

export const metadata: Metadata = { robots: { index: false } };
export const dynamic = 'force-dynamic';

/**
 * Resolves the playable URL on the SERVER, after the access check above has
 * already passed. Bunny URLs are signed here and expire within the hour.
 */
function videoSrcFor(m: { video_source: string | null; bunny_video_id: string | null; video_link: string | null }) {
  if (m.video_source === 'bunny' && m.bunny_video_id) {
    try {
      return signedEmbedUrl(m.bunny_video_id);
    } catch {
      return null;
    }
  }
  return m.video_link ? driveEmbedUrl(m.video_link) : null;
}

export default async function Course({ params: { locale } }: { params: { locale: string } }) {
  unstable_setRequestLocale(locale);
  const t = await getTranslations('course');
  // Cookie read (no network) + a 30s-cached profile, instead of two fresh
  // Supabase round trips on top of the ones middleware already made.
  const user = await getSessionUser();
  if (!user) redirect(lh(locale, '/login?next=/course'));

  const profile = await getCachedProfile(user.id);
  if (!profile) redirect(lh(locale, '/login?next=/course'));
  if (!profile.has_access && profile.role !== 'admin' && profile.role !== 'reviewer') {
    redirect(lh(locale, '/pricing'));
  }

  const modules = await getModules();
  const ar = locale === 'ar';

  return (
    <div className="mx-auto max-w-4xl px-5 py-14">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <h1 className="font-display text-4xl font-black">{t('title')}</h1>
        <Link href={lh(locale, `/course/my-submissions`)} className="text-sm text-brass underline">{t('mySubmissions')}</Link>
      </div>

      {modules.length === 0 && <p className="mt-10 text-steel">{t('empty')}</p>}

      <div className="mt-12 space-y-16">
        {modules.map((m, i) => (
          <article key={m.id}>
            <p className="font-display text-sm text-brass">{String(i + 1).padStart(2, '0')}</p>
            <h2 className="mt-1 font-display text-xl font-black">{ar ? m.title_ar : m.title_en}</h2>
            <p className="mb-5 mt-2 text-sm leading-relaxed text-steel">{ar ? m.description_ar : m.description_en}</p>

            <VideoEmbed
              src={videoSrcFor(m)}
              poster={m.thumbnail_url ?? (m.video_source === 'bunny' && m.bunny_video_id ? bunnyThumbnail(m.bunny_video_id) : null)}
              title={ar ? m.title_ar : m.title_en}
            />

            <div className="mt-4 flex flex-wrap items-center gap-3">
              {m.checklist_file_url && (
                <a href={m.checklist_file_url} target="_blank" rel="noopener" className="btn-quiet text-sm">
                  {t('checklist')}
                </a>
              )}
              <UploadCaseFile moduleId={m.id} userId={profile.id} />
              <ModuleComplete moduleId={m.id} labels={{ done: t('markedDone'), markDone: t('markDone') }} />
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
