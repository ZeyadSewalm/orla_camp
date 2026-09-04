'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, CheckCircle2, FileUp, RotateCcw, Star } from 'lucide-react';
import type { Assignment, AssignmentSubmission } from '@/lib/types';

type UploadState = 'idle' | 'preparing' | 'uploading' | 'finalizing' | 'done' | 'error';

function prettyBytes(bytes: number, locale: string) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';
  const mb = bytes / 1024 / 1024;
  return new Intl.NumberFormat(locale === 'ar' ? 'ar-EG-u-nu-latn' : 'en-US', {
    maximumFractionDigits: mb < 10 ? 1 : 0
  }).format(mb) + ' MB';
}

function statusLabel(status: AssignmentSubmission['status'], ar: boolean) {
  const map = ar
    ? {
        uploading: 'جاري الرفع', submitted: 'تم التسليم', under_review: 'قيد المراجعة', graded: 'تم التقييم',
        needs_revision: 'يحتاج تعديل', resubmitted: 'تمت إعادة التسليم', failed: 'لم يكتمل الرفع'
      }
    : {
        uploading: 'Uploading', submitted: 'Submitted', under_review: 'Under review', graded: 'Graded',
        needs_revision: 'Needs revision', resubmitted: 'Resubmitted', failed: 'Upload incomplete'
      };
  return map[status];
}

function accepted(allowed: string[]) {
  return allowed.map((x) => x.startsWith('.') ? x : `.${x}`).join(',');
}

async function queryUploadedOffset(sessionUrl: string, total: number) {
  try {
    const response = await fetch(sessionUrl, {
      method: 'PUT',
      headers: { 'Content-Range': `bytes */${total}` },
      body: new Blob([])
    });
    if (response.ok) {
      const data = await response.json().catch(() => null) as { id?: string } | null;
      return { offset: total, fileId: data?.id ?? null };
    }
    if (response.status !== 308) return null;
    const range = response.headers.get('Range') || response.headers.get('range');
    if (!range) return { offset: 0, fileId: null };
    const match = range.match(/bytes=0-(\d+)/i);
    return { offset: match ? Number(match[1]) + 1 : 0, fileId: null };
  } catch {
    return null;
  }
}

async function uploadInChunks(args: {
  file: File;
  sessionUrl: string;
  chunkSize: number;
  onProgress: (value: number) => void;
}) {
  const { file, sessionUrl } = args;
  // Google requires non-final chunks to be a multiple of 256 KiB. 8 MiB is
  // large enough to be efficient and small enough that a retry is cheap.
  const chunkSize = Math.max(256 * 1024, Math.floor(args.chunkSize / (256 * 1024)) * 256 * 1024);
  let start = 0;
  let lastMetadata: { id?: string } | null = null;

  while (start < file.size) {
    const end = Math.min(start + chunkSize, file.size);
    const chunk = file.slice(start, end);
    let completed = false;
    let attempts = 0;

    while (!completed && attempts < 4) {
      attempts += 1;
      try {
        const response = await fetch(sessionUrl, {
          method: 'PUT',
          headers: { 'Content-Range': `bytes ${start}-${end - 1}/${file.size}` },
          body: chunk
        });

        if (response.status === 308) {
          const range = response.headers.get('Range') || response.headers.get('range');
          const match = range?.match(/bytes=0-(\d+)/i);
          start = match ? Number(match[1]) + 1 : end;
          completed = true;
          args.onProgress(Math.min(99, Math.round((start / file.size) * 100)));
          continue;
        }

        if (response.ok) {
          lastMetadata = await response.json().catch(() => null) as { id?: string } | null;
          start = file.size;
          completed = true;
          args.onProgress(100);
          continue;
        }

        if (response.status >= 500 || response.status === 429) throw new Error('retryable');
        throw new Error(`upload_${response.status}`);
      } catch (error) {
        if (attempts >= 4) throw error;
        const status = await queryUploadedOffset(sessionUrl, file.size);
        if (status) {
          if (status.fileId) {
            lastMetadata = { id: status.fileId };
            start = file.size;
            completed = true;
            args.onProgress(100);
          } else {
            const previousStart = start;
            start = Math.max(0, status.offset);
            // If Drive accepted any bytes, leave the inner retry loop so the
            // outer loop can slice a fresh chunk from the confirmed offset.
            if (start !== previousStart || start >= end) completed = true;
            args.onProgress(Math.min(99, Math.round((start / file.size) * 100)));
          }
        }
        if (!completed) await new Promise((resolve) => setTimeout(resolve, 600 * attempts));
      }
    }
  }

  // The final Google response can be lost even after the file is committed.
  // In that case the server can recover the Drive file by the submission id
  // stored in appProperties, so a missing id here is not treated as failure.
  return lastMetadata?.id ?? null;
}

