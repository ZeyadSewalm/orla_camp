'use client';

import { useEffect, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import NotificationLink from '@/components/admin/NotificationLink';
import { markNotificationsRead } from '@/app/[locale]/admin/actions';

export type BellItem = {
  id: string;
  title: string;
  body: string;
  /** Already locale-prefixed by the server (lh), ready to navigate to. */
  href: string;
  created_at: string;
  read_at: string | null;
};

/**
 * Notifications as a bell in the admin header, not a panel above the page.
 *
 * WHY
 *
 * The first version rendered every notification as a full-width row stacked
 * above the admin content. With five cases that pushed the actual work below
 * the fold; with fifty it would have been the page. Notifications are an
 * interruption channel, so they belong behind one icon that says how many are
 * waiting and opens on demand.
 *
 * The dropdown scrolls inside a fixed maximum height, so the length of the
 * list never changes the length of the page.
 *
 * BEHAVIOUR THAT MATTERS
 *
 * - Closes on an outside click and on Escape; a popover that only closes by
 *   clicking the bell again feels broken.
 * - Anchored with `end-0`, not `right-0`, so it opens toward the inside of the
 *   page in Arabic as well as English.
 * - The badge shows unread only and caps at "9+": the exact count past nine
 *   carries no more information and would widen the badge.
 */
export default function NotificationBell({
  items,
  locale
}: {
  items: BellItem[];
  locale: string;
}) {
  const ar = locale === 'ar';
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const unread = items.filter((item) => !item.read_at).length;

  useEffect(() => {
    if (!open) return;

    const onPointer = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={
          ar
            ? `الإشعارات${unread > 0 ? ` — ${unread} غير مقروء` : ''}`
            : `Notifications${unread > 0 ? ` — ${unread} unread` : ''}`
        }
        className="relative grid h-10 w-10 place-items-center rounded-full border border-line bg-white transition hover:border-brass"
      >
        <Bell aria-hidden className="h-[1.1rem] w-[1.1rem] text-ink" />
        {unread > 0 && (
          <span className="figure absolute -end-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-brass px-1 text-[0.65rem] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute end-0 top-full z-40 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-line bg-white shadow-xl"
        >
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
            <p className="font-display text-sm font-bold">{ar ? 'الإشعارات' : 'Notifications'}</p>
            {unread > 0 && (
              <form action={markNotificationsRead}>
                <button type="submit" className="text-xs text-brass underline">
                  {ar ? 'تعليم الكل كمقروء' : 'Mark all read'}
                </button>
              </form>
            )}
          </div>

          {items.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-steel">
              {ar ? 'لا توجد إشعارات بعد.' : 'No notifications yet.'}
            </p>
          ) : (
            // The list scrolls; the page never grows with it.
            <ul className="max-h-[24rem] divide-y divide-line overflow-y-auto overscroll-contain">
              {items.map((item) => (
                <li key={item.id}>
                  <NotificationLink id={item.id} href={item.href}>
                    <div className={`flex gap-3 px-4 py-3 transition hover:bg-paper ${item.read_at ? 'opacity-55' : ''}`}>
                      <span
                        aria-hidden
                        className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${item.read_at ? 'bg-transparent' : 'bg-brass'}`}
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium">{item.title}</span>
                        <span className="mt-0.5 block truncate text-xs text-steel">{item.body}</span>
                        <span className="figure mt-0.5 block text-[0.68rem] text-steel/70">
                          {new Date(item.created_at).toLocaleString(ar ? 'ar-EG' : 'en-GB', {
                            day: 'numeric',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                      </span>
                    </div>
                  </NotificationLink>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
