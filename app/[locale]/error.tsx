'use client';
import { useEffect } from 'react';

/**
 * Error boundary for every page under a locale.
 *
 * Without this file, an unhandled error anywhere in the tree gives the visitor
 * Next's raw error screen — in production a bare "Application error: a
 * client-side exception has occurred", in English, with no way back. On a page
 * someone is deciding whether to pay for, that is the worst possible moment to
 * look broken.
 *
 * It has to be a Client Component (Next requires it), so the copy is inlined
 * rather than read from next-intl: the messages provider may itself be the
 * thing that failed.
 */
export default function Error({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The digest is what ties this to the server log entry on Vercel.
    console.error('Page error:', error.digest ?? '', error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center gap-5 px-5 py-16 text-center">
      <p className="figure text-xs uppercase tracking-[0.2em] text-steel">Error</p>

      <h1 className="display text-2xl">
        حصلت مشكلة مؤقتة
        <span className="mt-2 block text-lg text-steel">Something went wrong</span>
      </h1>

      <p className="text-sm leading-relaxed text-steel">
        جرّب تاني — لو المشكلة فضلت، كلّمنا وإحنا نظبطها.
        <span className="mt-1 block">Try again — if it keeps happening, get in touch and we&apos;ll sort it.</span>
      </p>

      <div className="flex flex-col gap-3 xs:flex-row">
        <button type="button" onClick={reset} className="btn-primary justify-center">
          جرّب تاني / Try again
        </button>
        <a href="/" className="btn-quiet justify-center">
          الصفحة الرئيسية / Home
        </a>
      </div>

      {error.digest && (
        <p className="figure text-[0.7rem] text-steel/60">ref: {error.digest}</p>
      )}
    </div>
  );
}
