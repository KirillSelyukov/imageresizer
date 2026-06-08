import { useRef, useState } from 'react';
import { UploadCloud } from 'lucide-react';

export default function DropZone({ onFiles, blocked }) {
  const fileInputRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);

  function handleDrop(e) {
    e.preventDefault();
    setIsDragging(false);
    if (!blocked) onFiles(e.dataTransfer.files);
  }

  return (
    <div
      className={`drop-zone${isDragging ? ' dragging' : ''}${blocked ? ' disabled' : ''}`}
      onDrop={handleDrop}
      onDragOver={(e) => { e.preventDefault(); if (!blocked) setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onClick={() => !blocked && fileInputRef.current?.click()}
      role="button"
      tabIndex={blocked ? -1 : 0}
      onKeyDown={(e) => e.key === 'Enter' && !blocked && fileInputRef.current?.click()}
      aria-label="Upload images"
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }}
        disabled={blocked}
      />
      {blocked ? (
        <div className="drop-zone-inner">
          <div className="spinner" aria-label="Processing" />
          <p>Processing — upload blocked until done</p>
        </div>
      ) : (
        <div className="drop-zone-inner">
          <UploadCloud size={40} strokeWidth={1.5} aria-hidden="true" />
          <p className="drop-primary">Drop images here or <span className="link">browse</span></p>
          <p className="drop-hint">JPEG &amp; PNG · up to 10 files · max 50 MB each</p>
        </div>
      )}
    </div>
  );
}
