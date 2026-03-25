import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWindowSync } from '../useWindowSync.ts';
import { useSettingsStore } from '../../store/useSettingsStore.ts';
import { useWindowSyncStatusStore } from '../../store/useWindowSyncStatusStore.ts';
import type { VisualizerRenderer } from '../../engine/VisualizerRenderer.ts';

// Mock BroadcastChannel
type MessageHandler = ((ev: MessageEvent) => void) | null;

class MockBroadcastChannel {
  static instances: MockBroadcastChannel[] = [];
  name: string;
  onmessage: MessageHandler = null;
  closed = false;

  constructor(name: string) {
    this.name = name;
    MockBroadcastChannel.instances.push(this);
  }

  postMessage(data: unknown): void {
    if (this.closed) return;
    for (const ch of MockBroadcastChannel.instances) {
      if (ch !== this && ch.name === this.name && !ch.closed && ch.onmessage) {
        ch.onmessage(new MessageEvent('message', { data }));
      }
    }
  }

  close(): void {
    this.closed = true;
    const idx = MockBroadcastChannel.instances.indexOf(this);
    if (idx >= 0) MockBroadcastChannel.instances.splice(idx, 1);
  }
}

// Mock VisualizerRenderer
function createMockRenderer() {
  return {
    loadPreset: vi.fn(),
    presetList: ['preset-a', 'preset-b'],
    currentPresetName: 'preset-a',
  };
}

