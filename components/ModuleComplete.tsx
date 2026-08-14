'use client';
import { useState } from 'react';
import { Check, Circle } from 'lucide-react';

/**
 * Marks a module as watched, with a single pulse of brass light rather than a
 * silent colour swap. Progress is held per browser — no backend column exists
 * for it, and adding one would be a schema change, so this stays local until
 * you decide you want it tracked server-side.
 */
export default function ModuleComplete({
  moduleId,
  labels
}: {
  moduleId: string;
  labels: { done: string; markDone: string };
}) {
  const key = `module-done:${moduleId}`;
  const [done, setDone] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return window.localStorage.getItem(key) === '1';
    } catch {
      return false;
    }
  });
  const [justDone, setJustDone] = useState(false);

  const toggle = () => {
    const next = !done;
    setDone(next);
    setJustDone(next);
    try {
      if (next) window.localStorage.setItem(key, '1');
      else window.localStorage.removeItem(key);
    } catch {
      /* private mode — the pulse still plays, it just won't persist */
    }
    if (next) window.setTimeout(() => setJustDone(false), 1200);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={done}
      className={`inline-flex items-center gap-2 border px-4 py-2.5 text-xs transition ${
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
