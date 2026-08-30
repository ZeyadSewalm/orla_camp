'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';

export default function UploadCaseFile({ moduleId, userId }: { moduleId: string; userId: string }) {
  const router = useRouter();
  const t = useTranslations('course');
  const c = useTranslations('common');
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');

  async function onFile(file: File) {
    setState('busy');
    const supabase = createClient();
    // Path starts with the user id — the storage policy keys off that folder.
    const path = `${userId}/${Date.now()}-${file.name.replace(/[^\w.\-]/g, '_')}`;

    const { error: uploadError } = await supabase.storage.from('case-files').upload(path, file);
    if (uploadError) return setState('error');

    const { error } = await supabase.from('case_file_submissions').insert({
      user_id: userId, module_id: moduleId, file_url: path, file_name: file.name, status: 'pending'
    });
    if (error) {
      // Avoid leaving an orphaned private file if the metadata row fails.
      await supabase.storage.from('case-files').remove([path]);
      setState('error');
      return;
    }

    setState('done');
    router.refresh();
  }

  if (state === 'done') return <p className="text-sm text-brass">{t('uploaded')}</p>;

  return (
    <label className="btn-quiet cursor-pointer text-sm">
      <input
        type="file"
        className="sr-only"
        accept=".stl,.pdf,.png,.jpg,.jpeg,.zip,.dcm,.ply"
        onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
      />
      {state === 'busy' ? t('uploading') : state === 'error' ? c('error') : t('upload')}
    </label>
  );
}
