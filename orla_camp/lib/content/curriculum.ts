/**
 * Marketing curriculum, transcribed verbatim from the sales sheet (section 4).
 * Frontend content only — this does NOT touch course_modules, which still
 * drives the real course page from the database.
 *
 * The status labels are deliberately honest and must not be softened:
 * "Available now" vs "Coming in your access period".
 */
export type ModuleStatus = 'available' | 'coming';

export interface CurriculumModule {
  ar: string;
  en: string;
  status: ModuleStatus;
}

export interface CurriculumBlock {
  ar: string;
  en: string;
  modules: CurriculumModule[];
}

export const CURRICULUM: CurriculumBlock[] = [
  {
    ar: 'الأساسيات',
    en: 'Foundations',
    modules: [
      { ar: '0 — الواجهة ومساحة العمل واستيراد السكان', en: '0 — Interface, Workspace & Scan Import', status: 'coming' },
      { ar: 'Single Crown', en: 'Single Crown', status: 'available' },
      { ar: 'Inlay & Onlay', en: 'Inlay & Onlay', status: 'available' },
      { ar: 'Veneer', en: 'Veneer', status: 'available' },
      { ar: 'Offset (موديول تقني)', en: 'Offset (technique module)', status: 'coming' }
    ]
  },
  {
    ar: 'الترميمي',
    en: 'Restorative',
    modules: [
      { ar: 'Bridges', en: 'Bridges', status: 'available' },
      { ar: 'Maryland Bridge', en: 'Maryland Bridge', status: 'coming' },
      { ar: 'Provisional Crown', en: 'Provisional Crown', status: 'available' },
      { ar: 'Bite Splint', en: 'Bite Splint', status: 'available' },
      { ar: 'Mock Up', en: 'Mock Up', status: 'available' }
    ]
  },
  {
    ar: 'المتقدم',
    en: 'Advanced',
    modules: [
      { ar: 'Design Model (موديول تقني)', en: 'Design Model (technique module)', status: 'coming' },
      { ar: 'Guide Gingivectomy', en: 'Guide Gingivectomy', status: 'coming' },
      { ar: 'DSD (Digital Smile Design)', en: 'DSD (Digital Smile Design)', status: 'coming' },
      { ar: 'Full Arch', en: 'Full Arch', status: 'coming' },
      { ar: 'Implant', en: 'Implant', status: 'coming' },
      { ar: 'Custom Abutment', en: 'Custom Abutment', status: 'coming' }
    ]
  }
];
