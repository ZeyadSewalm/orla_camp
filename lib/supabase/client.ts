'use client';
import { createBrowserClient } from '@supabase/ssr';

/**
 * One browser client for the lifetime of the tab.
 *
 * Several student-course components need Supabase at the same time. Creating
 * one auth client per lesson would duplicate refresh listeners and network
 * state; a singleton is both lighter and safer for the existing session flow.
 */
let browserClient: ReturnType<typeof createBrowserClient> | null = null;

export const createClient = () => {
  if (!browserClient) {
    browserClient = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  return browserClient;
};