describe('useWindowSync', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    MockBroadcastChannel.instances = [];
    vi.stubGlobal('BroadcastChannel', MockBroadcastChannel);

    // Reset stores
    useSettingsStore.setState({ windowSyncEnabled: false });
    useWindowSyncStatusStore.setState({ isLeader: false, peerCount: 0 });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('does not create service when sync is disabled', () => {
    const rendererRef = { current: createMockRenderer() };
    renderHook(() =>
      useWindowSync(rendererRef as unknown as React.RefObject<VisualizerRenderer | null>, ''),
    );

    // No BroadcastChannel instances created
    expect(MockBroadcastChannel.instances.length).toBe(0);
  });

  it('creates and destroys service when toggled', () => {
    const rendererRef = { current: createMockRenderer() };
    renderHook(() =>
      useWindowSync(rendererRef as unknown as React.RefObject<VisualizerRenderer | null>, ''),
    );

    // Enable sync
    act(() => useSettingsStore.setState({ windowSyncEnabled: true }));
    expect(MockBroadcastChannel.instances.length).toBeGreaterThan(0);

    // Disable sync
    act(() => useSettingsStore.setState({ windowSyncEnabled: false }));
    expect(MockBroadcastChannel.instances.filter((ch) => !ch.closed).length).toBe(0);
  });

  it('inbound preset change calls renderer.loadPreset', () => {
    const renderer = createMockRenderer();
    const rendererRef = { current: renderer };

    act(() => useSettingsStore.setState({ windowSyncEnabled: true }));
    renderHook(() =>
      useWindowSync(rendererRef as unknown as React.RefObject<VisualizerRenderer | null>, ''),
    );

    // Find the channel that the hook created and deliver a preset-change
    const channel = MockBroadcastChannel.instances[0];
    act(() => {
      channel.onmessage!(
        new MessageEvent('message', {
          data: {
            type: 'preset-change',
            senderId: 'other-tab',
            timestamp: Date.now(),
            presetName: 'Remote Preset',
            transitionTime: 1.5,
          },
        }),
      );
    });

    expect(renderer.loadPreset).toHaveBeenCalledWith('Remote Preset', 1.5);
  });

  it('inbound settings change updates store without echo', () => {
    const rendererRef = { current: createMockRenderer() };

    act(() => useSettingsStore.setState({ windowSyncEnabled: true, volume: 0.5 }));
    renderHook(() =>
      useWindowSync(rendererRef as unknown as React.RefObject<VisualizerRenderer | null>, ''),
    );

    const channel = MockBroadcastChannel.instances[0];
    act(() => {
      channel.onmessage!(
        new MessageEvent('message', {
          data: {
            type: 'settings-change',
            senderId: 'other-tab',
            timestamp: Date.now(),
            settings: { volume: 0.9 },
          },
        }),
      );
    });

    expect(useSettingsStore.getState().volume).toBe(0.9);
  });

  it('outbound settings change is debounced', () => {
    const rendererRef = { current: createMockRenderer() };

    act(() => useSettingsStore.setState({ windowSyncEnabled: true }));
    renderHook(() =>
      useWindowSync(rendererRef as unknown as React.RefObject<VisualizerRenderer | null>, ''),
    );

    // Count messages sent — we need a second channel to observe
    const messagesSeen: unknown[] = [];
    const observer = new MockBroadcastChannel('mangowave-sync');
    observer.onmessage = (ev) => {
      const data = ev.data as Record<string, unknown>;
      if (data.type === 'settings-change') messagesSeen.push(data);
    };

    // Trigger multiple rapid settings changes
    act(() => useSettingsStore.setState({ volume: 0.1 }));
    act(() => useSettingsStore.setState({ volume: 0.2 }));
    act(() => useSettingsStore.setState({ volume: 0.3 }));

    // Not yet sent (debouncing)
    expect(messagesSeen.length).toBe(0);

    // Advance past debounce (200ms)
    act(() => vi.advanceTimersByTime(250));

    // Only one message sent
    expect(messagesSeen.length).toBe(1);

    observer.close();
  });

  it('broadcastPreset sends preset-change to peers', () => {
    const rendererRef = { current: createMockRenderer() };

    act(() => useSettingsStore.setState({ windowSyncEnabled: true }));
    const { result } = renderHook(() =>
      useWindowSync(rendererRef as unknown as React.RefObject<VisualizerRenderer | null>, ''),
    );

    const messagesSeen: unknown[] = [];
    const observer = new MockBroadcastChannel('mangowave-sync');
    observer.onmessage = (ev) => {
      const data = ev.data as Record<string, unknown>;
      if (data.type === 'preset-change') messagesSeen.push(data);
    };

    act(() => result.current.broadcastPreset('New Preset', 2.0));

    expect(messagesSeen.length).toBe(1);
    expect(messagesSeen[0]).toMatchObject({
      type: 'preset-change',
      presetName: 'New Preset',
      transitionTime: 2.0,
    });

    observer.close();
  });

  it('isRemotePresetRef is set on inbound preset', () => {
    const renderer = createMockRenderer();
    const rendererRef = { current: renderer };

    act(() => useSettingsStore.setState({ windowSyncEnabled: true }));
    const { result } = renderHook(() =>
      useWindowSync(rendererRef as unknown as React.RefObject<VisualizerRenderer | null>, ''),
    );

    expect(result.current.isRemotePresetRef.current).toBe(false);

    const channel = MockBroadcastChannel.instances[0];
    act(() => {
      channel.onmessage!(
        new MessageEvent('message', {
          data: {
            type: 'preset-change',
            senderId: 'other-tab',
            timestamp: Date.now(),
            presetName: 'Remote Preset',
            transitionTime: 1.5,
          },
        }),
      );
    });

    expect(result.current.isRemotePresetRef.current).toBe(true);
  });

  it('leader sends settings snapshot along with welcome on join', () => {
    const rendererRef = { current: createMockRenderer() };

    act(() => useSettingsStore.setState({ windowSyncEnabled: true, volume: 0.77 }));
    renderHook(() =>
      useWindowSync(
        rendererRef as unknown as React.RefObject<VisualizerRenderer | null>,
        'LeaderPreset',
      ),
    );

    // Make the hook's service the leader by advancing heartbeats
    act(() => vi.advanceTimersByTime(2100));

    // Observe messages
    const messagesSeen: Record<string, unknown>[] = [];
    const observer = new MockBroadcastChannel('mangowave-sync');
    observer.onmessage = (ev) => messagesSeen.push(ev.data as Record<string, unknown>);

    // Simulate a join from another tab
    const channel = MockBroadcastChannel.instances[0];
    act(() => {
      channel.onmessage!(
        new MessageEvent('message', {
          data: {
            type: 'join',
            senderId: 'new-tab',
            timestamp: Date.now(),
          },
        }),
      );
    });

    const welcome = messagesSeen.find((m) => m.type === 'welcome');
    const settingsMsg = messagesSeen.find((m) => m.type === 'settings-change');

    expect(welcome).toBeDefined();
    expect((welcome as Record<string, unknown>).currentPreset).toBe('LeaderPreset');
    expect(settingsMsg).toBeDefined();
    expect((settingsMsg as { settings: { volume: number } }).settings.volume).toBe(0.77);

    observer.close();
  });

  it('cleanup on unmount closes service', () => {
    const rendererRef = { current: createMockRenderer() };

    act(() => useSettingsStore.setState({ windowSyncEnabled: true }));
    const { unmount } = renderHook(() =>
      useWindowSync(rendererRef as unknown as React.RefObject<VisualizerRenderer | null>, ''),
    );

    const openBefore = MockBroadcastChannel.instances.filter((ch) => !ch.closed).length;
    expect(openBefore).toBeGreaterThan(0);

    unmount();

    const openAfter = MockBroadcastChannel.instances.filter((ch) => !ch.closed).length;
    expect(openAfter).toBe(0);
    expect(useWindowSyncStatusStore.getState().isLeader).toBe(false);
    expect(useWindowSyncStatusStore.getState().peerCount).toBe(0);
  });
});
