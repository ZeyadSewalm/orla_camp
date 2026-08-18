/**
 * Tier comparison rows, transcribed from the sales sheet (section 5).
 * Prices are NOT listed here — they are read live from the `tiers` table so the
 * page never contradicts what checkout actually charges.
 *
 * Values: true = included, false = not included, string = a qualifying note.
 */
export interface ComparisonRow {
  ar: string;
  en: string;
  foundation: boolean | { ar: string; en: string };
  freelance: boolean | { ar: string; en: string };
  partner: boolean | { ar: string; en: string };
}

export const COMPARISON_ROWS: ComparisonRow[] = [
  {
    ar: 'مكتبة الفيديو كاملة، وصول مدى الحياة',
    en: 'Full video library, lifetime access',
    foundation: true, freelance: true, partner: true
  },
  {
    ar: 'مراجعة جودة لملف الحالة (حتى ملف واحد لكل وحدة، يراجعه Badr أو أحد مصمّمي OrlaDent)',
    en: 'Case file QC review (up to 1 per module, reviewed by Badr or an OrlaDent designer)',
    foundation: true, freelance: true, partner: true
  },
  {
    ar: 'الدخول لمجتمع الواتساب',
    en: 'WhatsApp community access',
    foundation: false, freelance: true, partner: true
  },
  {
    ar: 'جلسة أسئلة وأجوبة لايف أسبوعية (متسجلة لو فاتتك)',
    en: 'Weekly live Q&A (recorded if you miss it)',
    foundation: false, freelance: true, partner: true
  },
  {
    ar: 'متابعة شخصية 1:1 مع Badr',
    en: 'Private 1:1 mentorship with Badr',
    foundation: false,
    freelance: false,
    partner: { ar: 'النطاق يتفق عليه فردياً — دفعة تجريبية', en: 'scope agreed individually — pilot batch' }
  }
];
