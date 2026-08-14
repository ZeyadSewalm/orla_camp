'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Uploads straight to our API route, which forwards to Bunny. Shows real
 * progress because a 500 MB lecture on an Egyptian connection is not a
 * spinner-and-hope situation.
 */
export default function BunnyUpload({
  moduleId,
  title,
  labels
}: {
  moduleId: string;
  title: string;
  labels: { choose: string; uploading: string; done: string; failed: string; processing: string };
}) {
  const router = useRouter();
  const [progress, setProgress] = useState<number | null>(null);
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');

  function upload(file: File) {
    setState('busy');
    setProgress(0);

    const body = new FormData();
    body.append('video', file);
    body.append('module_id', moduleId);
    body.append('title', title || file.name);

    // XHR rather than fetch: it's the only way to get upload progress events.
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/admin/bunny-upload');

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        setState('done');
        setMessage(labels.processing);
        router.refresh();
      } else {
        setState('error');
        try {
          setMessage(JSON.parse(xhr.responseText).error ?? labels.failed);
        } catch {
          setMessage(labels.failed);
        }
      }
    };

    xhr.onerror = () => {
      setState('error');
      setMessage(labels.failed);
    };

    xhr.send(body);
  }

  return (
    <div className="space-y-3">
      <label className="btn-quiet cursor-pointer text-sm">
        <input
          type="file"
          className="sr-only"
          accept="video/mp4,video/quicktime,video/x-matroska,video/*"
          disabled={state === 'busy'}
          onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
        />
        {state === 'busy' ? `${labels.uploading} ${progress ?? 0}%` : labels.choose}
      </label>

      {state === 'busy' && (
        <div className="h-1.5 w-full bg-ink/10">
          <div className="h-full bg-brass transition-all" style={{ width: `${progress ?? 0}%` }} />
        </div>
      )}

      {state === 'done' && <p className="text-sm text-brass">{message}</p>}
      {state === 'error' && <p className="text-sm text-red-700">{message}</p>}
    </div>
  );
}
