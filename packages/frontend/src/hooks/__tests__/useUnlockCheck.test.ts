import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useUnlockCheck } from '../useUnlockCheck.ts';
import { useSpotifyStore } from '../../store/useSpotifyStore.ts';

describe('useUnlockCheck', () => {
  const originalLocation = window.location;
  const originalHistory = window.history;

  beforeEach(() => {
    useSpotifyStore.setState({ isSpotifyUnlocked: false });
    vi.stubGlobal('import.meta.env', {
      ...import.meta.env,
      VITE_UNLOCK_HASH: undefined,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(window, 'location', { value: originalLocation, writable: true });
    Object.defineProperty(window, 'history', { value: originalHistory, writable: true });
  });

  it('does nothing when no unlock param', () => {
    // Default URL has no ?unlock= param
    renderHook(() => useUnlockCheck());
    expect(useSpotifyStore.getState().isSpotifyUnlocked).toBe(false);
  });

  it('strips the unlock param from URL', async () => {
    const replaceState = vi.fn();
    Object.defineProperty(window, 'history', {
      value: { replaceState },
      writable: true,
    });

    // Pre-compute SHA-256 of 'SPOT'
    const encoded = new TextEncoder().encode('SPOT');
    const digest = await crypto.subtle.digest('SHA-256', encoded);
    const hash = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    // Set URL with unlock param
    Object.defineProperty(window, 'location', {
      value: {
        ...originalLocation,
        search: '?unlock=SPOT',
        pathname: '/',
      },
      writable: true,
    });

    // Set the expected hash
    vi.stubEnv('VITE_UNLOCK_HASH', hash);

    renderHook(() => useUnlockCheck());

    await waitFor(() => {
      expect(replaceState).toHaveBeenCalled();
    });
  });
});
