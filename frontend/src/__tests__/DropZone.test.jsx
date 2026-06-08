import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import DropZone from '../components/DropZone';

const noop = () => {};

describe('DropZone — accessibility', () => {
  it('is keyboard-reachable via tab (tabIndex 0)', () => {
    render(<DropZone onFiles={noop} blocked={false} />);
    expect(screen.getByRole('button', { name: /upload images/i }))
      .toHaveAttribute('tabindex', '0');
  });

  it('is removed from tab order while processing (tabIndex -1)', () => {
    render(<DropZone onFiles={noop} blocked={true} />);
    expect(screen.getByRole('button'))
      .toHaveAttribute('tabindex', '-1');
  });

  it('has an accessible label', () => {
    render(<DropZone onFiles={noop} blocked={false} />);
    expect(screen.getByRole('button', { name: /upload images/i })).toBeInTheDocument();
  });

  it('spinner has an accessible label when processing', () => {
    render(<DropZone onFiles={noop} blocked={true} />);
    expect(screen.getByLabelText(/processing/i)).toBeInTheDocument();
  });
});

describe('DropZone — interaction', () => {
  it('shows upload prompt when idle', () => {
    render(<DropZone onFiles={noop} blocked={false} />);
    expect(screen.getByText(/drop images here/i)).toBeInTheDocument();
  });

  it('shows blocked message while processing', () => {
    render(<DropZone onFiles={noop} blocked={true} />);
    expect(screen.getByText(/processing/i)).toBeInTheDocument();
  });

  it('calls onFiles when files are dropped', () => {
    const onFiles = vi.fn();
    render(<DropZone onFiles={onFiles} blocked={false} />);

    const file = new File(['data'], 'photo.jpg', { type: 'image/jpeg' });
    fireEvent.drop(screen.getByRole('button'), {
      dataTransfer: { files: [file] },
    });

    expect(onFiles).toHaveBeenCalledWith(expect.objectContaining({ 0: file }));
  });

  it('does not call onFiles on drop when blocked', () => {
    const onFiles = vi.fn();
    render(<DropZone onFiles={onFiles} blocked={true} />);

    fireEvent.drop(screen.getByRole('button'), {
      dataTransfer: { files: [] },
    });

    expect(onFiles).not.toHaveBeenCalled();
  });
});
