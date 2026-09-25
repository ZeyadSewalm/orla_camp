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

/* ------------------------------------------------------------------ */
/* Shared by BOTH grading surfaces (STL tasks and case review).        */
/* ------------------------------------------------------------------ */

export type CriterionNotes = Record<string, string>;

/**
 * Reads per-criterion reviewer notes out of a jsonb column.
 *
 * Same tolerance as parseBreakdown: null, empty, and keys for criteria that no
 * longer exist are all handled, and blank strings are dropped so an empty note
 * never renders as an empty box under a score bar.
 */
export function parseNotes(raw: unknown): CriterionNotes | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out: CriterionNotes = {};
  for (const criterion of CRITERIA) {
    const value = (raw as Record<string, unknown>)[criterion.id];
    if (typeof value === 'string' && value.trim()) out[criterion.id] = value.trim();
  }
  return Object.keys(out).length > 0 ? out : null;
}

/**
 * Reads a grading form into a breakdown and notes, validating each criterion
 * against its OWN maximum.
 *
 * Lives here rather than in either server action so both actions apply exactly
 * the same rules. When the two grading forms were separate code, they had
 * already drifted — one scored criteria out of 100, the other out of 30/25/25/20
 * — which is how two leaderboards ended up disagreeing about the same student.
 */
export function readGradingForm(formData: FormData) {
  const breakdown: ScoreBreakdown = {};
  const notes: CriterionNotes = {};

  for (const criterion of CRITERIA) {
    const raw = formData.get(`breakdown_${criterion.id}`);
    if (raw !== null && raw !== '') {
      const value = Number(raw);
      if (!Number.isFinite(value) || value < 0 || value > criterion.max) {
        throw new Error(`${criterion.en}: score must be between 0 and ${criterion.max}`);
      }
      breakdown[criterion.id] = value;
    }

    const note = formData.get(`note_${criterion.id}`);
    if (typeof note === 'string' && note.trim()) notes[criterion.id] = note.trim().slice(0, 1000);
  }

  const hasBreakdown = Object.keys(breakdown).length > 0;
  return {
    breakdown: hasBreakdown ? breakdown : null,
    notes: Object.keys(notes).length > 0 ? notes : null,
    /** Sum of the parts, used when the reviewer leaves the total blank. */
    sum: hasBreakdown ? Object.values(breakdown).reduce((a, b) => a + b, 0) : null
  };
}

/** A grade as a percentage of its maximum — the scale the leaderboard uses. */
export function toPercent(grade: number, max: number): number {
  return max > 0 ? (grade / max) * 100 : 0;
}

/**
 * Reads the "counts on leaderboard" checkbox.
 *
 * An unticked checkbox submits NOTHING — not "off", not false, simply no field.
 * So "the box was unticked" and "this form never rendered the box" look
 * identical unless the form also sends a marker. GradingFields sends
 * `publish_field=1` alongside the checkbox; when the marker is present the box
 * decides, and when it is absent the row keeps counting (the safe default).
 */
export function readPublish(formData: FormData): boolean {
  if (!formData.has('publish_field')) return true;
  return formData.get('publish_to_leaderboard') === 'on';
}
