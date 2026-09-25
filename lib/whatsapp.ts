import type { SupabaseClient } from '@supabase/supabase-js';
import { normaliseEgyptianMobile } from '@/lib/phone';

/**
 * Tells the n8n "Grade Notification - WhatsApp" workflow that a case was graded.
 *
 * THE CONTRACT
 *
 * The workflow starts with a Webhook node and reads a single FLAT body — one
 * event per request, `{{ $json.body.phone }}` and so on. The payload below
 * matches its input schema field for field: event_type, submission_id,
 * student_id, student_name, phone, grade, score, reviewed_at, message.
 *
 * An earlier daily cron posted `{ items: [...] }` — a batch. The workflow has
 * no Split Out node, so it would have read `body.phone` off the batch wrapper,
 * found nothing, and sent nothing. That cron is gone; grading now notifies at
 * the moment it happens.
 *
 * THIS NEVER THROWS
 *
 * Grading is the action the reviewer asked for. A WhatsApp failure — n8n down,
 * a template not yet approved, a malformed number — must not undo a saved
 * grade or show the reviewer an error for something they did not do. Every
 * outcome is returned and logged instead.
 */

export type GradeNotification = {
  submissionId: string;
  studentId: string;
  grade: number;
  maxScore: number;
  gradedAt: string;
};

type Outcome =
  | { sent: true }
  | { sent: false; reason: string };

export async function notifyCaseGraded(db: SupabaseClient, event: GradeNotification): Promise<Outcome> {
  const url = process.env.N8N_WHATSAPP_WEBHOOK_URL;
  if (!url) return { sent: false, reason: 'N8N_WHATSAPP_WEBHOOK_URL not set' };

  /*
   * ONE MESSAGE PER GRADED SUBMISSION.
   *
   * A reviewer who re-opens a graded submission to correct a typo should not
   * text the student a second time. Migration 018's unique index guarantees
   * this at the database level; checking first here also avoids calling n8n —
   * and spending a paid message — only to have the log insert rejected after.
   */
  const { data: already } = await db
    .from('whatsapp_message_log')
    .select('id')
    .eq('user_id', event.studentId)
    .eq('message_type', 'case_graded')
    .eq('entity_id', event.submissionId)
    .maybeSingle();
  if (already) return { sent: false, reason: 'already notified' };

  const { data: student } = await db
    .from('profiles')
    .select('full_name, phone')
    .eq('id', event.studentId)
    .maybeSingle();

  const phone = normaliseEgyptianMobile(student?.phone);
  if (!phone) return { sent: false, reason: 'no valid Egyptian mobile on file' };

  const name = student?.full_name?.trim() || 'there';
  const payload = {
    event_type: 'case_graded',
    submission_id: event.submissionId,
    student_id: event.studentId,
    student_name: name,
    phone,
    grade: event.grade,
    // `score` is sent as the maximum, so a template can render "85 / 100".
    score: event.maxScore,
    reviewed_at: event.gradedAt,
    message: `Hi ${name}, your case has been graded: ${event.grade}/${event.maxScore}. Open your profile to see the full breakdown.`
  };

  /*
   * The webhook sends messages from OrlaDent's verified business number. Left
   * unauthenticated, anyone who finds the URL could send WhatsApp messages as
   * OrlaDent to any number — the fastest way to get that number banned. This
   * header is checked by the Webhook node's Header Auth.
   */
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  const secret = process.env.N8N_WEBHOOK_SECRET;
  if (secret) headers['x-orladent-secret'] = secret;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      // Grading waits on this. A hung n8n must not freeze the review form.
      signal: AbortSignal.timeout(8000)
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      /*
       * A failure is NOT written to the log. Migration 018's unique index
       * covers (user_id, message_type, entity_id) regardless of status, so a
       * 'failed' row would permanently block this submission from ever being
       * notified — the next grading would find it and skip. Leaving no row
       * means correcting the problem (approving the template, fixing n8n) and
       * re-saving the grade actually sends it.
       */
      const reason = `n8n responded ${response.status}${text ? `: ${text.slice(0, 200)}` : ''}`;
      console.error('[whatsapp] grade notification rejected:', reason);
      return { sent: false, reason };
    }

    await log(db, event, phone, payload);
    return { sent: true };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown error';
    console.error('[whatsapp] grade notification failed:', reason);
    // Deliberately NOT logged as sent: a timeout may or may not have delivered,
    // and recording it would block a retry from the next grading.
    return { sent: false, reason };
  }
}

/** Records a DELIVERED notification. Only successes are logged — see above. */
async function log(
  db: SupabaseClient,
  event: GradeNotification,
  phone: string,
  payload: Record<string, unknown>
) {
  const { error } = await db.from('whatsapp_message_log').insert({
    user_id: event.studentId,
    message_type: 'case_graded',
    entity_id: event.submissionId,
    status: 'sent',
    provider: 'n8n',
    payload: { phone, ...payload }
  });
  // A duplicate here means another request got there first — the unique index
  // doing its job, not an error worth surfacing.
  if (error && !/duplicate key/i.test(error.message)) {
    console.error('[whatsapp] log insert failed:', error.message);
  }
}
