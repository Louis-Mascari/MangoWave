import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAudioCapture } from '../useAudioCapture.ts';

// Mock AudioEngine
const mockDestroy = vi.fn();
let shouldRejectCapture = false;
let trackEndedListeners: (() => void)[] = [];

vi.mock('../../engine/AudioEngine.ts', () => {
  return {
    AudioEngine: class MockAudioEngine {
      context = {};
      analyserNode = {};
      isActive = true;
      captureAudio = vi.fn(() => {
        if (shouldRejectCapture) {
          return Promise.reject(new Error('Permission denied'));
        }
        trackEndedListeners = [];
        return Promise.resolve({
          getVideoTracks: () => [],
          getAudioTracks: () => [],
          getTracks: () => [
            {
              addEventListener: (event: string, handler: () => void) => {
                if (event === 'ended') trackEndedListeners.push(handler);
              },
              stop: vi.fn(),
            },
          ],
        });
      });
      initAudioPipeline = vi.fn();
      destroy = mockDestroy;
    },
    EQ_BANDS: [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000],
  };
});

describe('useAudioCapture', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    shouldRejectCapture = false;
    trackEndedListeners = [];
  });

  it('starts in idle state', () => {
    const { result } = renderHook(() => useAudioCapture());

    expect(result.current.isCapturing).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.audioEngine).toBeNull();
  });

  it('starts capture successfully', async () => {
    const { result } = renderHook(() => useAudioCapture());

    await act(async () => {
      await result.current.startCapture();
    });

    expect(result.current.isCapturing).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it('handles capture errors', async () => {
    shouldRejectCapture = true;

    const { result } = renderHook(() => useAudioCapture());

    await act(async () => {
      await result.current.startCapture();
    });

    expect(result.current.isCapturing).toBe(false);
    expect(result.current.error).toBe('Permission denied');
  });

  it('stops capture and cleans up', async () => {
    const { result } = renderHook(() => useAudioCapture());

    await act(async () => {
      await result.current.startCapture();
    });

    act(() => {
      result.current.stopCapture();
    });

    expect(result.current.isCapturing).toBe(false);
    expect(mockDestroy).toHaveBeenCalled();
  });

  it('destroys previous engine on double start', async () => {
    const { result } = renderHook(() => useAudioCapture());

    await act(async () => {
      await result.current.startCapture();
    });

    await act(async () => {
      await result.current.startCapture();
    });

    // First engine should have been destroyed before second was created
    expect(mockDestroy).toHaveBeenCalledTimes(1);
    expect(result.current.isCapturing).toBe(true);
  });

  it('cleans up when browser stop-sharing fires track ended', async () => {
    const { result } = renderHook(() => useAudioCapture());

    await act(async () => {
      await result.current.startCapture();
    });

    expect(result.current.isCapturing).toBe(true);

    // Simulate the browser's "Stop sharing" button
    act(() => {
      trackEndedListeners.forEach((listener) => listener());
    });

    expect(result.current.isCapturing).toBe(false);
    expect(mockDestroy).toHaveBeenCalled();
  });
});
