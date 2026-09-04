/**
 * Case-file scoring criteria.
 *
 * THE SINGLE SOURCE OF TRUTH for how a submission is broken down. The admin
 * grading form, the student's submissions page and the profile tab all read
 * from here, so changing a weight or renaming a criterion is one edit rather
 * than four that can drift apart.
 *
 * The database stores the breakdown as jsonb keyed by `id`, deliberately not
 * as four columns: these criteria are a teaching decision and will be revised.
 * A new criterion is a line in this file, not a migration.
 *
 * WEIGHTS AND THE TOTAL
 *
 * Each criterion is scored out of its own `max`, and the maxima sum to 100, so
 * the total is a plain sum rather than a weighted average. That is the version
 * a human can check in their head while grading — a weighted average of
 * out-of-10 scores is not.
 *
 * The breakdown is OPTIONAL throughout. `grade` remains the authoritative
 * number: submissions graded before the breakdown existed have a grade and no
 * detail, and every screen has to keep working for them.
 */
export interface Criterion {
  /** Stable key used in the jsonb payload. Never rename without a data migration. */
  id: string;
  en: string;
  ar: string;
  /** Points available. All `max` values must sum to 100. */
  max: number;
  /** Shown under the input on the grading form so scoring stays consistent. */
  hintEn: string;
  hintAr: string;
}

export const CRITERIA: Criterion[] = [
  {
    id: 'margin',
    en: 'Margin accuracy',
    ar: 'دقة الحدود',
    max: 30,
    hintEn: 'Margin line placement, fit and consistency around the prep.',
    hintAr: 'وضع خط الحد ومطابقته واتساقه حول التحضير.'
  },
  {
    id: 'occlusion',
    en: 'Occlusion & contacts',
    ar: 'الإطباق ونقاط التلامس',
    max: 25,
    hintEn: 'Occlusal clearance and proximal contact strength.',
    hintAr: 'الخلوص الإطباقي وقوة التلامس الجانبي.'
  },
  {
    id: 'anatomy',
    en: 'Anatomy & morphology',
    ar: 'التشريح والشكل',
    max: 25,
    hintEn: 'Cusp form, grooves and how natural the result reads.',
    hintAr: 'شكل الحدبات والأخاديد ومدى طبيعية النتيجة.'
  },
  {
    id: 'efficiency',
    en: 'Design efficiency',
    ar: 'كفاءة التصميم',
    max: 20,
    hintEn: 'Clean scan prep, no unnecessary steps or leftover geometry.',
    hintAr: 'تحضير نظيف للسكان، بلا خطوات زائدة أو بقايا هندسية.'
  }
];

/** Guard-rail: the maxima must add up to 100 or the total stops meaning anything. */
export const TOTAL_POINTS = CRITERIA.reduce((sum, c) => sum + c.max, 0);

export type ScoreBreakdown = Record<string, number>;

/**
 * Reads a breakdown out of whatever the database column holds.
 *
 * The column is jsonb and nullable, and older rows have nothing in it, so this
 * has to cope with null, an empty object, and keys for criteria that have since
 * been removed. Unknown keys are dropped rather than rendered: a criterion no
 * longer in CRITERIA has no label to show and no max to validate against.
 */
export function parseBreakdown(raw: unknown): ScoreBreakdown | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  const out: ScoreBreakdown = {};
  for (const criterion of CRITERIA) {
    const value = (raw as Record<string, unknown>)[criterion.id];
    if (typeof value === 'number' && Number.isFinite(value)) {
      out[criterion.id] = value;
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** Sum of the parts. Used to prefill the total on the grading form. */
export function breakdownTotal(breakdown: ScoreBreakdown | null): number | null {
  if (!breakdown) return null;
  return Object.values(breakdown).reduce((sum, n) => sum + n, 0);
}
