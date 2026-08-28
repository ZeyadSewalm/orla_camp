'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { getProfile, requireAdmin } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

async function guard() {
  const admin = await requireAdmin();
  if (!admin) throw new Error('forbidden');
  return { db: createAdminClient(), admin };
}

/** Case-file review is the one action a reviewer may perform. */
async function guardReviewer() {
  const me = await getProfile();
  if (!me || (me.role !== 'admin' && me.role !== 'reviewer')) throw new Error('forbidden');
  return { db: createAdminClient(), me };
}

const num = (v: FormDataEntryValue | null) => (v === null || v === '' ? null : Number(v));
const str = (v: FormDataEntryValue | null) => (v === null || v === '' ? null : String(v));

function done() {
  // Public pages read through unstable_cache; clear the tags so an edit shows
  // up on the site immediately instead of waiting out the 5-minute window.
  revalidateTag('tiers');
  revalidateTag('modules');
  revalidateTag('settings');
  revalidatePath('/[locale]/admin', 'page');
  revalidatePath('/[locale]', 'page');
  revalidatePath('/[locale]/pricing', 'page');
  revalidatePath('/[locale]/course', 'page');
  // The free lesson reads the same modules table. Without this, flagging a
  // module as the free preview left /free-lesson serving its prerendered HTML
  // — you'd save in the admin, reload, and still see "coming soon".
  revalidatePath('/[locale]/free-lesson', 'page');
}

/* ---------------- students ---------------- */
export async function updateUser(formData: FormData) {
  const { db } = await guard();
  await db.from('profiles').update({
    has_access: formData.get('has_access') === 'on',
    tier_id: str(formData.get('tier_id'))
  }).eq('id', String(formData.get('id')));
  done();
}

/** Full student record edit, from the student detail screen. */
export async function updateStudent(formData: FormData) {
  const { db, admin } = await guard();
  const id = String(formData.get('id'));
  const role = str(formData.get('role')) ?? 'user';

  // An admin must never be able to demote themselves and lock everyone out.
  const safeRole = id === admin.id ? admin.role : role;

  await db.from('profiles').update({
    full_name: str(formData.get('full_name')),
    phone: str(formData.get('phone')),
    region: str(formData.get('region')) ?? 'egypt',
    tier_id: str(formData.get('tier_id')),
    has_access: formData.get('has_access') === 'on',
    role: safeRole,
    admin_notes: str(formData.get('admin_notes'))
  }).eq('id', id);
  revalidateTag(`profile:${id}`);
  done();
}

/** Records an off-platform payment (bank transfer, cash, Vodafone Cash). */
export async function recordManualPayment(formData: FormData) {
  const { db } = await guard();
  const userId = String(formData.get('user_id'));
  const tierId = String(formData.get('tier_id'));

  await db.from('payments').insert({
    user_id: userId,
    tier_id: tierId,
    amount: num(formData.get('amount')) ?? 0,
    currency: str(formData.get('currency')) ?? 'EGP',
    status: 'paid',
    payment_method: str(formData.get('payment_method')) ?? 'manual',
    provider_reference: str(formData.get('reference')),
    paid_at: new Date().toISOString()
  });

  if (formData.get('grant_access') === 'on') {
    await db.from('profiles').update({ tier_id: tierId, has_access: true }).eq('id', userId);
  }
  done();
}

/* ---------------- tiers ---------------- */
export async function updateTier(formData: FormData) {
  const { db } = await guard();
  await db.from('tiers').update({
    name_ar: String(formData.get('name_ar')),
    name_en: String(formData.get('name_en')),
    description_ar: str(formData.get('description_ar')),
    description_en: str(formData.get('description_en')),
    price_egp: num(formData.get('price_egp')),
    price_usd: num(formData.get('price_usd')),
    installments_available: formData.get('installments_available') === 'on',
    installment_price_egp: num(formData.get('installment_price_egp')),
    installment_price_usd: num(formData.get('installment_price_usd')),
    max_seats: num(formData.get('max_seats')),
    current_seats_taken: num(formData.get('current_seats_taken')) ?? 0
  }).eq('id', String(formData.get('id')));
  done();
}

