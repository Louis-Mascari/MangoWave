import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { act } from 'react';
import { LaunchAnimation, LAUNCH_DURATION_MS } from '../LaunchAnimation.tsx';

describe('LaunchAnimation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the howling image', () => {
    const { container } = render(<LaunchAnimation onComplete={vi.fn()} />);
    expect(container.querySelector('img')).toBeInTheDocument();
  });

  it('calls onComplete after animation duration', () => {
    const onComplete = vi.fn();
    render(<LaunchAnimation onComplete={onComplete} />);

    expect(onComplete).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(LAUNCH_DURATION_MS);
    });

    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
