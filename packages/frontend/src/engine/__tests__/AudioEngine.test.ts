import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AudioEngine, EQ_BANDS } from '../AudioEngine.ts';

// Mock Web Audio API nodes
function createMockAudioContext() {
  const mockGain = {
    gain: { value: 1.0 },
    connect: vi.fn(),
  };

  const mockFilter = {
    type: '' as BiquadFilterType,
    frequency: { value: 0 },
    Q: { value: 0 },
    gain: { value: 0 },
    connect: vi.fn(),
  };

  const mockAnalyser = {
    fftSize: 0,
    smoothingTimeConstant: 0,
    frequencyBinCount: 512,
    getByteFrequencyData: vi.fn((arr: Uint8Array) => {
      // Fill with some test data
      for (let i = 0; i < arr.length; i++) arr[i] = i % 256;
    }),
    getByteTimeDomainData: vi.fn((arr: Uint8Array) => {
      for (let i = 0; i < arr.length; i++) arr[i] = 128;
    }),
    connect: vi.fn(),
  };

  const mockSource = {
    connect: vi.fn(),
  };

  const ctx = {
    state: 'running' as AudioContextState,
    createGain: vi.fn(() => ({ ...mockGain })),
    createBiquadFilter: vi.fn(() => ({
      ...mockFilter,
      frequency: { value: 0 },
      Q: { value: 0 },
      gain: { value: 0 },
      connect: vi.fn(),
    })),
    createAnalyser: vi.fn(() => ({ ...mockAnalyser })),
    createMediaStreamSource: vi.fn(() => ({ ...mockSource })),
    close: vi.fn(),
  };

  return ctx;
}

describe('AudioEngine', () => {
  let engine: AudioEngine;

  beforeEach(() => {
    engine = new AudioEngine();
  });

  it('starts with no active context', () => {
    expect(engine.context).toBeNull();
    expect(engine.analyserNode).toBeNull();
    expect(engine.isActive).toBe(false);
  });

  it('returns empty arrays when no analyser is connected', () => {
    expect(engine.getFrequencyData()).toEqual(new Uint8Array(0));
    expect(engine.getTimeDomainData()).toEqual(new Uint8Array(0));
  });

  describe('captureAudio', () => {
    it('calls getDisplayMedia and stops video tracks', async () => {
      const mockVideoTrack = { stop: vi.fn(), kind: 'video' };
      const mockAudioTrack = { stop: vi.fn(), kind: 'audio' };
      const mockStream = {
        getVideoTracks: () => [mockVideoTrack],
        getAudioTracks: () => [mockAudioTrack],
        getTracks: () => [mockVideoTrack, mockAudioTrack],
      } as unknown as MediaStream;

      Object.defineProperty(navigator, 'mediaDevices', {
        value: {
          getDisplayMedia: vi.fn().mockResolvedValue(mockStream),
        },
        writable: true,
        configurable: true,
      });

      const stream = await engine.captureAudio();

      expect(navigator.mediaDevices.getDisplayMedia).toHaveBeenCalledWith({
        audio: true,
        video: true,
      });
      expect(mockVideoTrack.stop).toHaveBeenCalled();
      expect(mockAudioTrack.stop).not.toHaveBeenCalled();
      expect(stream).toBe(mockStream);
    });
  });

  describe('initAudioPipeline', () => {
    it('creates the full audio chain with 10 EQ bands', () => {
      const mockCtx = createMockAudioContext();
      globalThis.AudioContext = vi.fn(function (this: Record<string, unknown>) {
        Object.assign(this, mockCtx);
        return this;
      }) as unknown as typeof AudioContext;

      const mockStream = {
        getVideoTracks: () => [],
        getAudioTracks: () => [{ stop: vi.fn() }],
        getTracks: () => [],
      } as unknown as MediaStream;

      engine.initAudioPipeline(mockStream);

      expect(mockCtx.createMediaStreamSource).toHaveBeenCalledWith(mockStream);
      expect(mockCtx.createGain).toHaveBeenCalledTimes(1);
      expect(mockCtx.createBiquadFilter).toHaveBeenCalledTimes(EQ_BANDS.length);
      expect(mockCtx.createAnalyser).toHaveBeenCalledTimes(1);
      expect(engine.context).toEqual(mockCtx);
      expect(engine.isActive).toBe(true);
    });
  });

  describe('setPreAmpGain', () => {
    it('does nothing if pipeline not initialized', () => {
      // Should not throw
      engine.setPreAmpGain(2.0);
    });
  });

  describe('setEQBandGain', () => {
    it('does nothing if index out of range', () => {
      engine.setEQBandGain(-1, 5);
      engine.setEQBandGain(99, 5);
    });
  });

  describe('destroy', () => {
    it('cleans up all resources', () => {
      const mockCtx = createMockAudioContext();
      globalThis.AudioContext = vi.fn(function (this: Record<string, unknown>) {
        Object.assign(this, mockCtx);
        return this;
      }) as unknown as typeof AudioContext;

      const mockTrack = { stop: vi.fn() };
      const mockStream = {
        getVideoTracks: () => [],
        getAudioTracks: () => [],
        getTracks: () => [mockTrack],
      } as unknown as MediaStream;

      engine.initAudioPipeline(mockStream);
      engine['stream'] = mockStream;

      engine.destroy();

      expect(mockCtx.close).toHaveBeenCalled();
      expect(mockTrack.stop).toHaveBeenCalled();
      expect(engine.context).toBeNull();
      expect(engine.analyserNode).toBeNull();
      expect(engine.isActive).toBe(false);
    });
  });
});