/* ---------------- modules ---------------- */
export async function saveModule(formData: FormData) {
  const { db } = await guard();
  const id = str(formData.get('id'));

  let checklistUrl = str(formData.get('checklist_file_url'));
  const file = formData.get('checklist') as File | null;
  if (file && file.size > 0) {
    const path = `${Date.now()}-${file.name.replace(/[^\w.\-]/g, '_')}`;
    const { error } = await db.storage.from('checklists').upload(path, file, { contentType: file.type });
    if (!error) {
      checklistUrl = db.storage.from('checklists').getPublicUrl(path).data.publicUrl;
    }
  }

  let thumbUrl = str(formData.get('thumbnail_url'));
  const thumb = formData.get('thumbnail') as File | null;
  if (thumb && thumb.size > 0) {
    const path = `${Date.now()}-${thumb.name.replace(/[^\w.\-]/g, '_')}`;
    const { error } = await db.storage.from('media').upload(path, thumb, { contentType: thumb.type });
    if (!error) thumbUrl = db.storage.from('media').getPublicUrl(path).data.publicUrl;
  }

  const payload = {
    title_ar: String(formData.get('title_ar')),
    title_en: String(formData.get('title_en')),
    description_ar: str(formData.get('description_ar')),
    description_en: str(formData.get('description_en')),
    video_link: str(formData.get('video_link')),
    video_source: str(formData.get('video_source')) ?? 'drive',
    checklist_file_url: checklistUrl,
    thumbnail_url: thumbUrl,
    block: str(formData.get('block')) ?? 'foundations',
    status: str(formData.get('status')) ?? 'coming',
    duration_minutes: num(formData.get('duration_minutes')),
    is_free_preview: formData.get('is_free_preview') === 'on',
    order_index: num(formData.get('order_index')) ?? 0
  };

  if (id) await db.from('course_modules').update(payload).eq('id', id);
  else await db.from('course_modules').insert(payload);
  done();
}

export async function deleteModule(formData: FormData) {
  const { db } = await guard();
  await db.from('course_modules').delete().eq('id', String(formData.get('id')));
  done();
}


/* ---------------- STL assignments / Drive submissions ---------------- */
export async function saveAssignment(formData: FormData) {
  const { db } = await guard();
  const id = str(formData.get('id'));
  const rawTypes = String(formData.get('allowed_file_types') || '.stl')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
    .map((value) => value.startsWith('.') ? value : `.${value}`);
  const allowed = Array.from(new Set(rawTypes.length ? rawTypes : ['.stl']));
  const maxScore = num(formData.get('max_score')) ?? 100;
  if (!Number.isFinite(maxScore) || maxScore <= 0) throw new Error('invalid max score');

  const lessonId = String(formData.get('lesson_id'));
  const payload = {
    lesson_id: lessonId,
    title_ar: String(formData.get('title_ar')).trim(),
    title_en: String(formData.get('title_en')).trim(),
    description_ar: str(formData.get('description_ar')),
    description_en: str(formData.get('description_en')),
    max_score: maxScore,
    allowed_file_types: allowed,
    max_file_size_mb: num(formData.get('max_file_size_mb')),
    due_date: str(formData.get('due_date')),
    active: formData.get('active') === 'on',
    allow_resubmission: formData.get('allow_resubmission') === 'on',
    updated_at: new Date().toISOString()
  };

  if (id) {
    const { data: current } = await db.from('assignments').select('lesson_id').eq('id', id).maybeSingle();
    // A cached Drive folder belongs to the old lesson. Clear it when an admin
    // moves the task so the next upload resolves the correct Stage/Lesson path.
    await db.from('assignments').update({
      ...payload,
      ...(current && current.lesson_id !== lessonId ? { drive_folder_id: null } : {})
    }).eq('id', id);
  } else {
    await db.from('assignments').insert(payload);
  }
  done();
}

