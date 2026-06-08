import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import App from '../App';

// Prevent real network calls; tests don't need API responses
global.fetch = vi.fn(() => Promise.resolve({ ok: false }));

beforeEach(() => {
  // Provide a stable session ID so getSessionId() doesn't call randomUUID
  vi.spyOn(Storage.prototype, 'getItem').mockReturnValue('test-session');
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(noop);
});

afterEach(() => vi.restoreAllMocks());

function noop() {}

function makeFile(name, type = 'image/jpeg') {
  return new File(['x'], name, { type });
}

// Simulate choosing files via the hidden <input type="file">
function uploadViaInput(files) {
  const input = document.querySelector('input[type="file"]');
  // fireEvent lets us bypass the browser's accept-attribute UI filter,
  // which is what we want: our own addFiles validation should run.
  fireEvent.change(input, { target: { files } });
}

// ─── File type validation ────────────────────────────────────────────────────

describe('File type validation', () => {
  it('rejects a PDF and shows an error alert', () => {
    render(<App />);
    uploadViaInput([makeFile('report.pdf', 'application/pdf')]);
    expect(screen.getByRole('alert')).toHaveTextContent(/rejected/i);
  });

  it('rejects a GIF and names the file in the error', () => {
    render(<App />);
    uploadViaInput([makeFile('anim.gif', 'image/gif')]);
    expect(screen.getByRole('alert')).toHaveTextContent(/anim\.gif/i);
  });

  it('accepts a JPEG without showing an error', () => {
    render(<App />);
    uploadViaInput([makeFile('photo.jpg', 'image/jpeg')]);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('photo.jpg')).toBeInTheDocument();
  });

  it('accepts a PNG without showing an error', () => {
    render(<App />);
    uploadViaInput([makeFile('image.png', 'image/png')]);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('rejects invalid files while still accepting valid ones in the same batch', () => {
    render(<App />);
    uploadViaInput([
      makeFile('photo.jpg', 'image/jpeg'),
      makeFile('bad.gif', 'image/gif'),
    ]);
    expect(screen.getByRole('alert')).toHaveTextContent(/rejected/i);
    expect(screen.getByText('photo.jpg')).toBeInTheDocument();
  });
});

// ─── File count limit ────────────────────────────────────────────────────────

describe('File count limit', () => {
  it('caps selection at 10 and shows an error', () => {
    render(<App />);
    const files = Array.from({ length: 12 }, (_, i) => makeFile(`img${i}.jpg`));
    uploadViaInput(files);

    expect(screen.getByRole('alert')).toHaveTextContent(/max 10 images/i);
    expect(screen.getAllByRole('listitem').length).toBeLessThanOrEqual(10);
  });

  it('does not show an error when exactly 10 files are selected', () => {
    render(<App />);
    const files = Array.from({ length: 10 }, (_, i) => makeFile(`img${i}.jpg`));
    uploadViaInput(files);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

// ─── Error message accessibility ─────────────────────────────────────────────

describe('Error message accessibility', () => {
  it('uses role="alert" so screen readers announce validation errors', () => {
    render(<App />);
    uploadViaInput([makeFile('bad.bmp', 'image/bmp')]);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});

// ─── Results region accessibility ────────────────────────────────────────────

describe('Results region accessibility', () => {
  it('results section uses aria-live="polite" for screen-reader announcements', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            jobs: [{ jobId: 'j1', originalName: 'photo.jpg', status: 'done' }],
          }),
      })
    );

    render(<App />);
    uploadViaInput([makeFile('photo.jpg')]);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /resize/i }));
    });

    await waitFor(() => {
      expect(document.querySelector('[aria-live="polite"]')).not.toBeNull();
    });

    expect(document.querySelector('[aria-live="polite"]').getAttribute('aria-live')).toBe('polite');
  });
});

// ─── Upload button state ──────────────────────────────────────────────────────

describe('Upload button state', () => {
  it('is disabled when no files are selected', () => {
    render(<App />);
    expect(screen.getByRole('button', { name: /resize/i })).toBeDisabled();
  });

  it('becomes enabled after a valid file is added', () => {
    render(<App />);
    uploadViaInput([makeFile('photo.jpg')]);
    expect(screen.getByRole('button', { name: /resize 1 image/i })).not.toBeDisabled();
  });

  it('labels the button with the file count', () => {
    render(<App />);
    uploadViaInput([makeFile('a.jpg'), makeFile('b.jpg')]);
    expect(screen.getByRole('button', { name: /resize 2 images/i })).toBeInTheDocument();
  });
});
