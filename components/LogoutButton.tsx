'use client';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { lh } from '@/lib/href';

export default function LogoutButton({ locale, label }: { locale: string; label: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      className="rounded-full border border-ink/15 bg-white/70 px-3.5 py-2 text-xs font-semibold hover:border-brass hover:text-brass"
      onClick={async () => {
        await createClient().auth.signOut();
        router.push(lh(locale, ``));
        router.refresh();
      }}
    >
      {label}
    </button>
  );
}
