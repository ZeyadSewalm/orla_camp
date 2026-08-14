'use client';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { lh } from '@/lib/href';

export default function LogoutButton({ locale, label }: { locale: string; label: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      className="border border-ink/25 px-3 py-1.5 text-xs uppercase tracking-[0.18em] hover:border-ink"
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
