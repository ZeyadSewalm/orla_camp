'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { markNotificationRead } from '@/app/[locale]/admin/actions';

/**
 * A notification row that marks itself read on the way to its target.
 *
 * A plain <Link> would leave the badge counting something the reviewer has
 * already opened. Marking read has to happen before the navigation, hence the
 * button and the transition rather than an anchor.
 */
export default function NotificationLink({
  id,
  href,
  children
}: {
  id: string;
  href: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function open() {
    startTransition(async () => {
      const formData = new FormData();
      formData.set('id', id);
      await markNotificationRead(formData);
      router.push(href);
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={open}
      disabled={pending}
      className="block w-full text-start transition disabled:cursor-wait disabled:opacity-60"
    >
      {children}
    </button>
  );
}
