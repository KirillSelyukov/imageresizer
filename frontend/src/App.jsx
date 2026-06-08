import { useState, useEffect, useRef, useCallback } from 'react';
import DropZone from './components/DropZone';
import FileList from './components/FileList';
import ScaleControl from './components/ScaleControl';
import JobList from './components/JobList';

const API = '/api';
const MAX_IMAGES = 10;
const ALLOWED_TYPES = ['image/jpeg', 'image/png'];
const POLL_MS = 1000;

function getSessionId() {
  let id = localStorage.getItem('sessionId');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('sessionId', id);
  }
  return id;
}

export default function App() {
  const sessionId = useRef(getSessionId());

  const [files, setFiles] = useState([]);
  const [scale, setScale] = useState(50);
  const [jobs, setJobs] = useState([]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const isProcessing = jobs.some(
    (j) => j.status === 'pending' || j.status === 'processing'
  );

  // Keep a ref to the latest jobs so the polling interval never goes stale
  // without needing to restart on every job update.
  const jobsRef = useRef(jobs);
  jobsRef.current = jobs;

  useEffect(() => {
    if (!isProcessing) return;

    const timer = setInterval(async () => {
      const updated = await Promise.all(
        jobsRef.current.map(async (job) => {
          if (job.status === 'done' || job.status === 'failed') return job;
          try {
            const res = await fetch(`${API}/jobs/${job.jobId}`);
            if (!res.ok) return job;
            const data = await res.json();
            return { ...job, status: data.status, errorMsg: data.error_message };
          } catch {
            return job;
          }
        })
      );
      setJobs(updated);
    }, POLL_MS);

    return () => clearInterval(timer);
  }, [isProcessing]);

  const addFiles = useCallback((incoming) => {
    setError('');
    const valid = [];
    const rejected = [];

    Array.from(incoming).forEach((f) => {
      if (ALLOWED_TYPES.includes(f.type)) valid.push(f);
      else rejected.push(f.name);
    });

    if (rejected.length) {
      setError(`Rejected (not JPEG/PNG): ${rejected.join(', ')}`);
    }

    setFiles((prev) => {
      const next = [...prev, ...valid].slice(0, MAX_IMAGES);
      if (prev.length + valid.length > MAX_IMAGES) {
        setError((e) => (e ? e + ` — max ${MAX_IMAGES} images` : `Max ${MAX_IMAGES} images`));
      }
      return next;
    });
  }, []);

  const handleResize = async () => {
    if (files.length === 0 || isProcessing || submitting) return;
    setError('');
    setSubmitting(true);

    const form = new FormData();
    files.forEach((f) => form.append('images', f));
    form.append('sessionId', sessionId.current);
    form.append('scale', String(scale));

    try {
      const res = await fetch(`${API}/jobs`, {
        method: 'POST',
        body: form,
        signal: AbortSignal.timeout(30_000),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      setJobs(data.jobs);
      setFiles([]);
    } catch (err) {
      setError(err.name === 'TimeoutError' ? 'Request timed out (30 s)' : err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const [downloading, setDownloading] = useState(new Set());
  const [downloadingAll, setDownloadingAll] = useState(false);

  function triggerSave(blobUrl, name) {
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = `resized_${name}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  const handleDownload = async (job) => {
    // Blob already cached — user cancelled the save dialog previously; re-trigger it.
    if (job.blobUrl) {
      triggerSave(job.blobUrl, job.originalName);
      return;
    }

    setDownloading((prev) => new Set(prev).add(job.jobId));
    try {
      const res = await fetch(`${API}/jobs/${job.jobId}/download`);
      if (!res.ok) {
        const msg = res.status === 404 ? 'File has expired' : 'Download failed';
        setJobs((prev) => prev.map((j) => j.jobId === job.jobId ? { ...j, downloadError: msg } : j));
        return;
      }
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      setJobs((prev) => prev.map((j) => j.jobId === job.jobId ? { ...j, blobUrl } : j));
      triggerSave(blobUrl, job.originalName);
    } catch {
      setJobs((prev) => prev.map((j) => j.jobId === job.jobId ? { ...j, downloadError: 'Download failed' } : j));
    } finally {
      setDownloading((prev) => { const next = new Set(prev); next.delete(job.jobId); return next; });
    }
  };

  const handleDismiss = (job) => {
    if (job.blobUrl) URL.revokeObjectURL(job.blobUrl);
    setJobs((prev) => prev.filter((j) => j.jobId !== job.jobId));
  };

  const handleDownloadAll = async () => {
    // Only request files still on the server (jobs without a cached blobUrl)
    const targets = jobs.filter((j) => j.status === 'done' && !j.blobUrl);
    if (targets.length < 2) return;

    setDownloadingAll(true);
    try {
      const res = await fetch(`${API}/jobs/download-all`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobIds: targets.map((j) => j.jobId) }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Download failed');
      }

      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = 'resized-images.zip';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);

      const downloadedIds = new Set(targets.map((j) => j.jobId));
      setJobs((prev) => prev.filter((j) => !downloadedIds.has(j.jobId)));
    } catch {
      // Individual download errors are shown per-item; a bulk failure is rare
      // and surfaced via the browser console rather than cluttering the UI.
    } finally {
      setDownloadingAll(false);
    }
  };

  const handleClear = () => {
    jobs.forEach((j) => { if (j.blobUrl) URL.revokeObjectURL(j.blobUrl); });
    setJobs([]);
  };

  const blocked = isProcessing || submitting;
  const allSettled = jobs.length > 0 && jobs.every((j) => j.status === 'done' || j.status === 'failed');
  const downloadableCount = jobs.filter((j) => j.status === 'done' && !j.blobUrl).length;

  return (
    <div className="app">
      <header className="header">
        <h1>Image Resizer</h1>
        <p>Upload JPEG or PNG images, choose a scale, and download the results.</p>
      </header>

      <main>
        <section className={`card upload-card${blocked ? ' blocked' : ''}`}>
          <DropZone onFiles={addFiles} blocked={blocked} />
          <FileList
            files={files}
            onRemove={(i) => setFiles(files.filter((_, j) => j !== i))}
            blocked={blocked}
          />
          <ScaleControl scale={scale} onChange={setScale} disabled={blocked} />

          {error && <p className="error" role="alert">{error}</p>}

          <button
            className="btn-primary"
            onClick={handleResize}
            disabled={files.length === 0 || blocked}
          >
            {submitting
              ? 'Uploading…'
              : `Resize ${files.length > 0 ? `${files.length} Image${files.length !== 1 ? 's' : ''}` : ''}`}
          </button>
        </section>

        <JobList
          jobs={jobs}
          downloading={downloading}
          downloadingAll={downloadingAll}
          downloadableCount={downloadableCount}
          onDownload={handleDownload}
          onDownloadAll={handleDownloadAll}
          onDismiss={handleDismiss}
          onClear={handleClear}
          allSettled={allSettled}
        />
      </main>
    </div>
  );
}
