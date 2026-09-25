import GradeSlider from '@/components/admin/GradeSlider';
import { CRITERIA, type CriterionNotes, type ScoreBreakdown } from '@/lib/scoring';

/**
 * The per-criterion grading block, rendered identically in BOTH review screens
 * (STL tasks and case review).
 *
 * One component on purpose. The two screens used to be written separately and
 * had already drifted apart — different scales, different field names — which
 * is exactly how two leaderboards came to disagree about the same student.
 * Anything that changes about how a case is graded changes here, once.
 *
 * Field names match readGradingForm() in lib/scoring.ts: breakdown_<id> and
 * note_<id>.
 */
export default function GradingFields({
  breakdown,
  notes,
  publish,
  ar
}: {
  breakdown: ScoreBreakdown | null;
  notes: CriterionNotes | null;
  /** Current value; new submissions count by default. */
  publish: boolean;
  ar: boolean;
}) {
  return (
    <div className="space-y-5">
      {/* Marker so an UNTICKED box is distinguishable from a form without the
          box at all — an unticked checkbox submits nothing. See readPublish(). */}
      <input type="hidden" name="publish_field" value="1" />

      {CRITERIA.map((criterion) => (
        <div key={criterion.id}>
          <div className="mb-1.5 flex items-baseline justify-between gap-3">
            <label className="label !mb-0">{ar ? criterion.ar : criterion.en}</label>
            <span className="text-[0.7rem] text-steel">/{criterion.max}</span>
          </div>
          <p className="mb-2 text-[0.72rem] leading-relaxed text-steel">
            {ar ? criterion.hintAr : criterion.hintEn}
          </p>
          <GradeSlider
            name={`breakdown_${criterion.id}`}
            max={criterion.max}
            defaultValue={breakdown?.[criterion.id] ?? null}
            label={ar ? criterion.ar : criterion.en}
          />
          <input
            name={`note_${criterion.id}`}
            defaultValue={notes?.[criterion.id] ?? ''}
            maxLength={1000}
            placeholder={ar ? 'ملاحظة على هذا المعيار (اختياري)' : 'Note on this criterion (optional)'}
            className="field mt-2 text-sm"
          />
        </div>
      ))}

      <label className="flex cursor-pointer items-start gap-3 border-t border-line pt-4">
        <input
          type="checkbox"
          name="publish_to_leaderboard"
          defaultChecked={publish}
          className="mt-0.5 h-4 w-4 shrink-0 accent-brass"
        />
        <span className="text-sm">
          <span className="font-medium">{ar ? 'يُحتسب في لوحة الصدارة' : 'Counts on the leaderboard'}</span>
          <span className="mt-0.5 block text-xs text-steel">
            {ar
              ? 'ألغِ التحديد لحالة تدريبية أو إعادة تقييم للتوجيه فقط. الطالب يرى درجته في الحالتين.'
              : 'Untick for a practice case or a coaching re-grade. The student sees their grade either way.'}
          </span>
        </span>
      </label>
    </div>
  );
}
