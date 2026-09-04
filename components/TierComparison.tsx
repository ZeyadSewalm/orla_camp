import { COMPARISON_ROWS, type ComparisonRow } from '@/lib/content/comparison';
import { formatMoney, tierPrice } from '@/lib/pricing';
import type { Tier } from '@/lib/types';

/**
 * Feature rows come from the sales sheet; every price cell is read live from
 * the `tiers` table so the page can never quote a number checkout won't charge.
 *
 * TWO LAYOUTS, ON PURPOSE.
 *
 * A four-column matrix cannot survive a 390px screen. The old version kept the
 * table and let it scroll sideways, which was worse than it sounds: the row
 * LABEL column scrolled away with everything else, so you ended up looking at
 * a column of bare ✓ marks with no idea which feature they belonged to. In
 * Arabic it was worse again, because the scroll starts on the right and the
 * tier headings ("Foundati / on") wrapped mid-word.
 *
 * So below `md` the same data is rendered as one card per tier — no sideways
 * scrolling at all, and every tick keeps its label. The table returns at `md`,
 * where it has the width to be the better format.
 */
export default function TierComparison({
  tiers,
  locale,
  labels
}: {
  tiers: Tier[];
  locale: string;
  labels: { egypt: string; custom: string; bestValue: string };
}) {
  const ar = locale === 'ar';
  const order = ['foundation', 'freelance_ready', 'production_partner'];
  const cols = order.map((slug) => tiers.find((t) => t.slug === slug)).filter(Boolean) as Tier[];
  if (cols.length === 0) return null;

  const value = (row: ComparisonRow, slug: string) =>
    slug === 'foundation' ? row.foundation : slug === 'freelance_ready' ? row.freelance : row.partner;

  const cell = (v: boolean | { ar: string; en: string }) => {
    if (v === true) return <span className="text-brass" aria-label="included">✓</span>;
    if (v === false) return <span className="text-ink/25" aria-label="not included">—</span>;
    return (
      <span className="text-brass">
        ✓ <em className="block text-xs not-italic text-steel">{ar ? v.ar : v.en}</em>
      </span>
    );
  };

  /** Price block, shared by both layouts. */
  const priceFor = (tier: Tier, region: 'egypt' | 'international') => {
    const { currency, full } = tierPrice(tier, region);
    if (full === null) return <em className="text-sm text-steel">{labels.custom}</em>;
    // Instalments are gone, so the price is a single number again. Nothing here
    // reads tier.installments_available any more: the DB flag is what stops
    // checkout offering a plan, and this component must not be the only thing
    // hiding an option the server would still accept.
    return <span className="figure font-display text-lg font-bold">{formatMoney(full, currency, locale)}</span>;
  };

  const priceRow = (region: 'egypt' | 'international', label: string) => (
    <tr className="border-b border-line">
      <th scope="row" className="sticky start-0 z-10 bg-white py-4 pe-4 text-start font-bold">{label}</th>
      {cols.map((tier) => (
        <td key={tier.id} className="py-4 pe-4 align-top">{priceFor(tier, region)}</td>
      ))}
    </tr>
  );

  return (
    <div className="mt-10">
      {/* ---------- MOBILE: one card per tier, nothing to scroll ---------- */}
      <div className="grid gap-4 md:hidden">
        {cols.map((tier) => {
          const best = tier.slug === 'freelance_ready';
          return (
          <div key={tier.id} className={`surface-card p-5 ${best ? 'ring-1 ring-brass' : ''}`}>
            {best && (
              <span className="mb-1.5 block text-[0.62rem] font-bold uppercase tracking-[0.16em] text-brass">
                {labels.bestValue}
              </span>
            )}
            <h3 className={`display text-lg ${best ? 'text-brass' : ''}`}>{ar ? tier.name_ar : tier.name_en}</h3>

            <dl className="mt-4 space-y-2 border-t border-line pt-4 text-sm">
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-steel">{labels.egypt}</dt>
                <dd className="text-end">{priceFor(tier, 'egypt')}</dd>
              </div>
            </dl>

            <ul className="mt-4 space-y-3 border-t border-line pt-4 text-sm">
              {COMPARISON_ROWS.map((row) => {
                const v = value(row, tier.slug);
                if (v === false) return null; // a card lists what you GET
                return (
                  <li key={row.en} className="flex gap-3">
                    <span aria-hidden className="mt-0.5 shrink-0 text-brass">✓</span>
                    <span>
                      {ar ? row.ar : row.en}
                      {v !== true && (
                        <em className="block text-xs not-italic text-steel">{ar ? v.ar : v.en}</em>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
          );
        })}
      </div>

      {/* ---------- DESKTOP: the matrix, where it fits ---------- */}
      <div className="surface-card hidden p-5 md:block md:p-7">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink/20">
              <th className="w-2/5 py-4 text-start" />
              {cols.map((tier) => {
                /*
                 * Freelance Ready is the tier we want chosen, so it is the only
                 * one in the brand colour. Highlighting two would highlight
                 * neither. The eyebrow sits ABOVE the name rather than beside
                 * it so the three headings keep a common baseline — align-bottom
                 * on the row is what makes that work without pushing the other
                 * two columns down.
                 */
                const best = tier.slug === 'freelance_ready';
                return (
                  <th key={tier.id} scope="col" className="py-4 pe-4 text-start align-bottom font-display text-base font-black">
                    {best && (
                      <span className="mb-1.5 block text-[0.62rem] font-bold uppercase tracking-[0.16em] text-brass">
                        {labels.bestValue}
                      </span>
                    )}
                    <span className={best ? 'text-brass' : undefined}>{ar ? tier.name_ar : tier.name_en}</span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {COMPARISON_ROWS.map((row) => (
              <tr key={row.en} className="border-b border-line">
                <th scope="row" className="py-4 pe-6 text-start font-normal">{ar ? row.ar : row.en}</th>
                <td className="py-4 pe-4 align-top">{cell(row.foundation)}</td>
                <td className="py-4 pe-4 align-top">{cell(row.freelance)}</td>
                <td className="py-4 pe-4 align-top">{cell(row.partner)}</td>
              </tr>
            ))}
            {/* Egypt only. The Gulf/International row was removed with the
                international offer; re-adding it means restoring price_usd
                display AND the region toggle on /pricing, not just this line. */}
            {priceRow('egypt', labels.egypt)}
          </tbody>
        </table>
      </div>
    </div>
  );
}
