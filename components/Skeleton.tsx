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
