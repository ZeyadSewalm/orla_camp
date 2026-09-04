import { CURRICULUM } from '@/lib/content/curriculum';

/**
 * The curriculum, as one numbered table of case types.
 *
 * DESIGN NOTES
 *
 * The numbers are the point. A bare list of nineteen case names reads as a
 * feature dump; numbering it turns the same names into a path with a beginning
 * and an end, which is what someone deciding whether to enrol is actually
 * trying to see.
 *
 * Two columns from `md` up, single column below. Nineteen rows in one column on
 * a desktop is a scroll for no reason, but splitting into columns on a phone
 * would make each cell too narrow for names like "Guide Gingivectomy". The
 * numbering is what keeps the reading order legible once it does split, since
 * the eye has something to follow down and across.
 *
 * There are no status badges. Every row here is part of what the course covers;
 * what is released when is the course page's job, told to students who have
 * paid, not a promise-tracker on a sales page.
 */
export default function Curriculum({ locale }: { locale: string }) {
  const ar = locale === 'ar';

  return (
    <div className="surface-card mt-12 p-5 md:p-8">
      <ol className="grid gap-x-10 md:grid-cols-2">
        {CURRICULUM.map((item, i) => {
          const qualifier = ar ? item.ar : item.en;
          return (
            <li
              key={item.name}
              className="flex items-baseline gap-4 border-b border-ink/10 py-3.5 last:border-0 md:[&:nth-last-child(2)]:border-0"
            >
              <span className="figure w-7 shrink-0 text-xs text-brass" aria-hidden>
                {String(i + 1).padStart(2, '0')}
              </span>
              <span className="font-medium">
                {item.name}
                {qualifier && (
                  // The expansion is context, not the name of the case, so it
                  // stays visually subordinate to it.
                  <span className="ms-2 text-sm font-normal text-steel">{qualifier}</span>
                )}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
