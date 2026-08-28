'use client';

import { useFormStatus } from 'react-dom';

/**
 * A submit button that knows when its own form is running.
 *
 * THIS IS THE ADMIN PANEL'S MISSING FEEDBACK.
 *
 * Every admin form posts to a server action. A server action is a network
 * round trip — save a module, grade a submission, update a tier — and the
 * plain <button> that used to sit here said nothing at all while it ran. You
 * clicked "Save", the page sat perfectly still for a second or three, and the
 * only reasonable conclusion was that the click had not registered. So people
 * clicked again, which fires the action a second time.
 *
 * useFormStatus reads the pending state of the nearest parent <form>. It only
 * works from a component INSIDE that form — which is exactly why this is its
 * own client component rather than a prop on the page.
 *
 * The button also disables itself while pending, so the double-click stops
 * being possible rather than merely being discouraged.
 */
export default function SubmitButton({
  children,
  className = 'btn-primary',
  pendingLabel,
  ar = false
}: {
  children: React.ReactNode;
  className?: string;
  /** Overrides the default "Saving…" text. */
  pendingLabel?: string;
  ar?: boolean;
}) {
  const { pending } = useFormStatus();
  const busy = pendingLabel ?? (ar ? 'جارٍ الحفظ…' : 'Saving…');

  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={`${className} relative inline-flex items-center justify-center gap-2 disabled:cursor-wait disabled:opacity-70`}
    >
      {pending && (
        <span
          aria-hidden
          className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-e-transparent"
        />
      )}
      {pending ? busy : children}
    </button>
  );
}

/**
 * The same thing for the small underlined destructive links ("Delete /
 * disable"). Those are the ones where silence hurt most: a delete that quietly
 * turned into a disable, with no spinner in between, is indistinguishable from
 * a button that does nothing — which is exactly how the task delete was
 * reported as broken.
 */
export function SubmitLink({
  children,
  className = 'text-xs text-red-700 underline',
  ar = false
}: {
  children: React.ReactNode;
  className?: string;
  ar?: boolean;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={`${className} inline-flex items-center gap-1.5 disabled:cursor-wait disabled:opacity-60`}
    >
      {pending && (
        <span
          aria-hidden
          className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-current border-e-transparent"
        />
      )}
      {pending ? (ar ? 'لحظة…' : 'Working…') : children}
    </button>
  );
}
