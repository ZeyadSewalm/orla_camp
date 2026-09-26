'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { normaliseEgyptianMobile } from '@/lib/phone';

export type ProfileFormState = { ok: boolean; error: string | null };

/**
 * A student updates their own name and mobile number.
 *
 * WHY A SERVER ACTION AND NOT A BROWSER UPDATE
 *
 * Migration 007 limits what a student may write on their own profile row to
 * `full_name` and `region` — deliberately, so has_access and role can never be
 * self-granted. `phone` is not on that list. An update sent from the browser
 * would be refused by the database, and that exact trap is how last-login
 * tracking silently never worked: the error went unchecked, nothing was saved,
 * and nobody knew.
 *
 * So the write happens here, with the service role, AFTER checking who is
 * asking — and it touches only this caller's row and only these two columns.
 * Nothing from the form can choose a different row or a different column.
 */
export async function updateMyProfile(
  _previous: ProfileFormState,
  formData: FormData
): Promise<ProfileFormState> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'signed_out' };

  const fullName = String(formData.get('full_name') ?? '').trim().slice(0, 120);
  const phone = normaliseEgyptianMobile(String(formData.get('phone') ?? ''));

  if (!fullName) return { ok: false, error: 'name_required' };
  // Same rules as signup and the SQL twin in migration 023.
  if (!phone) return { ok: false, error: 'phone_invalid' };

  const { error } = await createAdminClient()
    .from('profiles')
    .update({ full_name: fullName, phone })
    .eq('id', user.id);

  if (error) {
    console.error('[profile] update failed:', error.message);
    return { ok: false, error: 'save_failed' };
  }

  /*
   * Profiles are read through unstable_cache (lib/data.ts, tag profile:<id>,
   * two-minute TTL). Without clearing it the student would save, reload, and
   * see their OLD number — and reasonably conclude the save had failed.
   */
  revalidateTag(`profile:${user.id}`);
  // The name also shows on the dashboard banner and the leaderboard.
  revalidatePath('/[locale]', 'layout');
  return { ok: true, error: null };
}
