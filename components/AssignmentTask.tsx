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

/** Empty list = any file type, so the picker shows everything. */
function accepted(allowed: string[]) {
  if (!allowed || allowed.length === 0) return undefined;
  return allowed.map((x) => x.startsWith('.') ? x : `.${x}`).join(',');
}

/*
 * THE BROWSER NO LONGER TALKS TO DRIVE.
 *
 * Every byte used to go straight from here to the Drive resumable session.
 * That session is opened server-side with no Origin, and Google rejects
 * cross-origin browser requests to a session opened that way — at the CORS
 * layer, which fetch() reports as a bare network error. Students saw "the
 * connection dropped" on a connection that was fine.
 *
 * Chunks now go to /api/tasks/upload-chunk on this site, which forwards them
 * to Drive server-to-server. The resume logic is unchanged; only the address
 * each request is sent to moved.
 */
const CHUNK_ROUTE = '/api/tasks/upload-chunk';

type ChunkReply =
  | { status: 308; nextOffset: number }
  | { status: 200; fileId: string | null }
  | { error: string; status?: number };

async function sendChunk(submissionId: string, range: string, body: Blob) {
  const response = await fetch(`${CHUNK_ROUTE}?submissionId=${encodeURIComponent(submissionId)}`, {
    method: 'POST',
    headers: { 'x-content-range': range, 'Content-Type': 'application/octet-stream' },
    body
  });
  const data = (await response.json().catch(() => ({ error: 'bad_reply' }))) as ChunkReply;
  return { httpStatus: response.status, data };
}

/** Asks Drive, via the proxy, how much of the file it already holds. */
async function queryUploadedOffset(submissionId: string, total: number) {
  try {
    const { data } = await sendChunk(submissionId, `bytes */${total}`, new Blob([]));
    if ('status' in data && data.status === 200) return { offset: total, fileId: (data as { fileId: string | null }).fileId };
    if ('status' in data && data.status === 308) return { offset: (data as { nextOffset: number }).nextOffset, fileId: null };
    return null;
  } catch {
    return null;
  }
}

async function uploadInChunks(args: {
  file: File;
  submissionId: string;
  chunkSize: number;
  onProgress: (value: number) => void;
}) {
  const { file, submissionId } = args;
  // Drive requires non-final chunks to be a multiple of 256 KiB, and the proxy
  // hop caps a request at 4 MiB. Clamp to both, whatever the server suggested.
  const quantum = 256 * 1024;
  const ceiling = 4 * 1024 * 1024;
  const chunkSize = Math.max(quantum, Math.min(ceiling, Math.floor(args.chunkSize / quantum) * quantum));
  let start = 0;
  let fileId: string | null = null;

  while (start < file.size) {
    const end = Math.min(start + chunkSize, file.size);
    const chunk = file.slice(start, end);
    let completed = false;
    let attempts = 0;

    while (!completed && attempts < 4) {
      attempts += 1;
      try {
        const { httpStatus, data } = await sendChunk(submissionId, `bytes ${start}-${end - 1}/${file.size}`, chunk);

        if ('status' in data && data.status === 308) {
          // Trust Drive's own account of what it holds, not our arithmetic.
          start = (data as { nextOffset: number }).nextOffset || end;
          completed = true;
          args.onProgress(Math.min(99, Math.round((start / file.size) * 100)));
          continue;
        }
        if ('status' in data && data.status === 200) {
          fileId = (data as { fileId: string | null }).fileId;
          start = file.size;
          completed = true;
          args.onProgress(100);
          continue;
        }

        // 503 from the proxy = Drive unreachable or busy: worth retrying.
        // Anything else (the session expired, the row is no longer uploading)
        // will not fix itself on a retry.
        if (httpStatus === 503) throw new Error('retryable');
        throw Object.assign(new Error(`upload_${(data as { error?: string }).error ?? httpStatus}`), { final: true });
      } catch (error) {
        if ((error as { final?: boolean }).final || attempts >= 4) throw error;
        const status = await queryUploadedOffset(submissionId, file.size);
        if (status) {
          if (status.fileId) {
            fileId = status.fileId;
            start = file.size;
            completed = true;
            args.onProgress(100);
          } else {
            const previousStart = start;
            start = Math.max(0, status.offset);
            if (start !== previousStart || start >= end) completed = true;
            args.onProgress(Math.min(99, Math.round((start / file.size) * 100)));
          }
        }
        if (!completed) await new Promise((resolve) => setTimeout(resolve, 600 * attempts));
      }
    }
    if (!completed) throw new Error('upload_stalled');
  }

  // The final reply can be lost after Drive has committed the file. The server
  // recovers it from the submission id stored in appProperties, so a missing
  // id here is not a failure.
  return fileId;
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
        submissionId: beginData.submissionId,
        chunkSize: Number(beginData.chunkSize) || 4 * 1024 * 1024,
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
      /*
       * Say what actually happened. Every failure used to read "the connection
       * dropped", including ones the connection had nothing to do with — which
       * is exactly how a server-side Drive problem hid behind a message telling
       * students to check their wifi.
       */
      const expired = /upload_not_uploading|upload_drive_rejected/.test(raw);
      const stalled = /upload_stalled|retryable/.test(raw);
      setError(
        isNetwork
          ? (ar
              ? 'انقطع الاتصال أثناء الرفع. تحقّق من الإنترنت واضغط رفع مرة أخرى.'
              : 'The connection dropped during upload. Check your internet and press upload again.')
          : expired
            ? (ar
                ? 'انتهت صلاحية جلسة الرفع. اضغط رفع لتبدأ من جديد.'
                : 'The upload session expired. Press upload to start again.')
            : stalled
              ? (ar
                  ? 'تعذّر الوصول إلى Google Drive الآن. انتظر دقيقة ثم اضغط رفع مرة أخرى.'
                  : "Google Drive isn't responding right now. Wait a minute and press upload again.")
              // Messages thrown earlier in this function — wrong file type,
              // file too large, already pending — are written for the student
              // and must reach them verbatim. Only internal codes ("upload_…")
              // are swapped for a generic line.
              : raw && !raw.startsWith('upload_')
                ? raw
                : (ar ? 'حدث خطأ أثناء الرفع. حاول مرة أخرى.' : 'The upload failed. Please try again.')
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
            <span>{ar ? 'الملفات:' : 'Files:'}{' '}
              {assignment.allowed_file_types?.length
                ? assignment.allowed_file_types.join(', ')
                : (ar ? 'أي نوع' : 'any type')}</span>
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