export async function deleteAssignment(formData: FormData) {
  const { db } = await guard();
  const id = String(formData.get('id'));

  /*
   * COUNT ONLY REAL SUBMISSIONS.
   *
   * This used to count every row, including `uploading` and `failed`. But
   * upload-session inserts the row BEFORE the file is uploaded, so a student
   * who merely opened the picker and abandoned it — or whose upload never
   * finalised — left a row behind forever. From that moment on the delete
   * button silently became a disable button, and no admin could tell why:
   * the submission queue filters those same two statuses out, so the task
   * looked like it had zero submissions while this count said otherwise.
   *
   * A row in either state points at no verified Drive file. There is nothing
   * to protect.
   */
  const { count } = await db
    .from('assignment_submissions')
    .select('*', { count: 'exact', head: true })
    .eq('assignment_id', id)
    .not('status', 'in', '(uploading,failed)');

  // Never delete metadata that points at a real Drive file. Disable the task
  // instead once students have actually submitted something.
  if ((count ?? 0) > 0) {
    const { error } = await db
      .from('assignments')
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw new Error(`disable failed: ${error.message}`);
    done();
    return;
  }

  /*
   * Clear the dead rows first. assignment_submissions.assignment_id is
   * ON DELETE RESTRICT, so leaving even one `failed` row behind makes the
   * delete below fail with a foreign-key violation — and that error was never
   * read, so the button did nothing at all and said nothing about it.
   */
  await db
    .from('assignment_submissions')
    .delete()
    .eq('assignment_id', id)
    .in('status', ['uploading', 'failed']);

  const { error } = await db.from('assignments').delete().eq('id', id);
  if (error) throw new Error(`delete failed: ${error.message}`);

  done();
}

export async function reviewAssignmentSubmission(formData: FormData) {
  const { db, me } = await guardReviewer();
  const id = String(formData.get('id'));
  const requestedStatus = String(formData.get('status'));
  const status = ['under_review', 'graded', 'needs_revision'].includes(requestedStatus)
    ? requestedStatus
    : 'under_review';

  const { data: submission } = await db
    .from('assignment_submissions')
    .select('id,assignment_id')
    .eq('id', id)
    .maybeSingle();
  if (!submission) throw new Error('submission not found');

  const { data: assignment } = await db
    .from('assignments')
    .select('max_score')
    .eq('id', submission.assignment_id)
    .maybeSingle();
  if (!assignment) throw new Error('assignment not found');

  const rawGrade = num(formData.get('grade'));
  const grade = rawGrade === null ? null : Number(rawGrade);
  const maxScore = Number(assignment.max_score);
  if (grade !== null && (!Number.isFinite(grade) || grade < 0 || grade > maxScore)) {
    throw new Error('grade out of range');
  }
  if (status === 'graded' && grade === null) throw new Error('grade is required');

  const now = new Date().toISOString();
  await db.from('assignment_submissions').update({
    status,
    grade: status === 'graded' ? grade : null,
    admin_feedback: str(formData.get('admin_feedback')),
    graded_at: status === 'graded' ? now : null,
    graded_by: me.id,
    updated_at: now
  }).eq('id', id);
  done();
}

/* ---------------- case file QC ---------------- */
export async function reviewCaseFile(formData: FormData) {
  const { db, me: admin } = await guardReviewer();
  await db.from('case_file_submissions').update({
    reviewer_notes: str(formData.get('reviewer_notes')),
    reviewed_by: admin.full_name || admin.email,
    status: 'reviewed',
    reviewed_at: new Date().toISOString()
  }).eq('id', String(formData.get('id')));
  done();
}

/* ---------------- production partner requests ---------------- */
export async function updateRequest(formData: FormData) {
  const { db } = await guard();
  await db.from('production_partner_requests').update({
    status: String(formData.get('status')),
    agreed_price: num(formData.get('agreed_price')),
    agreed_currency: str(formData.get('agreed_currency')),
    admin_notes: str(formData.get('admin_notes'))
  }).eq('id', String(formData.get('id')));
  done();
}

/** Manual enrolment after the call: grants access and takes one of the 3 seats. */
export async function grantProductionPartner(formData: FormData) {
  const { db } = await guard();
  const userId = str(formData.get('user_id'));
  if (!userId) throw new Error('no_user');

  const { data: tier } = await db.from('tiers').select('*').eq('slug', 'production_partner').single();
  if (!tier) throw new Error('no_tier');
  if (tier.max_seats !== null && tier.current_seats_taken >= tier.max_seats) throw new Error('no_seats_left');

  await db.from('profiles').update({ tier_id: tier.id, has_access: true }).eq('id', userId);
  await db.from('tiers').update({ current_seats_taken: (tier.current_seats_taken ?? 0) + 1 }).eq('id', tier.id);

  const price = num(formData.get('agreed_price'));
  if (price !== null) {
    await db.from('payments').insert({
      user_id: userId, tier_id: tier.id, amount: price,
      currency: str(formData.get('agreed_currency')) ?? 'EGP',
      status: 'paid', payment_method: 'manual', paid_at: new Date().toISOString()
    });
  }

  await db.from('production_partner_requests').update({ status: 'approved' }).eq('id', String(formData.get('id')));
  done();
}

