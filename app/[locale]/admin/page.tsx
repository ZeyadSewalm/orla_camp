import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations, unstable_setRequestLocale } from 'next-intl/server';
import { getProfile } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { lh } from '@/lib/href';
import {
  Card, Field, Sidebar, Stat, Empty, Pill, TABS, REVIEWER_TABS, type Tab
} from '@/components/admin/Shell';
import CaseFileLink from '@/components/admin/CaseFileLink';
import { Users, Wallet, ClipboardCheck, Coins } from 'lucide-react';
import BunnyUpload from '@/components/admin/BunnyUpload';
import { isBunnyConfigured } from '@/lib/bunny';
import {
  updateTier, saveModule, deleteModule, reviewCaseFile, updateRequest,
  grantProductionPartner, saveSession, deleteSession, saveCommunity, savePromo,
  deletePromo, saveSettings, updateStudent, recordManualPayment
} from './actions';

export const metadata: Metadata = { robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function Admin({
  params: { locale },
  searchParams
}: {
  params: { locale: string };
  searchParams: { tab?: string; student?: string; case?: string };
}) {
  unstable_setRequestLocale(locale);

  const me = await getProfile();
  if (!me || (me.role !== 'admin' && me.role !== 'reviewer')) redirect(lh(locale, ''));

  const isReviewer = me.role === 'reviewer';
  const allowed: readonly Tab[] = isReviewer ? REVIEWER_TABS : TABS;

  const t = await getTranslations('admin');
  const requested = searchParams.tab as Tab | undefined;
  const tab: Tab = requested && allowed.includes(requested) ? requested : allowed[0];

  const labels = Object.fromEntries(TABS.map((x) => [x, t(x as 'students')]));
  const groupLabels = {
    overview: t('groupOverview'),
    people: t('groupPeople'),
    course: t('groupCourse'),
    selling: t('groupSelling')
  };
  const db = createAdminClient();
  const { count: pendingQCCount } = await db
    .from('case_file_submissions')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending');
  const save = t('save');
  const crud = { save, add: t('add'), del: t('delete'), emptyModules: t('emptyModules'), emptyModulesBody: t('emptyModulesBody') };

  return (
    <div className="mx-auto max-w-content px-5 py-10">
      <div className="mb-8 flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="display text-3xl">{t('title')}</h1>
        <p className="text-sm text-steel">
          {me.full_name || me.email} · {isReviewer ? t('roleReviewer') : t('roleAdmin')}
        </p>
      </div>

      <div className="grid gap-10 lg:grid-cols-[13rem_1fr]">
        <Sidebar locale={locale} active={tab} labels={labels} groupLabels={groupLabels} allowed={allowed} pendingQC={pendingQCCount ?? 0} />

        <div className="min-w-0">
          {tab === 'dashboard' && <Dashboard db={db} locale={locale} t={t} />}
          {tab === 'students' && <Students db={db} locale={locale} save={save} studentId={searchParams.student} t={t} />}
          {tab === 'payments' && <Payments db={db} locale={locale} t={t} />}
          {tab === 'modules' && <Modules db={db} t={crud} />}
          {tab === 'qc' && <QC db={db} save={save} locale={locale} caseId={searchParams.case} t={t} />}
          {tab === 'tiers' && <Tiers db={db} save={save} />}
          {tab === 'requests' && <Requests db={db} save={save} />}
          {tab === 'sessions' && <Sessions db={db} t={crud} />}
          {tab === 'community' && <Community db={db} save={save} />}
          {tab === 'promos' && <Promos db={db} t={crud} />}
          {tab === 'content' && <Settings db={db} save={save} />}
        </div>
      </div>
    </div>
  );
}

type DB = ReturnType<typeof createAdminClient>;

/* ------------------------------------------------------------------ tiers */
async function Tiers({ db, save }: { db: DB; save: string }) {
  const { data: tiers } = await db.from('tiers').select('*').order('order_index');

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {(tiers ?? []).map((tier) => (
        <Card key={tier.id}>
          <form action={updateTier} className="space-y-3">
            <input type="hidden" name="id" value={tier.id} />
            <p className="font-display text-lg font-bold">{tier.slug}</p>
            <Field label="Name (AR)"><input name="name_ar" defaultValue={tier.name_ar} className="field" /></Field>
            <Field label="Name (EN)"><input name="name_en" defaultValue={tier.name_en} className="field" /></Field>
            <Field label="Description (AR)"><textarea name="description_ar" rows={2} defaultValue={tier.description_ar ?? ''} className="field" /></Field>
            <Field label="Description (EN)"><textarea name="description_en" rows={2} defaultValue={tier.description_en ?? ''} className="field" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Price EGP"><input name="price_egp" type="number" step="1" defaultValue={tier.price_egp ?? ''} className="field" /></Field>
              <Field label="Price USD"><input name="price_usd" type="number" step="1" defaultValue={tier.price_usd ?? ''} className="field" /></Field>
              <Field label="Instalment EGP"><input name="installment_price_egp" type="number" defaultValue={tier.installment_price_egp ?? ''} className="field" /></Field>
              <Field label="Instalment USD"><input name="installment_price_usd" type="number" defaultValue={tier.installment_price_usd ?? ''} className="field" /></Field>
              <Field label="Max seats"><input name="max_seats" type="number" defaultValue={tier.max_seats ?? ''} className="field" /></Field>
              <Field label="Seats taken"><input name="current_seats_taken" type="number" defaultValue={tier.current_seats_taken ?? 0} className="field" /></Field>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="installments_available" defaultChecked={tier.installments_available} className="h-4 w-4" />
              Instalments on
            </label>
            <button className="btn-primary w-full">{save}</button>
          </form>
        </Card>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- modules */
async function Modules({ db, t }: { db: DB; t: { save: string; add: string; del: string; emptyModules: string; emptyModulesBody: string } }) {
  const { data: modules } = await db.from('course_modules').select('*').order('order_index');
  const bunnyOn = isBunnyConfigured();
  const uploadLabels = {
    choose: 'Upload video',
    uploading: 'Uploading',
    done: 'Uploaded',
    failed: 'Upload failed',
    processing: 'Uploaded — Bunny is transcoding, it will be playable shortly.'
  };

  const form = (m?: Record<string, any>) => (
    <form action={saveModule} className="space-y-4" encType="multipart/form-data">
      {m && <input type="hidden" name="id" value={m.id} />}
      {m?.checklist_file_url && <input type="hidden" name="checklist_file_url" value={m.checklist_file_url} />}
      {m?.thumbnail_url && <input type="hidden" name="thumbnail_url" value={m.thumbnail_url} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Title (AR)"><input name="title_ar" defaultValue={m?.title_ar ?? ''} className="field" required /></Field>
        <Field label="Title (EN)"><input name="title_en" defaultValue={m?.title_en ?? ''} className="field" required /></Field>
        <Field label="Description (AR)"><textarea name="description_ar" rows={2} defaultValue={m?.description_ar ?? ''} className="field" /></Field>
        <Field label="Description (EN)"><textarea name="description_en" rows={2} defaultValue={m?.description_en ?? ''} className="field" /></Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Field label="Block">
          <select name="block" defaultValue={m?.block ?? 'foundations'} className="field">
            <option value="foundations">Foundations</option>
            <option value="restorative">Restorative</option>
            <option value="advanced">Advanced</option>
          </select>
        </Field>
        <Field label="Status">
          <select name="status" defaultValue={m?.status ?? 'coming'} className="field">
            <option value="available">Available now</option>
            <option value="coming">Coming in your access period</option>
          </select>
        </Field>
        <Field label="Minutes"><input name="duration_minutes" type="number" defaultValue={m?.duration_minutes ?? ''} className="field" /></Field>
        <Field label="Order"><input name="order_index" type="number" defaultValue={m?.order_index ?? (modules?.length ?? 0) + 1} className="field" /></Field>
      </div>

      <Field label="Video source">
        <select name="video_source" defaultValue={m?.video_source ?? 'drive'} className="field">
          <option value="drive">Google Drive link</option>
          <option value="bunny">Bunny Stream (uploaded below)</option>
        </select>
      </Field>

      <Field label="Google Drive video link" hint="Only used when the source above is set to Drive. Share → Anyone with the link → Viewer.">
        <input name="video_link" defaultValue={m?.video_link ?? ''} className="field" />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Thumbnail image" hint={m?.thumbnail_url ? 'An image is already set — uploading replaces it.' : 'Shown on the course page and the landing curriculum.'}>
          <input name="thumbnail" type="file" accept="image/*" className="field" />
        </Field>
        <Field label="Checklist PDF" hint={m?.checklist_file_url ? 'A file is already set — uploading replaces it.' : undefined}>
          <input name="checklist" type="file" accept="application/pdf" className="field" />
        </Field>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="is_free_preview" defaultChecked={m?.is_free_preview ?? false} className="h-4 w-4" />
        Free preview — viewable without a paid plan
      </label>

      <button className="btn-primary">{m ? t.save : t.add}</button>
    </form>
  );

  return (
    <div className="space-y-6">
      <Card><h2 className="mb-5 font-display text-lg font-bold">New module</h2>{form()}</Card>

      {(modules ?? []).length === 0 && <Empty title={t.emptyModules}>{t.emptyModulesBody}</Empty>}

      {(modules ?? []).map((m) => (
        <Card key={m.id}>
          <div className="mb-5 flex flex-wrap items-center gap-3">
            {m.thumbnail_url && <img src={m.thumbnail_url} alt="" className="h-14 w-24 object-cover" />}
            <div>
              <p className="font-display text-lg font-bold">{m.title_en}</p>
              <p className="mt-1 flex items-center gap-2 text-xs text-steel">
                {m.block}
                {m.status === 'available' ? <Pill tone="ok">available</Pill> : <Pill tone="mute">coming</Pill>}
                {m.is_free_preview && <Pill tone="warn">free</Pill>}
                {m.video_source === 'bunny' && m.bunny_video_id ? <Pill tone="ok">bunny</Pill> : m.video_link ? <Pill tone="mute">drive</Pill> : <Pill tone="warn">no video</Pill>}
              </p>
            </div>
          </div>
          {form(m)}

          <div className="mt-6 border-t border-line pt-5">
            <p className="label mb-1">Bunny Stream video</p>
            {!bunnyOn ? (
              <p className="text-xs text-steel">
                Not configured — add BUNNY_LIBRARY_ID, BUNNY_API_KEY and BUNNY_CDN_HOSTNAME to .env.local.
              </p>
            ) : m.bunny_video_id ? (
              <div className="space-y-3">
                <p className="flex items-center gap-2 text-xs text-steel">
                  <Pill tone="ok">uploaded</Pill>
                  <code className="break-all">{m.bunny_video_id}</code>
                </p>
                <BunnyUpload moduleId={m.id} title={m.title_en} labels={uploadLabels} />
                <p className="text-xs text-steel">Uploading again replaces the video for this module.</p>
              </div>
            ) : (
              <BunnyUpload moduleId={m.id} title={m.title_en} labels={uploadLabels} />
            )}
          </div>

          <form action={deleteModule} className="mt-4">
            <input type="hidden" name="id" value={m.id} />
            <button className="text-xs text-red-700 underline">{t.del}</button>
          </form>
        </Card>
      ))}
    </div>
  );
}

/* --------------------------------------------------------------------- QC */
async function QC({ db, save, locale, caseId, t }: { db: DB; save: string; locale: string; caseId?: string; t: any }) {
  const { data: rows } = await db
    .from('case_file_submissions')
    .select('*, profiles(email, full_name), course_modules(title_en)')
    .order('status', { ascending: true })
    .order('submitted_at', { ascending: false });

  const list = rows ?? [];
  const pending = list.filter((x) => x.status === 'pending');

  if (list.length === 0) {
    return <Empty title={t('qcEmptyTitle')}>{t('qcEmptyBody')}</Empty>;
  }

  // Default to the oldest pending file — the one Badr should open next.
  const selected = list.find((x) => x.id === caseId) ?? pending[pending.length - 1] ?? list[0];

  return (
    <div className="grid gap-px border border-line bg-line lg:grid-cols-[20rem_1fr]">
      {/* ---- queue ---- */}
      <div className="bg-white">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <p className="label mb-0">{t('qcQueue')}</p>
          <span className="figure text-xs text-brass">{pending.length}</span>
        </div>

        <ul className="max-h-[34rem] overflow-y-auto">
          {list.map((row) => {
            const on = row.id === selected?.id;
            return (
              <li key={row.id}>
                <a
                  href={`${lh(locale, '/admin')}?tab=qc&case=${row.id}`}
                  aria-current={on ? 'true' : undefined}
                  className={`block border-b border-line px-5 py-4 transition ${
                    on ? 'border-s-2 border-s-brass bg-paper' : 'hover:bg-paper'
                  }`}
                >
                  <p className="truncate text-sm font-medium text-ink">{row.file_name ?? row.file_url}</p>
                  <p className="mt-1 truncate text-xs text-steel">
                    {(row.profiles as any)?.full_name || (row.profiles as any)?.email}
                  </p>
                  <p className="mt-2.5 flex items-center justify-between">
                    {row.status === 'reviewed' ? <Pill tone="ok">{t('reviewed')}</Pill> : <Pill tone="warn">{t('pending')}</Pill>}
                    <span className="figure text-[0.7rem] text-steel/70">
                      {new Date(row.submitted_at).toLocaleDateString('en-GB')}
                    </span>
                  </p>
                </a>
              </li>
            );
          })}
        </ul>
      </div>

      {/* ---- the file being reviewed ---- */}
      <div className="bg-white p-7">
        {selected ? (
          <>
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-5">
              <div>
                <h2 className="font-display text-base font-bold">{selected.file_name ?? selected.file_url}</h2>
                <p className="mt-1.5 text-sm text-steel">
                  {(selected.profiles as any)?.full_name || (selected.profiles as any)?.email}
                  {(selected.course_modules as any)?.title_en ? ` · ${(selected.course_modules as any).title_en}` : ''}
                </p>
                <p className="figure mt-1 text-xs text-steel/70">
                  {new Date(selected.submitted_at).toLocaleString('en-GB')}
                </p>
              </div>
              {selected.status === 'reviewed' ? <Pill tone="ok">{t('reviewed')}</Pill> : <Pill tone="warn">{t('pending')}</Pill>}
            </div>

            <div className="mt-6">
              <p className="label">{t('theFile')}</p>
              <div className="border border-dashed border-line bg-paper px-6 py-8 text-center">
                <CaseFileLink path={selected.file_url} name={selected.file_name ?? t('openFile')} />
                <p className="mt-2 text-xs text-steel">{t('openFileHint')}</p>
              </div>
            </div>

            <form action={reviewCaseFile} className="mt-7 space-y-4">
              <input type="hidden" name="id" value={selected.id} />
              <Field label={t('feedback')} hint={t('feedbackHint')}>
                <textarea
                  name="reviewer_notes"
                  rows={9}
                  defaultValue={selected.reviewer_notes ?? ''}
                  className="field"
                  placeholder={t('feedbackPlaceholder')}
                />
              </Field>
              <button className="btn-primary">{save}</button>
            </form>

            {selected.reviewed_by && (
              <p className="mt-4 text-xs text-steel">
                {t('reviewedBy')}: {selected.reviewed_by}
              </p>
            )}
          </>
        ) : (
          <Empty title={t('qcEmptyTitle')}>{t('qcEmptyBody')}</Empty>
        )}
      </div>
    </div>
  );
}

/* --------------------------------------------------- production partner PP */
async function Requests({ db, save }: { db: DB; save: string }) {
  const { data: rows } = await db
    .from('production_partner_requests')
    .select('*')
    .order('created_at', { ascending: false });

  return (
    <div className="space-y-5">
      {(rows ?? []).map((r) => (
        <Card key={r.id}>
          <p className="font-medium">{r.full_name} — {r.email}{r.phone ? ` — ${r.phone}` : ''}</p>
          {r.message && <p className="mt-2 whitespace-pre-wrap text-sm text-steel">{r.message}</p>}

          <form action={updateRequest} className="mt-4 grid gap-3 sm:grid-cols-4">
            <input type="hidden" name="id" value={r.id} />
            <Field label="Status">
              <select name="status" defaultValue={r.status} className="field">
                {['pending', 'contacted', 'approved', 'rejected'].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Agreed price"><input name="agreed_price" type="number" defaultValue={r.agreed_price ?? ''} className="field" /></Field>
            <Field label="Currency">
              <select name="agreed_currency" defaultValue={r.agreed_currency ?? 'EGP'} className="field">
                <option value="EGP">EGP</option><option value="USD">USD</option>
              </select>
            </Field>
            <Field label="Notes"><input name="admin_notes" defaultValue={r.admin_notes ?? ''} className="field" /></Field>
            <button className="btn-quiet sm:col-span-4">{save}</button>
          </form>

          {r.status === 'approved' && r.user_id && (
            <form action={grantProductionPartner} className="mt-3 flex flex-wrap items-end gap-3 border-t border-line pt-3">
              <input type="hidden" name="id" value={r.id} />
              <input type="hidden" name="user_id" value={r.user_id} />
              <input type="hidden" name="agreed_price" value={r.agreed_price ?? ''} />
              <input type="hidden" name="agreed_currency" value={r.agreed_currency ?? 'EGP'} />
              <button className="btn-brass text-sm">Grant access manually</button>
              <span className="text-xs text-steel">Takes one of the 3 seats.</span>
            </form>
          )}
        </Card>
      ))}
    </div>
  );
}

/* --------------------------------------------------------------- sessions */
async function Sessions({ db, t }: { db: DB; t: { save: string; add: string; del: string } }) {
  const { data: rows } = await db.from('live_sessions').select('*').order('scheduled_at', { ascending: false });

  const form = (s?: Record<string, any>) => (
    <form action={saveSession} className="grid gap-3 sm:grid-cols-2">
      {s && <input type="hidden" name="id" value={s.id} />}
      <Field label="Title (AR)"><input name="title_ar" defaultValue={s?.title_ar ?? ''} className="field" required /></Field>
      <Field label="Title (EN)"><input name="title_en" defaultValue={s?.title_en ?? ''} className="field" required /></Field>
      <Field label="Date & time">
        <input name="scheduled_at" type="datetime-local" className="field" required
          defaultValue={s ? new Date(s.scheduled_at).toISOString().slice(0, 16) : ''} />
      </Field>
      <Field label="Minimum plan order"><input name="min_tier_order" type="number" defaultValue={s?.min_tier_order ?? 2} className="field" /></Field>
      <Field label="Join link"><input name="join_link" defaultValue={s?.join_link ?? ''} className="field" /></Field>
      <Field label="Recording link"><input name="recording_link" defaultValue={s?.recording_link ?? ''} className="field" /></Field>
      <button className="btn-primary sm:col-span-2">{s ? t.save : t.add}</button>
    </form>
  );

  return (
    <div className="space-y-6">
      <Card>{form()}</Card>
      {(rows ?? []).map((s) => (
        <Card key={s.id}>
          {form(s)}
          <form action={deleteSession} className="mt-3">
            <input type="hidden" name="id" value={s.id} />
            <button className="text-xs text-red-700 underline">{t.del}</button>
          </form>
        </Card>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------- community */
async function Community({ db, save }: { db: DB; save: string }) {
  const { data } = await db.from('community_settings').select('*').eq('id', 1).maybeSingle();
  return (
    <Card>
      <form action={saveCommunity} className="max-w-lg space-y-4">
        <Field label="WhatsApp group link"><input name="whatsapp_group_link" defaultValue={data?.whatsapp_group_link ?? ''} className="field" /></Field>
        <Field label="Minimum plan order"><input name="min_tier_order" type="number" defaultValue={data?.min_tier_order ?? 2} className="field" /></Field>
        <button className="btn-primary">{save}</button>
      </form>
    </Card>
  );
}

/* ----------------------------------------------------------------- promos */
async function Promos({ db, t }: { db: DB; t: { save: string; add: string; del: string } }) {
  const [{ data: promos }, { data: tiers }] = await Promise.all([
    db.from('promo_codes').select('*').order('created_at', { ascending: false }),
    db.from('tiers').select('id,name_en').order('order_index')
  ]);

  const form = (p?: Record<string, any>) => (
    <form action={savePromo} className="grid gap-3 sm:grid-cols-2">
      {p && <input type="hidden" name="id" value={p.id} />}
      <Field label="Code"><input name="code" defaultValue={p?.code ?? ''} className="field" required /></Field>
      <Field label="Type">
        <select name="discount_type" defaultValue={p?.discount_type ?? 'percentage'} className="field">
          <option value="percentage">percentage</option><option value="fixed">fixed</option>
        </select>
      </Field>
      <Field label="Value"><input name="discount_value" type="number" step="0.01" defaultValue={p?.discount_value ?? ''} className="field" required /></Field>
      <Field label="Max uses"><input name="max_uses" type="number" defaultValue={p?.max_uses ?? ''} className="field" /></Field>
      <Field label="Expires">
        <input name="expires_at" type="datetime-local" className="field"
          defaultValue={p?.expires_at ? new Date(p.expires_at).toISOString().slice(0, 16) : ''} />
      </Field>
      <div>
        <span className="label">Applies to (none = all)</span>
        <div className="space-y-1 text-sm">
          {(tiers ?? []).map((x) => (
            <label key={x.id} className="flex items-center gap-2">
              <input type="checkbox" name="applicable_tiers" value={x.id}
                defaultChecked={p?.applicable_tiers?.includes(x.id)} className="h-4 w-4" />
              {x.name_en}
            </label>
          ))}
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="is_active" defaultChecked={p ? p.is_active : true} className="h-4 w-4" /> Active
      </label>
      <button className="btn-primary sm:col-span-2">{p ? t.save : t.add}</button>
    </form>
  );

  return (
    <div className="space-y-6">
      <Card>{form()}</Card>
      {(promos ?? []).map((p) => (
        <Card key={p.id}>
          <p className="mb-3 text-xs text-steel">used {p.used_count}{p.max_uses ? ` / ${p.max_uses}` : ''}</p>
          {form(p)}
          <form action={deletePromo} className="mt-3">
            <input type="hidden" name="id" value={p.id} />
            <button className="text-xs text-red-700 underline">{t.del}</button>
          </form>
        </Card>
      ))}
    </div>
  );
}

/* --------------------------------------------------------------- settings */
async function Settings({ db, save }: { db: DB; save: string }) {
  const { data } = await db.from('site_settings').select('*').eq('id', 1).maybeSingle();

  const pair = (name: string, label: string, rows = 0) => (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label={`${label} (AR)`}>
        {rows ? <textarea name={`${name}_ar`} rows={rows} defaultValue={data?.[`${name}_ar`] ?? ''} className="field" />
              : <input name={`${name}_ar`} defaultValue={data?.[`${name}_ar`] ?? ''} className="field" />}
      </Field>
      <Field label={`${label} (EN)`}>
        {rows ? <textarea name={`${name}_en`} rows={rows} defaultValue={data?.[`${name}_en`] ?? ''} className="field" />
              : <input name={`${name}_en`} defaultValue={data?.[`${name}_en`] ?? ''} className="field" />}
      </Field>
    </div>
  );

  return (
    <form action={saveSettings} className="space-y-8" encType="multipart/form-data">
      {data?.landing_image_url && <input type="hidden" name="landing_image_url" value={data.landing_image_url} />}

      <Card className="space-y-5">
        <h2 className="font-display text-lg font-bold">Hero</h2>
        {pair('hero_kicker', 'Kicker')}
        {pair('hero_headline', 'Headline', 2)}
        {pair('hero_subhead', 'Subhead', 3)}
        {pair('cta_primary', 'Primary button')}
      </Card>

      <Card className="space-y-5">
        <h2 className="font-display text-lg font-bold">Landing</h2>
        {pair('landing_title', 'Title')}
        {pair('landing_description', 'Description', 4)}
        <Field label="Landing image" hint={data?.landing_image_url ? 'An image is already set — uploading replaces it.' : undefined}>
          <input name="landing_image" type="file" accept="image/*" className="field" />
        </Field>
        {data?.landing_image_url && <img src={data.landing_image_url} alt="" className="h-32 w-auto object-cover" />}
      </Card>

      <Card className="space-y-5">
        <h2 className="font-display text-lg font-bold">Contact</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="WhatsApp number"><input name="whatsapp_number" defaultValue={data?.whatsapp_number ?? ''} className="field" /></Field>
          <Field label="Instagram URL"><input name="instagram_url" defaultValue={data?.instagram_url ?? ''} className="field" /></Field>
          <Field label="YouTube URL"><input name="youtube_url" defaultValue={data?.youtube_url ?? ''} className="field" /></Field>
        </div>
      </Card>

      <button className="btn-primary">{save}</button>
    </form>
  );
}

/* -------------------------------------------------------------- dashboard */
async function Dashboard({ db, locale, t }: { db: DB; locale: string; t: any }) {
  const [{ count: students }, { data: profiles }, { data: payments }, { count: pendingQC }, { data: tiers }, { count: openRequests }, { data: recent }] =
    await Promise.all([
      db.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'user'),
      db.from('profiles').select('tier_id, has_access, created_at, installments_paid, installments_total'),
      db.from('payments').select('amount, currency, status, paid_at'),
      db.from('case_file_submissions').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      db.from('tiers').select('id,name_en,max_seats,current_seats_taken').order('order_index'),
      db.from('production_partner_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      db.from('profiles').select('email, full_name, created_at, has_access').order('created_at', { ascending: false }).limit(6)
    ]);

  const paid = (payments ?? []).filter((x) => x.status === 'paid');
  const sum = (cur: string) => paid.filter((x) => x.currency === cur).reduce((a, b) => a + Number(b.amount), 0);

  const since = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const paid30 = paid.filter((x) => x.paid_at && new Date(x.paid_at).getTime() >= since);
  const sum30 = (cur: string) => paid30.filter((x) => x.currency === cur).reduce((a, b) => a + Number(b.amount), 0);

  const active = (profiles ?? []).filter((x) => x.has_access).length;
  const owing = (profiles ?? []).filter(
    (x) => (x.installments_total ?? 0) > 0 && (x.installments_paid ?? 0) < x.installments_total
  ).length;

  return (
    <div className="space-y-10">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={Users} label={t('statStudents')} value={students ?? 0} sub={`${active} ${t('statActive')}`} />
        <Stat icon={Wallet} label="EGP" value={sum('EGP').toLocaleString('en-US')} sub={`${sum30('EGP').toLocaleString('en-US')} ${t('statLast30')}`} />
        <Stat icon={Coins} label="USD" value={sum('USD').toLocaleString('en-US')} sub={`${sum30('USD').toLocaleString('en-US')} ${t('statLast30')}`} />
        <Stat icon={ClipboardCheck} label={t('statPendingQC')} value={pendingQC ?? 0} sub={`${openRequests ?? 0} ${t('statOpenRequests')}`} />
      </div>

      {owing > 0 && (
        <div className="border-s-4 border-brass bg-white p-5 text-sm">
          <strong>{owing}</strong> {t('owingStudents')}
        </div>
      )}

      <div>
        <h2 className="mb-4 font-display text-xl font-bold">{t('seatsTitle')}</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {(tiers ?? []).map((tier) => {
            const members = (profiles ?? []).filter((x) => x.tier_id === tier.id && x.has_access).length;
            const left = tier.max_seats === null ? null : Math.max(0, tier.max_seats - (tier.current_seats_taken ?? 0));
            return <Stat key={tier.id} label={tier.name_en} value={members} sub={left === null ? undefined : `${left} ${t('seatsLeft')}`} />;
          })}
        </div>
      </div>

      <div>
        <h2 className="mb-4 font-display text-xl font-bold">{t('recentSignups')}</h2>
        {(recent ?? []).length === 0 ? (
          <Empty title={t('emptyStudents')}>{t('emptyStudentsBody')}</Empty>
        ) : (
          <div className="border border-ink/15 bg-white">
            {(recent ?? []).map((r) => (
              <div key={r.email} className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3 last:border-0">
                <span className="text-sm">{r.full_name || r.email}</span>
                <span className="flex items-center gap-3 text-xs text-steel">
                  {new Date(r.created_at).toLocaleDateString('en-GB')}
                  {r.has_access ? <Pill tone="ok">{t('access')}</Pill> : <Pill tone="mute">{t('noAccess')}</Pill>}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- students */
async function Students({
  db, locale, save, studentId, t
}: { db: DB; locale: string; save: string; studentId?: string; t: any }) {
  const { data: tiers } = await db.from('tiers').select('id,name_en').order('order_index');

  // ---- detail view ----
  if (studentId) {
    const [{ data: student }, { data: pays }, { data: cases }] = await Promise.all([
      db.from('profiles').select('*').eq('id', studentId).single(),
      db.from('payments').select('*, tiers(name_en)').eq('user_id', studentId).order('created_at', { ascending: false }),
      db.from('case_file_submissions').select('*').eq('user_id', studentId).order('submitted_at', { ascending: false })
    ]);

    if (!student) return <Empty title={t('notFound')}>{t('notFoundBody')}</Empty>;

    return (
      <div className="space-y-8">
        <a href={`${lh(locale, '/admin')}?tab=students`} className="text-sm text-brass underline">← {t('backToList')}</a>

        <Card>
          <h2 className="font-display text-2xl font-black">{student.full_name || student.email}</h2>
          <p className="mt-1 text-sm text-steel">{student.email}</p>

          {student.installments_total > 0 && (
            <p className="mt-4 inline-flex items-center gap-3 border border-ink px-4 py-2 text-sm">
              <span>{t('installmentsPaid')}: <strong>{student.installments_paid ?? 0} / {student.installments_total}</strong></span>
              {student.next_installment_due && (
                <span className="text-steel">{t('nextDue')}: {student.next_installment_due}</span>
              )}
              {(student.installments_paid ?? 0) < student.installments_total && <Pill tone="warn">{t('owing')}</Pill>}
            </p>
          )}

          <form action={updateStudent} className="mt-6 grid gap-4 sm:grid-cols-2">
            <input type="hidden" name="id" value={student.id} />
            <Field label={t('fullName')}><input name="full_name" defaultValue={student.full_name ?? ''} className="field" /></Field>
            <Field label={t('phone')}><input name="phone" defaultValue={student.phone ?? ''} className="field" /></Field>
            <Field label={t('region')}>
              <select name="region" defaultValue={student.region ?? 'egypt'} className="field">
                <option value="egypt">Egypt</option><option value="international">International</option>
              </select>
            </Field>
            <Field label={t('plan')}>
              <select name="tier_id" defaultValue={student.tier_id ?? ''} className="field">
                <option value="">—</option>
                {(tiers ?? []).map((x) => <option key={x.id} value={x.id}>{x.name_en}</option>)}
              </select>
            </Field>
            <Field label={t('role')} hint={t('roleHint')}>
              <select name="role" defaultValue={student.role} className="field">
                <option value="user">user</option>
                <option value="reviewer">reviewer</option>
                <option value="admin">admin</option>
              </select>
            </Field>
            <label className="flex items-end gap-2 pb-3 text-sm">
              <input type="checkbox" name="has_access" defaultChecked={student.has_access} className="h-4 w-4" />
              {t('hasAccess')}
            </label>
            <Field label={t('notes')}><textarea name="admin_notes" rows={3} defaultValue={student.admin_notes ?? ''} className="field" /></Field>
            <div className="flex items-end"><button className="btn-primary w-full">{save}</button></div>
          </form>
        </Card>

        <Card>
          <h3 className="font-display text-lg font-bold">{t('recordPayment')}</h3>
          <p className="mt-1 text-xs text-steel">{t('recordPaymentHint')}</p>
          <form action={recordManualPayment} className="mt-5 grid gap-4 sm:grid-cols-5">
            <input type="hidden" name="user_id" value={student.id} />
            <Field label={t('plan')}>
              <select name="tier_id" className="field" required>
                {(tiers ?? []).map((x) => <option key={x.id} value={x.id}>{x.name_en}</option>)}
              </select>
            </Field>
            <Field label={t('amount')}><input name="amount" type="number" step="0.01" className="field" required /></Field>
            <Field label={t('currency')}>
              <select name="currency" className="field"><option value="EGP">EGP</option><option value="USD">USD</option></select>
            </Field>
            <Field label={t('method')}><input name="payment_method" placeholder="bank / cash" className="field" /></Field>
            <Field label={t('reference')}><input name="reference" className="field" /></Field>
            <label className="flex items-center gap-2 text-sm sm:col-span-3">
              <input type="checkbox" name="grant_access" defaultChecked className="h-4 w-4" />
              {t('grantOnRecord')}
            </label>
            <div className="sm:col-span-2"><button className="btn-brass w-full">{t('add')}</button></div>
          </form>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <h3 className="font-display text-lg font-bold">{t('paymentHistory')}</h3>
            {(pays ?? []).length === 0 ? (
              <p className="mt-4 text-sm text-steel">{t('none')}</p>
            ) : (
              <ul className="mt-4 space-y-3 text-sm">
                {(pays ?? []).map((x) => (
                  <li key={x.id} className="flex items-center justify-between border-b border-line pb-2">
                    <span>{Number(x.amount).toLocaleString('en-US')} {x.currency} · {(x.tiers as any)?.name_en}</span>
                    <span className="flex items-center gap-2 text-xs text-steel">
                      {x.payment_method}
                      {x.status === 'paid' ? <Pill tone="ok">paid</Pill> : <Pill tone="mute">{x.status}</Pill>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <h3 className="font-display text-lg font-bold">{t('caseFiles')}</h3>
            {(cases ?? []).length === 0 ? (
              <p className="mt-4 text-sm text-steel">{t('none')}</p>
            ) : (
              <ul className="mt-4 space-y-3 text-sm">
                {(cases ?? []).map((x) => (
                  <li key={x.id} className="flex items-center justify-between border-b border-line pb-2">
                    <CaseFileLink path={x.file_url} name={x.file_name ?? x.file_url} />
                    {x.status === 'reviewed' ? <Pill tone="ok">reviewed</Pill> : <Pill tone="warn">pending</Pill>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    );
  }

  // ---- list view ----
  const { data: students } = await db
    .from('profiles')
    .select('*, tiers(name_en)')
    .order('created_at', { ascending: false });

  if ((students ?? []).length === 0) return <Empty title={t('emptyStudents')}>{t('emptyStudentsBody')}</Empty>;

  return (
    <div className="overflow-x-auto border border-ink/15 bg-white">
      <table className="w-full text-sm">
        <thead className="border-b border-ink/15 text-xs uppercase tracking-wider text-steel">
          <tr>
            <th className="p-4 text-start">{t('fullName')}</th>
            <th className="p-4 text-start">{t('plan')}</th>
            <th className="p-4 text-start">{t('role')}</th>
            <th className="p-4 text-start">{t('joined')}</th>
            <th className="p-4 text-start">{t('hasAccess')}</th>
          </tr>
        </thead>
        <tbody>
          {(students ?? []).map((u) => (
            <tr key={u.id} className="border-b border-line last:border-0 hover:bg-paper">
              <td className="p-4">
                <a href={`${lh(locale, '/admin')}?tab=students&student=${u.id}`} className="font-medium text-brass underline">
                  {u.full_name || u.email}
                </a>
                <span className="block text-xs text-steel">{u.email}</span>
              </td>
              <td className="p-4">{(u.tiers as any)?.name_en ?? '—'}</td>
              <td className="p-4">{u.role !== 'user' ? <Pill tone="warn">{u.role}</Pill> : '—'}</td>
              <td className="figure p-4 whitespace-nowrap text-xs text-steel">{new Date(u.created_at).toLocaleDateString('en-GB')}</td>
              <td className="p-4">{u.has_access ? <Pill tone="ok">{t('access')}</Pill> : <Pill tone="mute">{t('noAccess')}</Pill>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* --------------------------------------------------------------- payments */
async function Payments({ db, locale, t }: { db: DB; locale: string; t: any }) {
  const { data: rows } = await db
    .from('payments')
    .select('*, profiles(email, full_name), tiers(name_en)')
    .order('created_at', { ascending: false })
    .limit(200);

  if ((rows ?? []).length === 0) return <Empty title={t('emptyPayments')}>{t('emptyPaymentsBody')}</Empty>;

  return (
    <div className="overflow-x-auto border border-ink/15 bg-white">
      <table className="w-full text-sm">
        <thead className="border-b border-ink/15 text-xs uppercase tracking-wider text-steel">
          <tr>
            <th className="p-4 text-start">{t('student')}</th>
            <th className="p-4 text-start">{t('plan')}</th>
            <th className="p-4 text-start">{t('amount')}</th>
            <th className="p-4 text-start">{t('method')}</th>
            <th className="p-4 text-start">{t('status')}</th>
            <th className="p-4 text-start">{t('date')}</th>
          </tr>
        </thead>
        <tbody>
          {(rows ?? []).map((x) => (
            <tr key={x.id} className="border-b border-line last:border-0 hover:bg-paper">
              <td className="p-4">
                <a href={`${lh(locale, '/admin')}?tab=students&student=${x.user_id}`} className="text-brass underline">
                  {(x.profiles as any)?.full_name || (x.profiles as any)?.email || '—'}
                </a>
              </td>
              <td className="p-4">{(x.tiers as any)?.name_en ?? '—'}</td>
              <td className="figure p-4 text-ink">{Number(x.amount).toLocaleString('en-US')} {x.currency}</td>
              <td className="p-4 text-steel">{x.payment_method ?? '—'}{x.is_installment ? ` · ${t('installment')}` : ''}</td>
              <td className="p-4">
                {x.status === 'paid' ? <Pill tone="ok">paid</Pill> : x.status === 'failed' ? <Pill tone="warn">failed</Pill> : <Pill tone="mute">{x.status}</Pill>}
              </td>
              <td className="figure p-4 whitespace-nowrap text-xs text-steel">{new Date(x.created_at).toLocaleDateString('en-GB')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
