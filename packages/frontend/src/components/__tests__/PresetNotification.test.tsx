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
    const { container } = render(<PresetNotification message="" />);
    expect(container.firstChild).toBeNull();
  });

  it('shows the preset name then fades after duration', () => {
    render(<PresetNotification message="Cool Preset" durationMs={3000} />);

    // Flush the deferred show timer
    act(() => vi.advanceTimersByTime(1));

    const el = screen.getByText('Cool Preset');
    expect(el.className).toContain('opacity-80');

    // After duration, should fade
    act(() => vi.advanceTimersByTime(3000));
    expect(el.className).toContain('opacity-0');
  });
});
