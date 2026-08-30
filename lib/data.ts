import { unstable_cache } from 'next/cache';
import { createPublicClient } from './supabase/public';
import { createAdminClient } from './supabase/admin';
import type { CourseModule, Tier } from './types';
import { rethrowIfControlFlow } from './next-errors';

/**
 * Cached readers for public marketing data.
 *
 * Before this, every single page view fired fresh queries at Supabase — three
 * on the landing page alone. From Egypt to a European region that's most of a
 * second before a byte of HTML is sent, on every click.
 *
 * These are cached for 5 minutes AND tagged, so the admin panel can bust them
 * the instant something is saved: edits still show up immediately.
 */


/**
 * Runs a Supabase read and NEVER throws.
 *
 * This is the difference between "the pricing table is empty for a minute"
 * and "the whole site returns a 500". Every reader below feeds a marketing
 * page whose copy comes from the translation files, not the database — the
 * page is perfectly readable without the live rows.
 *
 * Before this, one Supabase blip, one expired key, or one missing env var on
 * a deploy took down the landing page, /pricing and /faq outright. Verified
 * while building: with no Supabase credentials present the build logged
 * "Error: supabaseUrl is required" from the landing page and the pricing page.
 * A marketing site should not be that fragile about a table of three rows.
 */
async function safe<T>(label: string, run: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await run();
  } catch (error) {
    rethrowIfControlFlow(error);
    console.error(`[data] ${label} failed, serving fallback:`, error);
    return fallback;
  }
}

export const getTiers = unstable_cache(
  async (): Promise<Tier[]> =>
    safe('tiers', async () => {
      // Only the columns the pricing UI actually renders.
      const { data } = await createPublicClient()
        .from('tiers')
        .select('id,slug,name_ar,name_en,description_ar,description_en,price_egp,price_usd,installments_available,installment_count,installment_price_egp,installment_price_usd,is_self_checkout,max_seats,current_seats_taken,features,order_index')
        .order('order_index');
      return (data ?? []) as Tier[];
    }, []),
  ['tiers'],
  { revalidate: 300, tags: ['tiers'] }
);

export const getModules = unstable_cache(
  async (): Promise<CourseModule[]> =>
    safe('modules', async () => {
      /*
       * SERVICE ROLE, not the anon client — and this is a security boundary,
       * not a preference.
       *
       * migration-007 revokes SELECT on `video_link` and `bunny_video_id` from
       * anon, because the anon key ships inside the browser bundle and anyone
       * could query those two columns directly and walk off with every paid
       * video URL. RLS is row-level; it never restricted columns.
       *
       * With those grants gone the anon client can no longer read them, so
       * this read runs as service_role. That is safe here precisely because
       * this function is server-only: it lives inside unstable_cache, is never
       * imported by a client component, and the pages that use it gate on
       * has_access before they ever build a video URL.
       */
      const { data } = await createAdminClient()
        .from('course_modules')
        .select('id,title_ar,title_en,description_ar,description_en,video_link,video_source,bunny_video_id,checklist_file_url,thumbnail_url,block,status,duration_minutes,is_free_preview,order_index')
        .order('order_index');
      return (data ?? []) as CourseModule[];
    }, []),
  ['modules'],
  { revalidate: 300, tags: ['modules'] }
);

export const getSiteSettings = unstable_cache(
  async () =>
    safe('site-settings', async () => {
      const { data } = await createPublicClient()
        .from('site_settings')
        .select('landing_title_ar,landing_title_en,landing_description_ar,landing_description_en,landing_image_url,hero_kicker_ar,hero_kicker_en,hero_headline_ar,hero_headline_en,hero_subhead_ar,hero_subhead_en,cta_primary_ar,cta_primary_en,whatsapp_number,instagram_url,youtube_url')
        .eq('id', 1)
        .maybeSingle();
      return data;
    }, null),
  ['site-settings'],
  { revalidate: 300, tags: ['settings'] }
);

/**
 * A signed-in user's role, cached briefly per user id.
 *
 * The header only needs this to decide which links to show. Real authorisation
 * happens in middleware and in RLS, so a few seconds of staleness here is
 * harmless — and it removes a database round trip from every navigation.
 */
export const getCachedRole = (userId: string) =>
  unstable_cache(
    async () =>
      // A failure here must not take the HEADER down — it renders on every
      // page. Falling back to null just shows the signed-out nav.
      safe('profile-role', async () => {
        // Service role: the anon client would be blocked by RLS here, since it
        // carries no session. Safe because the id is only ever taken from a
        // session cookie and this returns nothing but nav-display fields.
        const { data } = await createAdminClient()
          .from('profiles')
          .select('role, has_access, full_name, email')
          .eq('id', userId)
          .maybeSingle();
        return data;
      }, null),
    ['profile-role', userId],
    { revalidate: 120, tags: [`profile:${userId}`] }
  )();

/**
 * A signed-in member's tier rank, cached per user for 30 seconds.
 *
 * Replaces myTierOrder(), which made two fresh network calls (getUser plus a
 * profile join) on every page load — on top of the two the middleware had
 * already made for the same request. That stacking is what made clicking a
 * tab take seconds.
 */
export const getCachedTierOrder = (userId: string) =>
  unstable_cache(
    async () => {
      const { data } = await createAdminClient()
        .from('profiles')
        .select('has_access, role, tiers(order_index)')
        .eq('id', userId)
        .maybeSingle();

      if (!data) return 0;
      if (data.role === 'admin' || data.role === 'reviewer') return 99;
      if (!data.has_access) return 0;
      const tier = data.tiers as unknown as { order_index: number } | null;
      return tier?.order_index ?? 0;
    },
    ['tier-order', userId],
    { revalidate: 120, tags: [`profile:${userId}`] }
  )();

/** Full profile for a known user id, cached briefly. */
export const getCachedProfile = (userId: string) =>
  unstable_cache(
    async () => {
      const { data } = await createAdminClient()
        .from('profiles')
        .select('id,email,full_name,region,tier_id,has_access,role,phone,admin_notes,installments_paid,installments_total,next_installment_due,created_at')
        .eq('id', userId)
        .maybeSingle();
      return data;
    },
    ['profile-full', userId],
    { revalidate: 120, tags: [`profile:${userId}`] }
  )();
