import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ControlBar } from '../ControlBar.tsx';

describe('ControlBar', () => {
  it('renders all control buttons', () => {
    render(<ControlBar onNextPreset={vi.fn()} onStop={vi.fn()} onToggleFullscreen={vi.fn()} />);

    expect(screen.getByText('Next Preset')).toBeInTheDocument();
    expect(screen.getByText('EQ')).toBeInTheDocument();
    expect(screen.getByText('Performance')).toBeInTheDocument();
    expect(screen.getByText('Fullscreen')).toBeInTheDocument();
    expect(screen.getByText('Stop')).toBeInTheDocument();
  });

  it('calls onNextPreset when clicked', async () => {
    const user = userEvent.setup();
    const onNextPreset = vi.fn();
    render(
      <ControlBar onNextPreset={onNextPreset} onStop={vi.fn()} onToggleFullscreen={vi.fn()} />,
    );

    await user.click(screen.getByText('Next Preset'));
    expect(onNextPreset).toHaveBeenCalledTimes(1);
  });

  it('calls onStop when clicked', async () => {
    const user = userEvent.setup();
    const onStop = vi.fn();
    render(<ControlBar onNextPreset={vi.fn()} onStop={onStop} onToggleFullscreen={vi.fn()} />);

    await user.click(screen.getByText('Stop'));
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it('toggles EQ panel on click', async () => {
    const user = userEvent.setup();
    render(<ControlBar onNextPreset={vi.fn()} onStop={vi.fn()} onToggleFullscreen={vi.fn()} />);

    // EQ panel not visible initially
    expect(screen.queryByText('Equalizer')).not.toBeInTheDocument();

    await user.click(screen.getByText('EQ'));
    expect(screen.getByText('Equalizer')).toBeInTheDocument();

    // Click again to close
    await user.click(screen.getByText('EQ'));
    expect(screen.queryByText('Equalizer')).not.toBeInTheDocument();
  });

  it('toggles Performance panel on click', async () => {
    const user = userEvent.setup();
    render(<ControlBar onNextPreset={vi.fn()} onStop={vi.fn()} onToggleFullscreen={vi.fn()} />);

    expect(screen.queryByText('Frame Rate')).not.toBeInTheDocument();

    await user.click(screen.getByText('Performance'));
    expect(screen.getByText('Frame Rate')).toBeInTheDocument();
  });
});
