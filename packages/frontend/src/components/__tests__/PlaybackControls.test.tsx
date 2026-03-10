import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PlaybackControls } from '../PlaybackControls.tsx';
import type { PlaybackAdapter } from '../PlaybackControls.tsx';

function makeAdapter(overrides: Partial<PlaybackAdapter> = {}): PlaybackAdapter {
  return {
    source: 'none',
    isPlaying: false,
    canControl: false,
    onPlay: vi.fn(),
    onPause: vi.fn(),
    onNext: vi.fn(),
    onPrevious: vi.fn(),
    ...overrides,
  };
}

describe('PlaybackControls', () => {
  it('renders disabled buttons when canControl is false', () => {
    render(<PlaybackControls adapter={makeAdapter()} />);

    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(3);
    buttons.forEach((btn) => expect(btn).toBeDisabled());
  });

  it('renders enabled buttons when canControl is true', () => {
    render(<PlaybackControls adapter={makeAdapter({ canControl: true })} />);

    const buttons = screen.getAllByRole('button');
    buttons.forEach((btn) => expect(btn).toBeEnabled());
  });

  it('calls onNext when next is clicked', async () => {
    const user = userEvent.setup();
    const adapter = makeAdapter({ canControl: true });
    render(<PlaybackControls adapter={adapter} />);

    await user.click(screen.getByLabelText('Next track'));
    expect(adapter.onNext).toHaveBeenCalledOnce();
  });

  it('calls onPrevious when previous is clicked', async () => {
    const user = userEvent.setup();
    const adapter = makeAdapter({ canControl: true });
    render(<PlaybackControls adapter={adapter} />);

    await user.click(screen.getByLabelText('Previous track'));
    expect(adapter.onPrevious).toHaveBeenCalledOnce();
  });

  it('shows play button when not playing', () => {
    render(<PlaybackControls adapter={makeAdapter({ canControl: true, isPlaying: false })} />);
    expect(screen.getByLabelText('Play')).toBeInTheDocument();
  });

  it('shows pause button when playing', () => {
    render(<PlaybackControls adapter={makeAdapter({ canControl: true, isPlaying: true })} />);
    expect(screen.getByLabelText('Pause')).toBeInTheDocument();
  });

  it('calls onPlay when play button clicked', async () => {
    const user = userEvent.setup();
    const adapter = makeAdapter({ canControl: true, isPlaying: false });
    render(<PlaybackControls adapter={adapter} />);

    await user.click(screen.getByLabelText('Play'));
    expect(adapter.onPlay).toHaveBeenCalledOnce();
  });

  it('calls onPause when pause button clicked', async () => {
    const user = userEvent.setup();
    const adapter = makeAdapter({ canControl: true, isPlaying: true });
    render(<PlaybackControls adapter={adapter} />);

    await user.click(screen.getByLabelText('Pause'));
    expect(adapter.onPause).toHaveBeenCalledOnce();
  });

  it('shows disabled tooltip on buttons when canControl is false', () => {
    render(<PlaybackControls adapter={makeAdapter({ tooltip: 'Rate limited' })} />);
    expect(screen.getByLabelText('Play')).toHaveAttribute('title', 'Rate limited');
  });

  it('shows default disabled tooltip when no tooltip provided', () => {
    render(<PlaybackControls adapter={makeAdapter()} />);
    expect(screen.getByLabelText('Play')).toHaveAttribute(
      'title',
      'Sharing audio — no playback controls',
    );
  });

  it('renders correctly for each source type', () => {
    for (const source of ['spotify', 'local', 'mic', 'none'] as const) {
      const { unmount } = render(
        <PlaybackControls adapter={makeAdapter({ source, canControl: source !== 'none' })} />,
      );
      const buttons = screen.getAllByRole('button');
      expect(buttons).toHaveLength(3);
      unmount();
    }
  });

  it('renders shuffle and repeat toggles when provided', () => {
    render(
      <PlaybackControls
        adapter={makeAdapter({
          canControl: true,
          shuffle: false,
          repeatMode: 'off',
          onToggleShuffle: vi.fn(),
          onCycleRepeat: vi.fn(),
        })}
      />,
    );
    expect(screen.getByLabelText('Enable shuffle')).toBeInTheDocument();
    expect(screen.getByLabelText('Repeat: off')).toBeInTheDocument();
  });

  it('calls onToggleShuffle when shuffle is clicked', async () => {
    const user = userEvent.setup();
    const onToggleShuffle = vi.fn();
    render(
      <PlaybackControls
        adapter={makeAdapter({
          canControl: true,
          shuffle: false,
          onToggleShuffle,
          onCycleRepeat: vi.fn(),
          repeatMode: 'off',
        })}
      />,
    );
    await user.click(screen.getByLabelText('Enable shuffle'));
    expect(onToggleShuffle).toHaveBeenCalledOnce();
  });

  it('cycles repeat mode label correctly', () => {
    const { rerender } = render(
      <PlaybackControls
        adapter={makeAdapter({
          canControl: true,
          repeatMode: 'all',
          onCycleRepeat: vi.fn(),
          onToggleShuffle: vi.fn(),
          shuffle: false,
        })}
      />,
    );
    expect(screen.getByLabelText('Repeat all')).toBeInTheDocument();

    rerender(
      <PlaybackControls
        adapter={makeAdapter({
          canControl: true,
          repeatMode: 'one',
          onCycleRepeat: vi.fn(),
          onToggleShuffle: vi.fn(),
          shuffle: false,
        })}
      />,
    );
    expect(screen.getByLabelText('Repeat one')).toBeInTheDocument();
  });

  it('does not render shuffle/repeat when callbacks not provided', () => {
    render(<PlaybackControls adapter={makeAdapter({ canControl: true })} />);
    expect(screen.queryByLabelText('Enable shuffle')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Repeat/)).not.toBeInTheDocument();
  });
});
