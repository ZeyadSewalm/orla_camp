/**
 * Shared loading skeletons.
 *
 * Next.js will not navigate until the server has rendered the new route —
 * unless the route has a loading.tsx. Without one the whole page freezes on
 * click and it reads as "the site is broken". With one, the layout swaps
 * instantly and only the content area waits.
 */
export function Line({ w = 'w-full' }: { w?: string }) {
  return <div className={`h-4 ${w} animate-pulse rounded bg-ink/10`} />;
}

export function Block({ h = 'h-40' }: { h?: string }) {
  return <div className={`${h} w-full animate-pulse rounded bg-ink/10`} />;
}

export function PageSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="mx-auto max-w-4xl space-y-8 px-5 py-14">
      <div className="space-y-3">
        <div className="h-10 w-64 animate-pulse rounded bg-ink/15" />
        <Line w="w-80" />
      </div>
      <div className="space-y-10">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="space-y-3">
            <Line w="w-56" />
            <Block />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * The auth pages (login, signup, forgot, reset).
 *
 * These had no loading.tsx at all, which is worse than it sounds: without one
 * Next.js keeps the OLD page on screen until the new one has finished
 * rendering on the server. Click "Sign up" from the header and nothing moves —
 * not the header, not the content — for as long as the round trip takes. The
 * click looks lost. This makes the swap instant and puts the wait in the one
 * place it belongs.
 */
export function AuthSkeleton() {
  return (
    <div className="mx-auto grid max-w-5xl gap-4 px-5 py-12 md:grid-cols-[0.9fr_1.1fr] md:py-20">
      <div className="hidden min-h-[34rem] animate-pulse rounded-[2.25rem] bg-brass/20 md:block" />
      <div className="surface-card space-y-6 p-7 md:p-10">
        <div className="h-12 w-56 animate-pulse rounded bg-ink/15" />
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <div className="h-3 w-24 animate-pulse rounded bg-ink/10" />
              <div className="h-11 w-full animate-pulse rounded bg-ink/10" />
            </div>
          ))}
        </div>
        <div className="h-12 w-full animate-pulse rounded bg-brass/25" />
      </div>
    </div>
  );
}

/**
 * The admin panel — sidebar plus content, mirroring the real two-column shell.
 *
 * The generic PageSkeleton was being used here, and it looked nothing like the
 * admin layout: the whole screen changed shape for a moment on every tab
 * click, which reads as a flicker rather than as loading. Matching the real
 * geometry means only the CONTENT appears to be waiting, which is the truth.
 */
export function AdminSkeleton() {
  return (
    <div className="mx-auto max-w-content px-4 py-6 sm:px-5 lg:grid lg:grid-cols-[15rem_1fr] lg:gap-8 lg:py-10">
      <div className="mb-5 hidden lg:mb-0 lg:block">
        <div className="space-y-5 bg-ink p-5">
          {Array.from({ length: 4 }).map((_, group) => (
            <div key={group} className="space-y-2">
              <div className="h-2.5 w-16 animate-pulse rounded bg-paper/20" />
              {Array.from({ length: 3 }).map((_, item) => (
                <div key={item} className="h-9 w-full animate-pulse rounded bg-paper/10" />
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-6">
        <div className="h-9 w-52 animate-pulse rounded bg-ink/15" />
        <div className="grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl border border-line bg-white" />
          ))}
        </div>
        <div className="h-96 animate-pulse rounded-xl border border-line bg-white" />
      </div>
    </div>
  );
}

/**
 * A centred, narrow page — the free lesson and the Production Partner
 * application. Both are single-column funnels, so a wide three-block skeleton
 * would have misrepresented them.
 */
export function NarrowSkeleton() {
  return (
    <div className="mx-auto max-w-3xl space-y-8 px-5 py-14">
      <div className="space-y-3">
        <div className="h-3 w-28 animate-pulse rounded bg-ink/10" />
        <div className="h-12 w-full max-w-lg animate-pulse rounded bg-ink/15" />
        <Line w="w-72" />
      </div>
      <Block h="h-72" />
      <div className="space-y-3">
        <Line w="w-full" />
        <Line w="w-5/6" />
        <Line w="w-2/3" />
      </div>
    </div>
  );
}
