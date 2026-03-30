import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { RateLimitToast } from '../RateLimitToast.tsx';
import { useSpotifyStore } from '../../store/useSpotifyStore.ts';

describe('RateLimitToast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useSpotifyStore.setState({
      isRateLimited: false,
      rateLimitResetsAt: null,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not render toast text when not rate limited', () => {
    render(<RateLimitToast />);
    expect(screen.queryByText(/Spotify rate limited/)).toBeNull();
  });

  it('renders when rate limited', () => {
    useSpotifyStore.setState({
      isRateLimited: true,
      rateLimitResetsAt: Date.now() + 5000,
    });
    render(<RateLimitToast />);
    expect(screen.getByText(/Spotify rate limited/)).toBeInTheDocument();
  });

  it('shows countdown seconds', () => {
    useSpotifyStore.setState({
      isRateLimited: true,
      rateLimitResetsAt: Date.now() + 5000,
    });
    render(<RateLimitToast />);
    expect(screen.getByText(/5s/)).toBeInTheDocument();
  });

  it('hides when rate limit clears', () => {
    useSpotifyStore.setState({
      isRateLimited: true,
      rateLimitResetsAt: Date.now() + 3000,
    });
    const { rerender } = render(<RateLimitToast />);
    expect(screen.getByText(/Spotify rate limited/)).toBeInTheDocument();

    act(() => {
      useSpotifyStore.setState({ isRateLimited: false, rateLimitResetsAt: null });
    });
    rerender(<RateLimitToast />);
    expect(screen.queryByText(/Spotify rate limited/)).toBeNull();
  });
});
