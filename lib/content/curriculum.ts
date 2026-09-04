/**
 * The curriculum list shown on the landing page.
 *
 * Frontend content only — this does NOT touch course_modules, which still
 * drives the real course page from the database. Editing this file changes the
 * sales page and nothing a student has access to.
 *
 * WHY THIS IS NOW ONE FLAT LIST
 *
 * It used to be three blocks (Foundations / Restorative / Advanced), each with
 * an "Available now" or "Coming in your access period" badge per row. Two
 * problems with that on a sales page:
 *
 *   1. The three cards read as three separate courses rather than one path,
 *      and the middle card was always shorter than the others, so the section
 *      looked unfinished at every width.
 *   2. Two thirds of the rows said "coming", which is the last thing a visitor
 *      should be counting while deciding whether to pay.
 *
 * One ordered list of case types says the same thing without either problem:
 * this is what you will be able to design by the end. The order is the teaching
 * order and is deliberate — single units before bridges, natural teeth before
 * implants — so rows must not be sorted alphabetically or regrouped.
 *
 * The case names stay in English in both languages on purpose. These are the
 * terms Exocad itself uses and the terms the work is discussed in; translating
 * "All-on-X" or "Maryland Bridge" into Arabic would make the list harder to
 * scan for exactly the people it is written for, not easier.
 */
export interface CurriculumCase {
  /** Shown to Arabic and English visitors alike — see the note above. */
  name: string;
  /** Optional qualifier, translated, for rows that are a technique not a case. */
  ar?: string;
  en?: string;
}

export const CURRICULUM: CurriculumCase[] = [
  { name: 'Single Anterior Crown' },
  { name: 'Single Posterior Crown' },
  { name: 'Posterior Bridge' },
  { name: 'Anterior Bridge' },
  { name: 'Inlay and Onlay' },
  { name: 'Maryland Bridge' },
  { name: 'Veneers' },
  { name: 'Offset' },
  { name: 'Temporary Crowns' },
  { name: 'Models' },
  { name: 'Bite Splint' },
  { name: 'Guide Gingivectomy' },
  { name: 'Mockup' },
  { name: 'DSD', ar: 'تصميم الابتسامة الرقمي', en: 'Digital Smile Design' },
  { name: 'Full Arch' },
  { name: 'Single Implant' },
  { name: 'Bridge on Implant' },
  { name: 'All-on-X' },
  { name: 'Custom Abutment' }
];
