export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-5 sm:py-10 md:space-y-8 md:py-14">
      <div className="rounded-[2rem] border border-ink/10 bg-white p-5 sm:p-7 md:p-8">
        <div className="flex items-center gap-4">
          <div className="h-14 w-14 animate-pulse rounded-full bg-ink/10 sm:h-16 sm:w-16" />
          <div className="flex-1 space-y-3">
            <div className="h-5 w-32 animate-pulse rounded bg-ink/10" />
            <div className="h-8 max-w-md animate-pulse rounded bg-ink/15" />
            <div className="h-4 w-48 animate-pulse rounded bg-ink/10" />
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.35fr_0.65fr]">
        <div className="h-44 animate-pulse rounded-[2rem] border border-ink/10 bg-white" />
        <div className="grid grid-cols-3 gap-2 lg:grid-cols-1 lg:gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl border border-ink/10 bg-white" />
          ))}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="h-64 animate-pulse rounded-[2rem] border border-ink/10 bg-white" />
        <div className="h-64 animate-pulse rounded-[2rem] border border-ink/10 bg-white" />
      </div>

      <div className="mt-14 border-t border-ink/10 pt-10">
        <div className="mb-8 h-8 w-48 animate-pulse rounded bg-ink/10" />
        <div className="h-80 animate-pulse rounded-[2rem] border border-ink/10 bg-white" />
      </div>
    </div>
  );
}
