'use client';

import { useState, useTransition } from 'react';
import { createClient } from '@/lib/supabase/client';

/**
 * The student's own switch for appearing on the leaderboard.
 *
 * Calls set_leaderboard_visibility(), a SECURITY DEFINER function that can
 * change exactly this one boolean on exactly the caller's row. Going through a
 * narrow RPC rather than an update on `profiles` means self-service visibility
 * never opens the door to a student editing has_access or role on themselves.
 *
 * The switch flips immediately and rolls back if the write fails, because the
 * alternative — a control that looks like it worked while the student is still
 * listed — is the worst outcome for a privacy setting specifically.
 */
export default function LeaderboardVisibility({ initial, ar }: { initial: boolean; ar: boolean }) {
  const [visible, setVisible] = useState(initial);
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();

  const toggle = () => {
    const next = !visible;
    setVisible(next);
    setError(false);

    startTransition(async () => {
      const { error: rpcError } = await createClient().rpc('set_leaderboard_visibility', {
        p_visible: next
      });
      if (rpcError) {
        setVisible(!next); // put the switch back where it was
        setError(true);
      }
    });
  };

  return (
    <div>
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={visible}
          onChange={toggle}
          disabled={pending}
          className="mt-0.5 h-4 w-4 shrink-0 accent-brass"
        />
        <span className="text-sm">
          <span className="font-medium">
            {ar ? 'إظهار اسمي في لوحة الصدارة' : 'Show my name on the leaderboard'}
          </span>
          <span className="mt-1 block text-xs leading-relaxed text-steel">
            {ar
              ? 'عند إيقافه لا تظهر في اللوحة إطلاقاً — لا باسمك ولا كمجهول. تقدّمك ودرجاتك تبقى كما هي، ويراها المدرّبون فقط.'
              : "Turn this off and you're left out of the leaderboard entirely — not listed as anonymous. Your progress and grades are unaffected and stay visible only to you and the instructors."}
          </span>
          {error && (
            <span className="mt-1.5 block text-xs font-semibold text-red-700">
              {ar ? 'تعذّر حفظ الإعداد. حاول مرة أخرى.' : "Couldn't save that. Please try again."}
            </span>
          )}
        </span>
      </label>
    </div>
  );
}
