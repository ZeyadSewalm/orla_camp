'use client';

import { useState } from 'react';

/**
 * A slider for one grading criterion, with the number shown beside it.
 *
 * Adapted from a contributor's version, which was fixed at 0–100. Criteria here
 * are scored out of their own maximum (margin /30, occlusion /25, …), so the
 * range comes in as a prop — a slider that let a reviewer drag margin to 90
 * would produce a score the server then has to reject.
 *
 * Starts EMPTY rather than at 0. A slider resting at zero is indistinguishable
 * from a reviewer who deliberately scored zero, and would submit a zero for
 * every criterion nobody touched. The hidden input stays blank until the
 * reviewer actually moves it, so "not graded" and "graded 0" stay different.
 */
export default function GradeSlider({
  name,
  max,
  defaultValue,
  label
}: {
  name: string;
  max: number;
  defaultValue: number | null;
  label: string;
}) {
  const [value, setValue] = useState<number | null>(defaultValue);

  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        min={0}
        max={max}
        step={0.5}
        value={value ?? 0}
        onChange={(event) => setValue(Number(event.target.value))}
        aria-label={label}
        className={`w-full accent-brass ${value === null ? 'opacity-40' : ''}`}
      />
      <output className="figure w-14 shrink-0 text-end text-sm" aria-live="polite">
        {value === null ? '—' : value} / {max}
      </output>
      <input type="hidden" name={name} value={value ?? ''} />
      {value !== null && (
        <button
          type="button"
          onClick={() => setValue(null)}
          className="text-[0.7rem] text-steel underline"
          aria-label={`Clear ${label}`}
        >
          clear
        </button>
      )}
    </div>
  );
}
