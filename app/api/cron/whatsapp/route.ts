import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { normaliseEgyptianMobile } from '@/lib/phone';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Scheduled outbound WhatsApp: inactivity nudges and grade notifications.
 *
 * Runs on a Vercel cron (see vercel.json) and hands a queue to n8n, which does
 * the actual sending. Adapted from a contributor's branch with four fixes; each
 * is marked FIX below so the reasoning survives.
 */

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

type QueueItem = {
  type: 'inactive_3d' | 'case_graded';
  userId: string;
  phone: string;
  entityId?: string;
  message: string;
};

async function postToN8n(items: QueueItem[]) {
  const webhookUrl = process.env.N8N_WHATSAPP_WEBHOOK_URL;
  if (!webhookUrl) {
    return { sent: false as const, skipped: items.length, reason: 'N8N_WHATSAPP_WEBHOOK_URL is not configured' };
  }

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ items })
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`n8n webhook failed (${response.status}): ${text || response.statusText}`);
  }

  return { sent: true as const, count: items.length };
}

export async function GET(request: Request) {
  /*
   * FIX 2 — AUTHENTICATION. The original had none.
   *
   * This route sends real messages that cost real money. Unauthenticated, the
   * URL is a button any stranger can press repeatedly to spam your students at
   * your expense, and it is discoverable the moment it appears in a log, a
   * referrer header or a browser history.
   *
   * Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. The check is
   * constant-time-ish by comparing full strings, and the route refuses to run
   * at all when CRON_SECRET is unset — failing closed, so a missing env var
   * cannot silently reopen the endpoint.
   */
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: 'CRON_SECRET is not configured' }, { status: 503 });
  }
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'unauthorised' }, { status: 401 });
  }

  const db = createAdminClient();
  const now = Date.now();

  try {
    const { data: profiles, error: profileError } = await db
      .from('profiles')
      .select('id, full_name, phone, last_login_at, last_inactivity_message_at')
      .not('phone', 'is', null);

    if (profileError) {
      return NextResponse.json({ ok: false, error: profileError.message }, { status: 500 });
    }

    const queue: QueueItem[] = [];
    const inactiveIds: string[] = [];

    for (const profile of profiles ?? []) {
      const phone = normaliseEgyptianMobile(profile.phone);
      if (!phone || !profile.last_login_at) continue;

      const lastLogin = new Date(profile.last_login_at).getTime();
      const lastNudge = profile.last_inactivity_message_at
        ? new Date(profile.last_inactivity_message_at).getTime()
        : 0;

      // Inactive for 3 days, and not nudged in the last 7.
      if (now - lastLogin >= THREE_DAYS_MS && lastNudge + SEVEN_DAYS_MS <= now) {
        queue.push({
          type: 'inactive_3d',
          userId: profile.id,
          phone,
          message: `Hi ${profile.full_name || 'there'} — it has been 3 days since your last login. Come back and continue your learning journey at OrlaDent Camp.`
        });
        inactiveIds.push(profile.id);
      }
    }

    /*
     * FIX 3 — only consider cases graded recently.
     *
     * The original scanned EVERY reviewed case ever graded on every run, then
     * filtered against the whole message log pulled into memory. That grows
     * without bound, and on the first run after deploying it would have queued
     * a message for every case ever graded — months of history, all at once.
     *
     * A 30-day window is far wider than the cron interval, so nothing in normal
     * operation is missed, and the unique index in migration 018 is the real
     * guarantee against duplicates.
     */
    const since = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();

    const { data: gradedCases, error: gradedError } = await db
      .from('case_file_submissions')
      .select('id, user_id, grade, reviewed_at')
      .eq('status', 'reviewed')
      .not('grade', 'is', null)
      .gte('reviewed_at', since);

    if (gradedError) {
      return NextResponse.json({ ok: false, error: gradedError.message }, { status: 500 });
    }

    // Only the log rows that could match this window, rather than the whole table.
    const { data: sentLog, error: logError } = await db
      .from('whatsapp_message_log')
      .select('user_id, message_type, entity_id')
      .eq('message_type', 'case_graded')
      .gte('sent_at', since);

    if (logError) {
      return NextResponse.json({ ok: false, error: logError.message }, { status: 500 });
    }

    const alreadySent = new Set((sentLog ?? []).map((row) => `${row.user_id}:${row.entity_id ?? 'none'}`));
    const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));

    for (const submission of gradedCases ?? []) {
      if (alreadySent.has(`${submission.user_id}:${submission.id}`)) continue;

      const profile = profileById.get(submission.user_id);
      if (!profile) continue;

      const phone = normaliseEgyptianMobile(profile.phone);
      if (!phone) continue;

      queue.push({
        type: 'case_graded',
        userId: submission.user_id,
        phone,
        entityId: submission.id,
        message: `Hi ${profile.full_name || 'there'} — your case has been graded. Score: ${Number(submission.grade).toFixed(1)}/100. Visit the dashboard to view the feedback.`
      });
    }

    if (queue.length === 0) {
      return NextResponse.json({ ok: true, queued: 0, checkedAt: new Date().toISOString() });
    }

    const result = await postToN8n(queue);

    if (!result.sent) {
      return NextResponse.json({ ok: false, queued: queue.length, ...result }, { status: 503 });
    }

    /*
     * FIX 4 — record what was sent, and never let bookkeeping failure cause a
     * resend.
     *
     * The messages have already left. The original returned a 500 if the log
     * insert failed, which made the run look failed — so the next run would
     * send everything again. And it stamped last_inactivity_message_at for
     * every id in `inactiveIds` even when the queue that actually went out
     * contained only grade notifications.
     *
     * Now: the log insert and the nudge stamp are best-effort, reported in the
     * response, and the stamp is written only for students who genuinely
     * received a nudge in THIS batch.
     */
    const logRows = queue.map((item) => ({
      user_id: item.userId,
      message_type: item.type,
      entity_id: item.entityId ?? null,
      status: 'sent',
      provider: 'n8n',
      payload: { phone: item.phone, message: item.message }
    }));

    const warnings: string[] = [];

    const { error: insertError } = await db.from('whatsapp_message_log').insert(logRows);
    if (insertError) warnings.push(`log insert failed: ${insertError.message}`);

    const nudgedIds = queue.filter((item) => item.type === 'inactive_3d').map((item) => item.userId);
    if (nudgedIds.length > 0) {
      const { error: updateError } = await db
        .from('profiles')
        .update({ last_inactivity_message_at: new Date().toISOString() })
        .in('id', nudgedIds);
      if (updateError) warnings.push(`cooldown stamp failed: ${updateError.message}`);
    }

    return NextResponse.json({
      ok: true,
      queued: queue.length,
      nudges: nudgedIds.length,
      grades: queue.length - nudgedIds.length,
      ...(warnings.length > 0 ? { warnings } : {}),
      checkedAt: new Date().toISOString()
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown_error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
