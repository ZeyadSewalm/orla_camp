'use server';

import { createAdminClient } from '@/lib/supabase/admin';

export type LeadResult = { ok: true } | { ok: false; error: 'invalid' | 'failed' };

/**
 * Records a free-lesson signup.
 *
 * Runs server-side with the service-role key on purpose. The `leads` table has
 * RLS on and no public policy, so the browser can neither read the list nor
 * write to it directly — an email list is the most scrapeable thing on a
 * marketing site, and a key that ships to the browser must never be able to
 * `select * from leads`.
 *
 * Returns a plain object rather than throwing: a failure to log a lead must
 * never stop someone watching the lesson they were promised. Capturing the
 * email is our interest; the lesson is theirs.
 */
export async function captureLead(input: {
  email: string;
  fullName?: string;
  region?: string;
  utm?: { source?: string; medium?: string; campaign?: string };
}): Promise<LeadResult> {
  const email = input.email.trim().toLowerCase();

  // Deliberately loose. Strict email regexes reject valid addresses, and the
  // cost of a bad row here is one junk line in a list.
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: 'invalid' };
  }

  try {
    const { error } = await createAdminClient()
      .from('leads')
      .upsert(
        {
          email,
          full_name: input.fullName?.trim() || null,
          region: input.region ?? 'egypt',
          source: 'free-lesson',
          utm_source: input.utm?.source ?? null,
          utm_medium: input.utm?.medium ?? null,
          utm_campaign: input.utm?.campaign ?? null,
          last_seen_at: new Date().toISOString()
        },
        // A returning visitor updates their row instead of creating a
        // duplicate. Without this the list is unusable within a week.
        { onConflict: 'email' }
      );

    if (error) throw error;
    return { ok: true };
  } catch (error) {
    console.error('[leads] capture failed:', error);
    return { ok: false, error: 'failed' };
  }
}
