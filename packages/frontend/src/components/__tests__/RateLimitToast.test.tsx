import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
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

  it('does not render when not rate limited', () => {
    const { container } = render(<RateLimitToast />);
    expect(container.firstChild).toBeNull();
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
    const { container, rerender } = render(<RateLimitToast />);
    expect(container.firstChild).not.toBeNull();

    useSpotifyStore.setState({ isRateLimited: false, rateLimitResetsAt: null });
    rerender(<RateLimitToast />);
    expect(container.firstChild).toBeNull();
  });
});
