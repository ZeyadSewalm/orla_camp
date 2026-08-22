'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Circle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

let migrationRefreshTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleMigrationRefresh(refresh: () => void) {
  if (migrationRefreshTimer) window.clearTimeout(migrationRefreshTimer);
  migrationRefreshTimer = window.setTimeout(() => {
    migrationRefreshTimer = null;
    refresh();
  }, 250);
}

/**
 * Marks a module as completed and syncs that state to Supabase.
 *
 * Older builds stored completion only in localStorage. We still read/write the
 * same key so nobody loses progress during the rollout, and a previously
 * completed local lesson is migrated to Supabase the first time it is seen.
 */
export default function ModuleComplete({
  moduleId,
  initialDone = false,
  labels
}: {
  moduleId: string;
  initialDone?: boolean;
  labels: { done: string; markDone: string };
}) {
  const key = `module-done:${moduleId}`;
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [done, setDone] = useState(initialDone);
  const [justDone, setJustDone] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function migrateLegacyProgress() {
      let localDone = false;
      try {
        localDone = window.localStorage.getItem(key) === '1';
      } catch {
        return;
      }

      if (!localDone || initialDone) return;
      if (!cancelled) setDone(true);

      // One-time migration of progress created by the old localStorage-only
      // component. If Migration 009 has not been applied yet, the local value
      // is intentionally kept and the old behaviour continues to work.
      const { error } = await supabase.rpc('set_lesson_complete', {
        p_module_id: moduleId,
        p_completed: true
      });
      if (!error && !cancelled) scheduleMigrationRefresh(() => router.refresh());
    }

    migrateLegacyProgress();
    return () => { cancelled = true; };
  }, [initialDone, key, moduleId, router, supabase]);

  const toggle = async () => {
    if (syncing) return;
    const next = !done;
    setDone(next);
    setJustDone(next);

    try {
      if (next) window.localStorage.setItem(key, '1');
      else window.localStorage.removeItem(key);
    } catch {
      // Private mode: server sync below is still attempted.
    }

    setSyncing(true);
    const { error } = await supabase.rpc('set_lesson_complete', {
      p_module_id: moduleId,
      p_completed: next
    });
    setSyncing(false);

    // Keep localStorage as a backwards-compatible fallback if the database
    // migration has not been applied yet. Once the RPC succeeds, Supabase is
    // the authoritative source used by the dashboard on the next render.
    if (error && process.env.NODE_ENV === 'development') {
      console.warn('[progress] completion sync failed:', error.message);
    }
    if (!error) router.refresh();

    if (next) window.setTimeout(() => setJustDone(false), 1200);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={done}
      aria-busy={syncing}
      disabled={syncing}
      className={`inline-flex items-center gap-2 border px-4 py-2.5 text-xs transition disabled:opacity-60 ${
        done ? 'border-brass text-brass' : 'border-line text-steel hover:border-ink hover:text-ink'
      } ${justDone ? 'celebrate' : ''}`}
    >
      {done ? (
        <Check aria-hidden className={`h-4 w-4 ${justDone ? 'check-pop' : ''}`} strokeWidth={2.5} />
      ) : (
        <Circle aria-hidden className="h-4 w-4" strokeWidth={1.5} />
      )}
      {done ? labels.done : labels.markDone}
    </button>
  );
}
