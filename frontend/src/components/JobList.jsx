function JobItem({ job, downloading, onDownload, onDismiss }) {
  const isFetching = downloading.has(job.jobId);

  return (
    <li className={`job-item job-${job.status}`}>
      <div className="job-meta">
        <span className="job-name" title={job.originalName}>{job.originalName}</span>
        <span className={`job-badge badge-${job.status}`}>
          {job.status === 'pending' && 'Pending'}
          {job.status === 'processing' && 'Processing…'}
          {job.status === 'done' && 'Done'}
          {job.status === 'failed' && 'Failed'}
        </span>
      </div>

      {job.status === 'processing' && (
        <div className="progress-bar" role="progressbar" aria-label="Processing">
          <div className="progress-fill" />
        </div>
      )}

      {job.status === 'done' && (
        <div className="job-actions">
          <button
            className="btn-download"
            onClick={() => onDownload(job)}
            disabled={isFetching}
            aria-label={`Download ${job.originalName}`}
          >
            {isFetching ? 'Downloading…' : job.blobUrl ? 'Save again' : 'Download'}
          </button>
          <button
            className="btn-dismiss"
            onClick={() => onDismiss(job)}
            aria-label={`Dismiss ${job.originalName}`}
          >
            ×
          </button>
        </div>
      )}

      {(job.downloadError || (job.status === 'failed' && job.errorMsg)) && (
        <p className="job-error">{job.downloadError || job.errorMsg}</p>
      )}
    </li>
  );
}

export default function JobList({ jobs, downloading, downloadingAll, downloadableCount, onDownload, onDownloadAll, onDismiss, onClear, allSettled }) {
  if (jobs.length === 0) return null;

  return (
    <section className="card" aria-live="polite" aria-label="Results">
      <div className="results-header">
        <h2>Results</h2>
        <div className="results-actions">
          {downloadableCount >= 2 && (
            <button
              className="btn-download-all"
              onClick={onDownloadAll}
              disabled={downloadingAll}
            >
              {downloadingAll ? 'Zipping…' : `Download All (${downloadableCount})`}
            </button>
          )}
          {allSettled && (
            <button className="btn-ghost" onClick={onClear}>
              Clear all
            </button>
          )}
        </div>
      </div>

      <ul className="jobs-list" aria-label="Job list">
        {jobs.map((job) => (
          <JobItem
            key={job.jobId}
            job={job}
            downloading={downloading}
            onDownload={onDownload}
            onDismiss={onDismiss}
          />
        ))}
      </ul>
    </section>
  );
}
