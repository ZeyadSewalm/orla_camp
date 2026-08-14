'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';

export default function ApplyForm({ defaults }: { defaults: { name: string; email: string; userId: string | null } }) {
  const t = useTranslations('apply');
  const c = useTranslations('common');
  const [form, setForm] = useState({ full_name: defaults.name, email: defaults.email, phone: '', message: '' });
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');

  async function submit() {
    setState('busy');
    const { error } = await createClient().from('production_partner_requests').insert({
      ...form, user_id: defaults.userId, status: 'pending'
    });
    setState(error ? 'error' : 'done');
  }

  if (state === 'done') return <p className="border border-brass bg-brass/5 p-6">{t('success')}</p>;

  return (
    <div className="space-y-5">
      <div>
        <label className="label" htmlFor="n">{t('name')}</label>
        <input id="n" className="field" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
      </div>
      <div>
        <label className="label" htmlFor="e">{t('email')}</label>
        <input id="e" type="email" className="field" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
      </div>
      <div>
        <label className="label" htmlFor="p">{t('phone')}</label>
        <input id="p" inputMode="tel" className="field" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
      </div>
      <div>
        <label className="label" htmlFor="m">{t('message')}</label>
        <textarea id="m" rows={4} className="field" value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
      </div>
      {state === 'error' && <p className="text-sm text-red-700">{c('error')}</p>}
      <button
        type="button" onClick={submit}
        disabled={state === 'busy' || !form.full_name || !form.email}
        className="btn-brass w-full disabled:opacity-50"
      >
        {state === 'busy' ? c('loading') : t('submit')}
      </button>
    </div>
  );
}
