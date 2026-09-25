import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Short-lived signed links for reviewer photos on a case.
 *
 * Adapted from a contributor's version, which took a `userId` it never used —
 * a parameter that looks like an ownership check but performs none is worse
 * than no parameter, because a reader assumes the check happens. Removed.
 *
 * OWNERSHIP IS THE CALLER'S RESPONSIBILITY: only pass paths read from a row the
 * current user is allowed to see. This uses the service role (the bucket is
 * private) and will sign any path it is given. The profile page satisfies this
 * by reading the student's own rows under RLS, and students cannot write
 * `review_photos` themselves — migration 020's insert guard blanks it.
 *
 * Ten minutes is long enough to view the page, short enough that a link copied
 * out of it stops working.
 */
export async function signedReviewPhotos(paths: string[]) {
  if (paths.length === 0) return [];

  const db = createAdminClient();
  const results = await Promise.all(
    paths.map(async (path) => {
      const { data } = await db.storage.from('case-files').createSignedUrl(path, 60 * 10);
      return data?.signedUrl ? { path, url: data.signedUrl } : null;
    })
  );

  return results.filter((photo): photo is { path: string; url: string } => photo !== null);
}
