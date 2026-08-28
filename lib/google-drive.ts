/**
 * Google Drive helpers for private STL task storage through a Google Apps
 * Script bridge. No Google Cloud OAuth client is required in the Next.js app.
 *
 * The bridge runs as the dedicated Drive owner, creates resumable upload
 * sessions, and verifies completed files. Students only receive the short-
 * lived Google resumable session URI that is bound to one server-created file.
 */

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

export function isGoogleDriveConfigured() {
  return Boolean(
    process.env.GOOGLE_APPS_SCRIPT_URL?.trim() &&
    process.env.GOOGLE_APPS_SCRIPT_SECRET?.trim()
  );
}

export function safeDriveName(value: string, fallback = 'file') {
  const cleaned = value
    .normalize('NFKC')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
  return (cleaned || fallback).slice(0, 150);
}

export function stageFolderName(block: string | null) {
  if (block === 'foundations') return 'Stage 1 - Foundations';
  if (block === 'restorative') return 'Stage 2 - Restorative';
  if (block === 'advanced') return 'Stage 3 - Advanced';
  return `Stage - ${safeDriveName(block || 'Course')}`;
}

export function lessonFolderName(orderIndex: number, title: string) {
  return `Lesson ${String(Math.max(0, orderIndex)).padStart(2, '0')} - ${safeDriveName(title, 'Lesson')}`;
}

export function buildStoredFilename(args: {
  fullName: string | null;
  userId: string;
  lessonOrder: number;
  originalFilename: string;
  now?: Date;
}) {
  const extMatch = args.originalFilename.toLowerCase().match(/(\.[a-z0-9]+)$/i);
  const extension = extMatch?.[1] || '.stl';
  const stamp = (args.now ?? new Date()).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const shortId = args.userId.replace(/-/g, '').slice(0, 8);
  const suffix = `_${shortId}_L${String(Math.max(0, args.lessonOrder)).padStart(2, '0')}_${stamp}${extension}`;
  const maxPersonLength = Math.max(1, 150 - suffix.length);
  const person = safeDriveName(args.fullName || 'student', 'student')
    .replace(/\s+/g, '_')
    .slice(0, maxPersonLength);
  return `${person}${suffix}`;
}

export type DriveFileMetadata = {
  id: string;
  name: string;
  size?: string;
  parents?: string[];
  webViewLink?: string;
  trashed?: boolean;
  appProperties?: Record<string, string>;
};

type BridgeBaseResponse = {
  ok?: boolean;
  error?: string;
  message?: string;
};

type CreateSessionResponse = BridgeBaseResponse & {
  sessionUrl?: string;
  folderId?: string;
};

type FileResponse = BridgeBaseResponse & {
  file?: DriveFileMetadata | null;
};

async function callDriveBridge<T extends BridgeBaseResponse>(payload: Record<string, unknown>): Promise<T> {
  const url = required('GOOGLE_APPS_SCRIPT_URL');
  const secret = required('GOOGLE_APPS_SCRIPT_SECRET');
  const controller = new AbortController();
  /*
   * 45s, under the routes' maxDuration of 60. The old 20s was meaningless:
   * the platform killed the function at 10s first, so this timer never got to
   * fire and the caller got a dropped connection instead of an error it could
   * report. Aborting before the function dies is what turns "Failed to fetch"
   * into a message that says what actually went wrong.
   */
  const timer = setTimeout(() => controller.abort(), 45_000);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, secret }),
      cache: 'no-store',
      redirect: 'follow',
      signal: controller.signal
    });

    const text = await response.text();
    let data: T;
    try {
      data = JSON.parse(text) as T;
    } catch {
      throw new Error(`Apps Script returned non-JSON (${response.status})`);
    }

    if (!response.ok || !data.ok) {
      throw new Error(data.error || data.message || `Apps Script bridge failed (${response.status})`);
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

export async function createResumableUploadSession(args: {
  storedFilename: string;
  fileSize: number;
  contentType: string;
  submissionId: string;
  assignmentId: string;
  userId: string;
  stageName: string;
  lessonName: string;
}) {
  const data = await callDriveBridge<CreateSessionResponse>({
    action: 'createUploadSession',
    storedFilename: safeDriveName(args.storedFilename),
    fileSize: Math.floor(args.fileSize),
    contentType: args.contentType || 'application/octet-stream',
    submissionId: args.submissionId,
    assignmentId: args.assignmentId,
    userId: args.userId,
    stageName: safeDriveName(args.stageName, 'Stage'),
    lessonName: safeDriveName(args.lessonName, 'Lesson')
  });

  if (!data.sessionUrl) throw new Error('Apps Script did not return a resumable session URL');
  return { sessionUrl: data.sessionUrl, folderId: data.folderId ?? null };
}

export async function getDriveFile(fileId: string) {
  const data = await callDriveBridge<FileResponse>({ action: 'verifyFile', fileId });
  return data.file ?? null;
}

export async function findDriveFileBySubmissionId(submissionId: string) {
  const data = await callDriveBridge<FileResponse>({ action: 'findBySubmission', submissionId });
  return data.file ?? null;
}