export default function AssignmentTask({
  assignment,
  latestSubmission,
  locale
}: {
  assignment: Assignment;
  latestSubmission: AssignmentSubmission | null;
  locale: string;
}) {
  const ar = locale === 'ar';
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<UploadState>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');

  const title = ar ? assignment.title_ar : assignment.title_en;
  const description = ar ? assignment.description_ar : assignment.description_en;
  const pending = latestSubmission && ['submitted', 'resubmitted', 'under_review'].includes(latestSubmission.status);
  const canUpload = !pending && (!latestSubmission || assignment.allow_resubmission || ['failed', 'uploading', 'needs_revision'].includes(latestSubmission.status));
  const due = assignment.due_date
    ? new Intl.DateTimeFormat(ar ? 'ar-EG-u-nu-latn' : 'en-GB', { dateStyle: 'medium' }).format(new Date(assignment.due_date))
    : null;

  async function onFile(file: File) {
    setError('');
    setProgress(0);
    setState('preparing');
    try {
      const begin = await fetch('/api/tasks/upload-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assignmentId: assignment.id,
          originalFilename: file.name,
          fileSize: file.size,
          contentType: file.type || 'application/octet-stream'
        })
      });
      const beginData = await begin.json();
      if (!begin.ok) {
        if (beginData.error === 'file_type_not_allowed') throw new Error(ar ? 'نوع الملف غير مسموح لهذه المهمة.' : 'This file type is not allowed for this task.');
        if (beginData.error === 'file_too_large') throw new Error(ar ? `حجم الملف أكبر من الحد المسموح (${beginData.maxMb} MB).` : `The file is larger than the allowed limit (${beginData.maxMb} MB).`);
        if (beginData.error === 'submission_already_pending') throw new Error(ar ? 'لديك ملف قيد المراجعة بالفعل.' : 'You already have a submission waiting for review.');
        if (beginData.error === 'drive_not_configured') throw new Error(ar ? 'رفع ملفات المهام لم يتم تفعيله بعد.' : 'Task uploads are not configured yet.');
        throw new Error(ar ? 'تعذر بدء الرفع. حاول مرة أخرى.' : 'Could not start the upload. Try again.');
      }

      setState('uploading');
      const driveFileId = await uploadInChunks({
        file,
        sessionUrl: beginData.sessionUrl,
        chunkSize: Number(beginData.chunkSize) || 8 * 1024 * 1024,
        onProgress: setProgress
      });

      setState('finalizing');
      let finalized = false;
      for (let attempt = 0; attempt < 3 && !finalized; attempt += 1) {
        /*
         * The fetch itself is inside the try, not just its response.
         *
         * The retry loop only handled a bad STATUS. If `fetch` REJECTED — a
         * dropped connection, a killed serverless function, a phone switching
         * from wifi to 4G — the TypeError escaped the loop entirely and the
         * whole upload was reported as failed after a single blip, even though
         * the file was already in Drive and one more attempt would have
         * finished the job. That is the worst possible moment to give up: the
         * expensive part is done.
         */
        let finish: Response;
        try {
          finish = await fetch('/api/tasks/complete-upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ submissionId: beginData.submissionId, driveFileId })
          });
        } catch {
          if (attempt === 2) {
            throw new Error(
              ar
                ? 'اكتمل رفع الملف إلى Drive، لكن انقطع الاتصال قبل تسجيل التسليم. اضغط رفع مرة أخرى، ولن يُرفع الملف من جديد.'
                : 'The file finished uploading to Drive, but the connection dropped before the submission was recorded. Press upload again. The file will not be re-uploaded.'
            );
          }
          await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
          continue;
        }

        if (finish.ok) {
          finalized = true;
          break;
        }
        const detail = await finish.json().catch(() => null) as { error?: string } | null;
        const retryable = finish.status >= 500 || finish.status === 504 || detail?.error === 'drive_file_not_ready';
        if (!retryable || attempt === 2) {
          throw new Error(ar ? 'اكتمل رفع الملف لكن تعذر تسجيل التسليم. أعد المحاولة.' : 'The file uploaded but the submission could not be finalized. Please retry.');
        }
        await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
      }
      if (!finalized) throw new Error(ar ? 'تعذر تسجيل التسليم.' : 'Could not finalize the submission.');

      setState('done');
      router.refresh();
    } catch (err) {
      setState('error');
      // "Failed to fetch" is the browser's own wording for a dropped
      // connection. Shown raw it tells a dental student nothing at all.
      const raw = err instanceof Error ? err.message : '';
      const isNetwork = /failed to fetch|networkerror|load failed/i.test(raw);
      setError(
        isNetwork
          ? (ar
              ? 'انقطع الاتصال أثناء الرفع. تحقّق من الإنترنت واضغط رفع مرة أخرى.'
              : 'The connection dropped during upload. Check your internet and press upload again.')
          : raw || (ar ? 'حدث خطأ أثناء الرفع.' : 'Upload failed.')
      );
    } finally {
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <section className="mt-5 overflow-hidden rounded-2xl border border-brass/20 bg-brass/[0.035]">
      <div className="flex flex-wrap items-start justify-between gap-4 p-4 sm:p-5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brass px-2.5 py-1 text-xs font-semibold text-white">
              <FileUp aria-hidden className="h-3.5 w-3.5" />
              {ar ? 'مهمة STL' : 'STL Task'}
            </span>
            {latestSubmission && (
              <span className="rounded-full border border-ink/10 bg-white px-2.5 py-1 text-xs text-steel">
                {statusLabel(latestSubmission.status, ar)}
              </span>
            )}
          </div>
          <h4 className="mt-3 font-display text-base font-black text-ink sm:text-lg">{title}</h4>
          {description && <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-steel">{description}</p>}
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-steel">
            <span>{ar ? 'الملفات:' : 'Files:'} {assignment.allowed_file_types.join(', ')}</span>
            <span>{ar ? 'الدرجة:' : 'Score:'} {assignment.max_score}</span>
            {assignment.max_file_size_mb && <span>{ar ? 'الحد الأقصى:' : 'Max:'} {assignment.max_file_size_mb} MB</span>}
            {due && <span>{ar ? 'الموعد:' : 'Due:'} {due}</span>}
          </div>
        </div>

        {latestSubmission?.status === 'graded' && latestSubmission.grade !== null && (
          <div className="shrink-0 rounded-2xl bg-white px-4 py-3 text-center shadow-sm">
            <div className="flex items-center justify-center gap-1 text-brass"><Star className="h-4 w-4" /><span className="label !mb-0">{ar ? 'النتيجة' : 'Score'}</span></div>
            <p dir="ltr" className="figure mt-1 text-lg font-medium text-ink">{latestSubmission.grade} / {assignment.max_score}</p>
          </div>
        )}
      </div>

      {latestSubmission?.admin_feedback && (
        <div className="border-t border-brass/15 bg-white/70 px-4 py-3 sm:px-5">
          <p className="text-xs font-semibold text-brass">{ar ? 'ملاحظات المدرب' : 'Instructor feedback'}</p>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-ink">{latestSubmission.admin_feedback}</p>
        </div>
      )}

      <div className="border-t border-brass/15 px-4 py-4 sm:px-5">
        {(state === 'preparing' || state === 'uploading' || state === 'finalizing') ? (
          <div>
            <div className="flex items-center justify-between gap-3 text-xs text-steel">
              <span>{state === 'preparing' ? (ar ? 'تجهيز الرفع…' : 'Preparing upload…') : state === 'finalizing' ? (ar ? 'تسجيل التسليم…' : 'Finalizing submission…') : (ar ? 'يرفع مباشرة إلى Google Drive…' : 'Uploading directly to Google Drive…')}</span>
              <span dir="ltr" className="figure text-ink">{progress}%</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-ink/10"><div className="h-full rounded-full bg-brass transition-[width]" style={{ width: `${progress}%` }} /></div>
            <p className="mt-2 text-[0.7rem] text-steel">{ar ? 'يمكن للنظام إعادة محاولة الجزء الذي انقطع بدل إعادة الملف كله.' : 'Interrupted chunks are retried without restarting the whole file.'}</p>
          </div>
        ) : state === 'done' ? (
          <p className="flex items-center gap-2 text-sm font-semibold text-brass"><CheckCircle2 className="h-4 w-4" />{ar ? 'تم تسليم ملفك بنجاح.' : 'Your file was submitted successfully.'}</p>
        ) : pending ? (
          <p className="flex items-center gap-2 text-sm text-steel"><CheckCircle2 className="h-4 w-4 text-brass" />{ar ? 'ملفك وصل وهو الآن في طابور المراجعة.' : 'Your file is received and in the review queue.'}</p>
        ) : canUpload ? (
          <div className="flex flex-wrap items-center gap-3">
            <label className="btn-primary cursor-pointer">
              <input
                ref={inputRef}
                type="file"
                accept={accepted(assignment.allowed_file_types)}
                className="sr-only"
                onChange={(event) => event.target.files?.[0] && onFile(event.target.files[0])}
              />
              {latestSubmission?.status === 'needs_revision' ? <RotateCcw aria-hidden className="h-4 w-4" /> : <FileUp aria-hidden className="h-4 w-4" />}
              {latestSubmission ? (ar ? 'رفع نسخة معدلة' : 'Upload revision') : (ar ? 'رفع ملف STL' : 'Upload STL')}
            </label>
          </div>
        ) : (
          <p className="text-sm text-steel">{ar ? 'لا توجد إعادة تسليم متاحة لهذه المهمة.' : 'Resubmission is not available for this task.'}</p>
        )}

        {state === 'error' && error && (
          <p role="alert" className="mt-3 flex items-start gap-2 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">
            <AlertCircle aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />{error}
          </p>
        )}
        {latestSubmission && latestSubmission.file_size > 0 && (
          <p className="mt-3 text-[0.7rem] text-steel">{ar ? 'آخر ملف:' : 'Latest file:'} {latestSubmission.original_filename} · {prettyBytes(Number(latestSubmission.file_size), locale)}</p>
        )}
      </div>
    </section>
  );
}
