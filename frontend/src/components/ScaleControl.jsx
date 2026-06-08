export default function ScaleControl({ scale, onChange, disabled }) {
  return (
    <div className="scale-row">
      <label htmlFor="scale-slider" className="scale-label">
        Resize to <strong>{scale}%</strong> of original
      </label>
      <input
        id="scale-slider"
        type="range"
        min="1"
        max="100"
        value={scale}
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={disabled}
        className="scale-slider"
        aria-valuemin={1}
        aria-valuemax={100}
        aria-valuenow={scale}
      />
      <div className="scale-marks">
        <span>1%</span>
        <span>50%</span>
        <span>100%</span>
      </div>
    </div>
  );
}
