import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { PresetNotification } from '../PresetNotification.tsx';

describe('PresetNotification', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders nothing with empty message', () => {
    const { container } = render(<PresetNotification message="" mode={5} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows the preset name then fades after duration', () => {
    render(<PresetNotification message="Cool Preset" mode={3} />);

    // Flush the deferred show timer
    act(() => vi.advanceTimersByTime(1));

    const el = screen.getByText('Cool Preset');
    expect(el.className).toContain('opacity-80');

    // After duration (3s), should fade
    act(() => vi.advanceTimersByTime(3000));
    expect(el.className).toContain('opacity-0');
  });

  it('stays visible in always mode', () => {
    render(<PresetNotification message="Always Preset" mode="always" />);

    const el = screen.getByText('Always Preset');
    // In always mode, opacity-80 is always applied
    expect(el.className).toContain('opacity-80');

    // Even after a long time, still visible
    act(() => vi.advanceTimersByTime(60000));
    expect(el.className).toContain('opacity-80');
  });
});
