import { ImageIcon } from 'lucide-react';

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function FileList({ files, onRemove, blocked }) {
  if (files.length === 0) return null;

  return (
    <ul className="file-list" aria-label="Selected files">
      {files.map((f, i) => (
        <li key={`${f.name}-${i}`} className="file-item">
          <ImageIcon className="file-icon" size={16} strokeWidth={2} aria-hidden="true" />
          <span className="file-name" title={f.name}>{f.name}</span>
          <span className="file-size">{formatBytes(f.size)}</span>
          <button
            className="file-remove"
            onClick={(e) => { e.stopPropagation(); onRemove(i); }}
            disabled={blocked}
            aria-label={`Remove ${f.name}`}
          >
            ×
          </button>
        </li>
      ))}
    </ul>
  );
}
