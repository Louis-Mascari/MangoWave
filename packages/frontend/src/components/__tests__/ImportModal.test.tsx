import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ImportModal } from '../ImportModal.tsx';
import { useImportModalStore } from '../../store/useImportModalStore.ts';

// Mock the processor to avoid IDB/converter dependencies
vi.mock('../../engine/importProcessor.ts', () => ({
  processPresetImport: vi.fn().mockResolvedValue([]),
  processTextureImport: vi.fn().mockResolvedValue([]),
}));

// Mock idb-keyval
vi.mock('idb-keyval', () => ({
  set: vi.fn().mockResolvedValue(undefined),
  del: vi.fn().mockResolvedValue(undefined),
}));

describe('ImportModal', () => {
  beforeEach(() => {
    useImportModalStore.getState().close();
  });

  it('does not render when closed', () => {
    render(<ImportModal />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders when opened in preset mode', () => {
    useImportModalStore.getState().open('preset');
    render(<ImportModal />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Import Presets')).toBeInTheDocument();
  });

  it('renders when opened in texture mode', () => {
    useImportModalStore.getState().open('texture');
    render(<ImportModal />);
    expect(screen.getByText('Import Textures')).toBeInTheDocument();
  });

  it('shows drop zone text for presets', () => {
    useImportModalStore.getState().open('preset');
    render(<ImportModal />);
    expect(screen.getByText('Drop .milk files here or click to browse')).toBeInTheDocument();
  });

  it('shows drop zone text for textures', () => {
    useImportModalStore.getState().open('texture');
    render(<ImportModal />);
    expect(screen.getByText('Drop image files here or click to browse')).toBeInTheDocument();
  });

  it('shows browse files button', () => {
    useImportModalStore.getState().open('preset');
    render(<ImportModal />);
    expect(screen.getByText('Browse Files')).toBeInTheDocument();
  });

  it('closes on escape key', () => {
    useImportModalStore.getState().open('preset');
    render(<ImportModal />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(useImportModalStore.getState().isOpen).toBe(false);
  });

  it('closes on backdrop click', () => {
    useImportModalStore.getState().open('preset');
    const { container } = render(<ImportModal />);
    // Click the backdrop (outermost div)
    const backdrop = container.firstChild as HTMLElement;
    fireEvent.click(backdrop);
    expect(useImportModalStore.getState().isOpen).toBe(false);
  });

  it('does not close when clicking modal content', () => {
    useImportModalStore.getState().open('preset');
    render(<ImportModal />);
    fireEvent.click(screen.getByRole('dialog'));
    expect(useImportModalStore.getState().isOpen).toBe(true);
  });

  it('has a hidden file input', () => {
    useImportModalStore.getState().open('preset');
    const { container } = render(<ImportModal />);
    const input = container.querySelector('input[type="file"]');
    expect(input).toBeInTheDocument();
    expect(input).toHaveClass('hidden');
  });

  it('sets correct accept attribute for preset mode', () => {
    useImportModalStore.getState().open('preset');
    const { container } = render(<ImportModal />);
    const input = container.querySelector('input[type="file"]');
    expect(input).toHaveAttribute('accept', '.milk');
  });

  it('sets correct accept attribute for texture mode', () => {
    useImportModalStore.getState().open('texture');
    const { container } = render(<ImportModal />);
    const input = container.querySelector('input[type="file"]');
    expect(input).toHaveAttribute('accept', 'image/jpeg,image/png,image/webp');
  });

  it('resets state when reopening', () => {
    useImportModalStore.getState().open('preset');
    const { rerender } = render(<ImportModal />);

    // Close and reopen
    useImportModalStore.getState().close();
    rerender(<ImportModal />);
    useImportModalStore.getState().open('texture');
    rerender(<ImportModal />);

    // Should be back to select phase with new mode
    expect(screen.getByText('Import Textures')).toBeInTheDocument();
    expect(screen.getByText('Drop image files here or click to browse')).toBeInTheDocument();
  });
});
