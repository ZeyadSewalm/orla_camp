import { COMPARISON_ROWS } from '@/lib/content/comparison';
import { formatMoney, tierPrice } from '@/lib/pricing';
import type { Tier } from '@/lib/types';

/**
 * Feature rows come from the sales sheet; every price cell is read live from
 * the `tiers` table so the page can never quote a number checkout won't charge.
 */
export default function TierComparison({
  tiers,
  locale,
  labels
}: {
  tiers: Tier[];
  locale: string;
  labels: { egypt: string; intl: string; custom: string; installments: string };
}) {
  const ar = locale === 'ar';
  const order = ['foundation', 'freelance_ready', 'production_partner'];
  const cols = order.map((slug) => tiers.find((t) => t.slug === slug)).filter(Boolean) as Tier[];
  if (cols.length === 0) return null;

  const cell = (value: boolean | { ar: string; en: string }) => {
    if (value === true) return <span className="text-brass" aria-label="included">✓</span>;
    if (value === false) return <span className="text-ink/25" aria-label="not included">—</span>;
    return (
      <span className="text-brass">
        ✓ <em className="block text-xs not-italic text-steel">{ar ? value.ar : value.en}</em>
      </span>
    );
  };

  const priceRow = (region: 'egypt' | 'international', label: string) => (
    <tr className="border-b border-line">
      <th scope="row" className="py-4 pe-4 text-start font-bold">{label}</th>
      {cols.map((tier) => {
        const { currency, full, installment, count } = tierPrice(tier, region);
        return (
          <td key={tier.id} className="py-4 pe-4 align-top">
            {full === null ? (
              <em className="text-sm text-steel">{labels.custom}</em>
            ) : (
              <>
                <span className="font-display text-lg font-bold">{formatMoney(full, currency, locale)}</span>
                {tier.installments_available && installment !== null && (
                  <span className="block text-xs text-steel">
                    {labels.installments} {count} × {formatMoney(installment, currency, locale)}
                  </span>
                )}
              </>
            )}
          </td>
        );
      })}
    </tr>
  );

  return (
    <div className="mt-10 overflow-x-auto">
      <table className="w-full min-w-[42rem] text-sm">
        <thead>
          <tr className="border-b-2 border-ink">
            <th className="w-2/5 py-4 text-start" />
            {cols.map((tier) => (
              <th key={tier.id} scope="col" className="py-4 pe-4 text-start align-bottom font-display text-base font-black">
                {ar ? tier.name_ar : tier.name_en}
                {tier.max_seats !== null && (
                  <em className="block text-xs font-normal not-italic text-brass">
                    {ar ? `تجريبي — ${tier.max_seats} أماكن فقط` : `pilot — ${tier.max_seats} seats only`}
                  </em>
                )}
              </th>
            ))}
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
          {priceRow('egypt', labels.egypt)}
          {priceRow('international', labels.intl)}
        </tbody>
      </table>
    </div>
  );
}
