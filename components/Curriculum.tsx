import { CURRICULUM } from '@/lib/content/curriculum';

/**
 * Curriculum table from the sales sheet. Status labels stay verbatim —
 * "Available now" and "Coming in your access period" — because overstating
 * what's shipped is the one thing that would break trust here.
 */
export default function Curriculum({
  locale,
  labels
}: {
  locale: string;
  labels: { available: string; coming: string };
}) {
  const ar = locale === 'ar';

  return (
    <div className="mt-12 grid gap-4 md:grid-cols-2">
      {CURRICULUM.map((block) => (
        <div key={block.en} className="surface-card p-6 md:p-7">
          <h3 className="text-2xl font-semibold tracking-tight">{ar ? block.ar : block.en}</h3>
          <ul className="mt-5">
            {block.modules.map((m) => {
              const live = m.status === 'available';
              return (
                <li
                  key={m.en}
                  className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-ink/10 py-4 last:border-0"
                >
                  <span className={live ? 'font-medium' : 'text-steel'}>{ar ? m.ar : m.en}</span>
                  <span
                    className={`shrink-0 px-3 py-1 text-xs uppercase tracking-[0.14em] ${
                      live ? 'rounded-full bg-brass text-white' : 'rounded-full border border-ink/15 text-steel'
                    }`}
                  >
                    {live ? labels.available : labels.coming}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
