'use client';

import { useFormState } from 'react-dom';
import SubmitButton from '@/components/SubmitButton';
import { updateMyProfile, type ProfileFormState } from '@/app/[locale]/profile/actions';

/**
 * Name and mobile number, editable by the student.
 *
 * Email is shown but not editable here: changing it means re-verifying the
 * account through Supabase Auth, which is its own flow — a text box that
 * appeared to change it and silently did not would be worse than none.
 */
export default function ProfileInfoForm({
  fullName,
  email,
  phone,
  ar,
  required = false
}: {
  fullName: string;
  email: string;
  phone: string | null;
  ar: boolean;
  /** When the number is missing, the form is the whole point of the page. */
  required?: boolean;
}) {
  const [state, action] = useFormState<ProfileFormState, FormData>(updateMyProfile, { ok: false, error: null });

  const errors: Record<string, string> = ar
    ? {
        name_required: 'الاسم مطلوب.',
        phone_invalid: 'أدخل رقم موبايل مصري صحيحاً، مثل 010 1234 5678.',
        save_failed: 'تعذّر الحفظ. حاول مرة أخرى.',
        signed_out: 'انتهت الجلسة. سجّل الدخول مرة أخرى.'
      }
    : {
        name_required: 'Your name is required.',
        phone_invalid: 'Enter a valid Egyptian mobile number, for example 010 1234 5678.',
        save_failed: "Couldn't save. Please try again.",
        signed_out: 'Your session ended. Please log in again.'
      };

  // Show the stored number in the local 01x format students recognise, not
  // the 20… international form it is stored in.
  const displayPhone = phone?.startsWith('20') ? `0${phone.slice(2)}` : phone ?? '';

  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="label" htmlFor="pf-name">{ar ? 'الاسم' : 'Name'}</label>
        <input id="pf-name" name="full_name" defaultValue={fullName} maxLength={120} className="field" required />
      </div>

      <div>
        <label className="label" htmlFor="pf-phone">{ar ? 'رقم الموبايل (واتساب)' : 'Mobile number (WhatsApp)'}</label>
        <input
          id="pf-phone"
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          dir="ltr"
          defaultValue={displayPhone}
          placeholder="010 1234 5678"
          className="field"
          required
          autoFocus={required}
        />
        <p className="mt-1.5 text-xs text-steel">
          {ar
            ? 'نرسل عليه تذكيرات الكورس وإشعار تقييم حالتك.'
            : 'Used for course reminders and to tell you when your case is graded.'}
        </p>
      </div>

      <div>
        <label className="label" htmlFor="pf-email">{ar ? 'البريد الإلكتروني' : 'Email'}</label>
        <input id="pf-email" value={email} readOnly disabled dir="ltr" className="field opacity-60" />
      </div>

      {state.error && (
        <p role="alert" className="text-sm font-semibold text-red-700">{errors[state.error] ?? errors.save_failed}</p>
      )}
      {state.ok && (
        <p role="status" className="text-sm font-semibold text-emerald-700">{ar ? 'تم الحفظ.' : 'Saved.'}</p>
      )}

      <SubmitButton ar={ar}>{ar ? 'حفظ' : 'Save'}</SubmitButton>
    </form>
  );
}
