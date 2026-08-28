'use client';
import { useState } from 'react';
import { signCaseFile } from '@/app/[locale]/admin/actions';

/** Private bucket, so the file is opened through a short-lived signed URL. */
export default function CaseFileLink({ path, name }: { path: string; name: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="text-sm text-brass underline"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const url = await signCaseFile(path);
        if (url) window.open(url, '_blank', 'noopener');
        setBusy(false);
      }}
    >
      {name}
    </button>
  );
}
