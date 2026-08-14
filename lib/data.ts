import { unstable_cache } from 'next/cache';
import { createPublicClient } from './supabase/public';
import { createAdminClient } from './supabase/admin';
import type { CourseModule, Tier } from './types';

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

export const getTiers = unstable_cache(
  async (): Promise<Tier[]> => {
    // Only the columns the pricing UI actually renders.
    const { data } = await createPublicClient()
      .from('tiers')
      .select('id,slug,name_ar,name_en,description_ar,description_en,price_egp,price_usd,installments_available,installment_count,installment_price_egp,installment_price_usd,is_self_checkout,max_seats,current_seats_taken,features,order_index')
      .order('order_index');
    return (data ?? []) as Tier[];
  },
  ['tiers'],
  { revalidate: 300, tags: ['tiers'] }
);

export const getModules = unstable_cache(
  async (): Promise<CourseModule[]> => {
    const { data } = await createPublicClient()
      .from('course_modules')
      .select('id,title_ar,title_en,description_ar,description_en,video_link,video_source,bunny_video_id,checklist_file_url,thumbnail_url,block,status,duration_minutes,is_free_preview,order_index')
      .order('order_index');
    return (data ?? []) as CourseModule[];
  },
  ['modules'],
  { revalidate: 300, tags: ['modules'] }
);

export const getSiteSettings = unstable_cache(
  async () => {
    const { data } = await createPublicClient()
      .from('site_settings')
      .select('landing_title_ar,landing_title_en,landing_description_ar,landing_description_en,landing_image_url,hero_kicker_ar,hero_kicker_en,hero_headline_ar,hero_headline_en,hero_subhead_ar,hero_subhead_en,cta_primary_ar,cta_primary_en,whatsapp_number,instagram_url,youtube_url')
      .eq('id', 1)
      .maybeSingle();
    return data;
  },
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
    async () => {
      // Service role: the anon client would be blocked by RLS here, since it
      // carries no session. Safe because the id is only ever taken from a
      // session cookie and this returns nothing but nav-display fields.
      const { data } = await createAdminClient()
        .from('profiles')
        .select('role, has_access, full_name, email')
        .eq('id', userId)
        .maybeSingle();
      return data;
    },
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
