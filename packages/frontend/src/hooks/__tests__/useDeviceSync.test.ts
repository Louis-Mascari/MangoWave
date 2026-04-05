import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDeviceSync } from '../useDeviceSync.ts';
import { useSettingsStore } from '../../store/useSettingsStore.ts';
import { useDeviceSyncStatusStore } from '../../store/useDeviceSyncStatusStore.ts';
import type { VisualizerRenderer } from '../../engine/VisualizerRenderer.ts';

// Mock callbacks captured during service creation
let capturedOnPresetChange: ((name: string, time: number) => void) | null = null;
let capturedOnSettingsChange: ((settings: Record<string, unknown>) => void) | null = null;

const mockSendPresetChange = vi.fn();
const mockSendPresetRedirect = vi.fn();
const mockSendSettingsChange = vi.fn();
const mockDestroy = vi.fn();

class MockDeviceSyncService {
  status = 'connected';
  isHost = true;
  roomCode = 'MANGO-TEST';
  peerCount = 0;

  async createRoom() {
    return 'MANGO-TEST';
  }
  async joinRoom(_code: string) {}
  sendPresetChange = mockSendPresetChange;
  sendPresetRedirect = mockSendPresetRedirect;
  sendSettingsChange = mockSendSettingsChange;
  destroy = mockDestroy;

  set onPresetChange(fn: ((name: string, time: number) => void) | null) {
    capturedOnPresetChange = fn;
  }
  set onPresetRedirect(_fn: unknown) {}
  set onSettingsChange(fn: ((settings: Record<string, unknown>) => void) | null) {
    capturedOnSettingsChange = fn;
  }
  set onStatusChange(_fn: unknown) {}
  set onPeerCountChange(_fn: unknown) {}
}

vi.mock('../../services/DeviceSyncService.ts', () => ({
  DeviceSyncService: MockDeviceSyncService,
}));

vi.mock('../../utils/isMobileDevice.ts', () => ({
  isMobileDevice: false,
}));

vi.mock('../../data/excludedPresets.ts', () => ({
  mobileBlockedSet: new Set(['blocked-preset']),
  quarantinedSet: new Set(),
}));

function createMockRenderer() {
  return {
    loadPreset: vi.fn(),
    presetList: ['preset-a', 'preset-b', 'blocked-preset'],
    currentPresetName: 'preset-a',
  };
}

describe('useDeviceSync', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    capturedOnPresetChange = null;
    capturedOnSettingsChange = null;
    mockSendPresetChange.mockClear();
    mockSendPresetRedirect.mockClear();
    mockSendSettingsChange.mockClear();
    mockDestroy.mockClear();

    useSettingsStore.setState({ deviceSyncEnabled: false, deviceSyncSettingsSync: false });
    useDeviceSyncStatusStore.setState({
      status: 'idle',
      peerCount: 0,
      roomCode: '',
      isHost: false,
      errorMessage: '',
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('starts in idle state', () => {
    const renderer = createMockRenderer();
    const rendererRef = { current: renderer as unknown as VisualizerRenderer };
    const resetAutopilotRef = { current: vi.fn() };

    const { result } = renderHook(() => useDeviceSync(rendererRef, resetAutopilotRef));

    expect(result.current.status).toBe('idle');
    expect(result.current.isHost).toBe(false);
    expect(result.current.roomCode).toBe('');
  });

  it('broadcasts preset to device sync service', async () => {
    const renderer = createMockRenderer();
    const rendererRef = { current: renderer as unknown as VisualizerRenderer };
    const resetAutopilotRef = { current: vi.fn() };

    useSettingsStore.setState({ deviceSyncEnabled: true });

    const { result } = renderHook(() => useDeviceSync(rendererRef, resetAutopilotRef));

    // Create a room so service exists
    await act(async () => {
      await result.current.createRoom();
    });

    act(() => {
      result.current.broadcastPreset('preset-b', 2);
    });

    expect(mockSendPresetChange).toHaveBeenCalledWith('preset-b', 2);
  });

  it('resets autopilot timer on remote preset change', async () => {
    const renderer = createMockRenderer();
    const rendererRef = { current: renderer as unknown as VisualizerRenderer };
    const resetAutopilotRef = { current: vi.fn() };

    useSettingsStore.setState({ deviceSyncEnabled: true });

    renderHook(() => useDeviceSync(rendererRef, resetAutopilotRef));

    // Create room to wire up callbacks
    await act(async () => {
      const store = useDeviceSyncStatusStore.getState();
      await store.actions.createRoom();
    });

    // Simulate inbound preset
    act(() => {
      capturedOnPresetChange?.('preset-b', 1.5);
    });

    expect(renderer.loadPreset).toHaveBeenCalledWith('preset-b', 1.5);
    expect(resetAutopilotRef.current).toHaveBeenCalled();
  });

  it('applies autopilot settings regardless of sync toggle', async () => {
    const renderer = createMockRenderer();
    const rendererRef = { current: renderer as unknown as VisualizerRenderer };
    const resetAutopilotRef = { current: vi.fn() };

    useSettingsStore.setState({
      deviceSyncEnabled: true,
      deviceSyncSettingsSync: false,
    });

    renderHook(() => useDeviceSync(rendererRef, resetAutopilotRef));

    await act(async () => {
      const store = useDeviceSyncStatusStore.getState();
      await store.actions.createRoom();
    });

    act(() => {
      capturedOnSettingsChange?.({
        autopilot: { enabled: true, interval: 30, mode: 'all', favoriteWeight: 2 },
        eq: { preAmpGain: 2.0, bandGains: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] },
      });
    });

    // Autopilot should be applied
    expect(useSettingsStore.getState().autopilot.enabled).toBe(true);
    expect(useSettingsStore.getState().autopilot.interval).toBe(30);

    // EQ should NOT be applied (settings sync is off)
    expect(useSettingsStore.getState().eq.preAmpGain).not.toBe(2.0);
  });

  it('cleans up service on leave', async () => {
    const renderer = createMockRenderer();
    const rendererRef = { current: renderer as unknown as VisualizerRenderer };
    const resetAutopilotRef = { current: vi.fn() };

    useSettingsStore.setState({ deviceSyncEnabled: true });

    const { result } = renderHook(() => useDeviceSync(rendererRef, resetAutopilotRef));

    await act(async () => {
      await result.current.createRoom();
    });

    act(() => {
      result.current.leaveRoom();
    });

    expect(mockDestroy).toHaveBeenCalled();
  });
});