/* ---------------- live sessions ---------------- */
export async function saveSession(formData: FormData) {
  const { db } = await guard();
  const id = str(formData.get('id'));
  const payload = {
    title_ar: String(formData.get('title_ar')),
    title_en: String(formData.get('title_en')),
    scheduled_at: String(formData.get('scheduled_at')),
    join_link: str(formData.get('join_link')),
    recording_link: str(formData.get('recording_link')),
    min_tier_order: num(formData.get('min_tier_order')) ?? 2
  };
  if (id) await db.from('live_sessions').update(payload).eq('id', id);
  else await db.from('live_sessions').insert(payload);
  done();
}

export async function deleteSession(formData: FormData) {
  const { db } = await guard();
  await db.from('live_sessions').delete().eq('id', String(formData.get('id')));
  done();
}

/* ---------------- community ---------------- */
export async function saveCommunity(formData: FormData) {
  const { db } = await guard();
  await db.from('community_settings').upsert({
    id: 1,
    whatsapp_group_link: str(formData.get('whatsapp_group_link')),
    min_tier_order: num(formData.get('min_tier_order')) ?? 2
  });
  done();
}

/* ---------------- promo codes ---------------- */
export async function savePromo(formData: FormData) {
  const { db } = await guard();
  const id = str(formData.get('id'));
  const tiers = formData.getAll('applicable_tiers').map(String).filter(Boolean);
  const payload = {
    code: String(formData.get('code')).trim().toUpperCase(),
    discount_type: String(formData.get('discount_type')),
    discount_value: num(formData.get('discount_value')) ?? 0,
    applicable_tiers: tiers.length ? tiers : null,
    is_active: formData.get('is_active') === 'on',
    max_uses: num(formData.get('max_uses')),
    expires_at: str(formData.get('expires_at'))
  };
  if (id) await db.from('promo_codes').update(payload).eq('id', id);
  else await db.from('promo_codes').insert(payload);
  done();
}

export async function deletePromo(formData: FormData) {
  const { db } = await guard();
  await db.from('promo_codes').delete().eq('id', String(formData.get('id')));
  done();
}

/* ---------------- site settings ---------------- */
export async function saveSettings(formData: FormData) {
  const { db } = await guard();

  let imageUrl = str(formData.get('landing_image_url'));
  const file = formData.get('landing_image') as File | null;
  if (file && file.size > 0) {
    const path = `${Date.now()}-${file.name.replace(/[^\w.\-]/g, '_')}`;
    const { error } = await db.storage.from('landing').upload(path, file, { contentType: file.type });
    if (!error) imageUrl = db.storage.from('landing').getPublicUrl(path).data.publicUrl;
  }

  await db.from('site_settings').upsert({
    id: 1,
    landing_title_ar: String(formData.get('landing_title_ar')),
    landing_title_en: String(formData.get('landing_title_en')),
    landing_description_ar: str(formData.get('landing_description_ar')),
    landing_description_en: str(formData.get('landing_description_en')),
    landing_image_url: imageUrl,
    hero_kicker_ar: str(formData.get('hero_kicker_ar')),
    hero_kicker_en: str(formData.get('hero_kicker_en')),
    hero_headline_ar: str(formData.get('hero_headline_ar')),
    hero_headline_en: str(formData.get('hero_headline_en')),
    hero_subhead_ar: str(formData.get('hero_subhead_ar')),
    hero_subhead_en: str(formData.get('hero_subhead_en')),
    cta_primary_ar: str(formData.get('cta_primary_ar')),
    cta_primary_en: str(formData.get('cta_primary_en')),
    whatsapp_number: str(formData.get('whatsapp_number')),
    instagram_url: str(formData.get('instagram_url')),
    youtube_url: str(formData.get('youtube_url'))
  });
  done();
}

/** Signed URL so an admin can open a private case file. */
export async function signCaseFile(path: string) {
  const { db } = await guardReviewer();
  const { data } = await db.storage.from('case-files').createSignedUrl(path, 60 * 10);
  return data?.signedUrl ?? null;
}
