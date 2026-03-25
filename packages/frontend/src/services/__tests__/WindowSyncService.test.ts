import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WindowSyncService } from '../WindowSyncService.ts';

// Mock BroadcastChannel for jsdom
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
    // Deliver to all other channels with the same name
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

describe('WindowSyncService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    MockBroadcastChannel.instances = [];
    vi.stubGlobal('BroadcastChannel', MockBroadcastChannel);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('creates a channel and assigns a unique tabId', () => {
    const service = new WindowSyncService();
    expect(service.tabId).toBeTruthy();
    expect(service.isAvailable).toBe(true);
    service.destroy();
  });

  it('echo suppression — ignores own messages', () => {
    const service = new WindowSyncService();
    const handler = vi.fn();
    service.onPresetChange = handler;

    // Simulate receiving own message (same senderId)
    const channel = MockBroadcastChannel.instances.find(
      (ch) => ch.name === 'mangowave-sync' && !ch.closed,
    )!;
    channel.onmessage!(
      new MessageEvent('message', {
        data: {
          type: 'preset-change',
          senderId: service.tabId,
          timestamp: Date.now(),
          presetName: 'test',
          transitionTime: 2,
        },
      }),
    );

    expect(handler).not.toHaveBeenCalled();
    service.destroy();
  });

  it('delivers preset-change from another tab', () => {
    const service1 = new WindowSyncService();
    const service2 = new WindowSyncService();
    const handler = vi.fn();
    service2.onPresetChange = handler;

    service1.sendPresetChange('Cool Preset', 1.5);

    expect(handler).toHaveBeenCalledWith('Cool Preset', 1.5);
    service1.destroy();
    service2.destroy();
  });

  it('delivers settings-change from another tab', () => {
    const service1 = new WindowSyncService();
    const service2 = new WindowSyncService();
    const handler = vi.fn();
    service2.onSettingsChange = handler;

    const settings = { volume: 0.8, transitionTime: 3 };
    service1.sendSettingsChange(settings);

    expect(handler).toHaveBeenCalledWith(settings);
    service1.destroy();
    service2.destroy();
  });

  it('tracks peers and reports peer count', () => {
    const service1 = new WindowSyncService();
    const countHandler = vi.fn();
    service1.onPeerCountChange = countHandler;

    // service2's constructor heartbeat reaches service1
    const service2 = new WindowSyncService();
    expect(countHandler).toHaveBeenCalledWith(1);
    expect(service1.peerCount).toBe(1);

    service1.destroy();
    service2.destroy();
  });

  it('elects leader as lowest tabId', () => {
    const service1 = new WindowSyncService();
    const service2 = new WindowSyncService();
    const leaderHandler1 = vi.fn();
    const leaderHandler2 = vi.fn();
    service1.onLeaderChange = leaderHandler1;
    service2.onLeaderChange = leaderHandler2;

    // Exchange heartbeats so both know about each other
    service1.sendHeartbeat();
    service2.sendHeartbeat();

    const lowestId = [service1.tabId, service2.tabId].sort()[0];
    if (lowestId === service1.tabId) {
      expect(service1.isLeader).toBe(true);
      expect(service2.isLeader).toBe(false);
    } else {
      expect(service2.isLeader).toBe(true);
      expect(service1.isLeader).toBe(false);
    }

    service1.destroy();
    service2.destroy();
  });

  it('prunes stale peers after timeout', () => {
    const service1 = new WindowSyncService();
    const service2 = new WindowSyncService();

    // service2 sends a heartbeat
    service2.sendHeartbeat();
    expect(service1.peerCount).toBe(1);

    // Destroy service2 (simulates tab close) — stops heartbeating
    service2.destroy();

    // Advance past the peer timeout (4s) + one heartbeat cycle (2s)
    vi.advanceTimersByTime(6000);

    expect(service1.peerCount).toBe(0);
    service1.destroy();
  });

  it('join/welcome handshake works', () => {
    const service1 = new WindowSyncService();
    const welcomeHandler = vi.fn();
    const joinHandler = vi.fn();

    // service1 is already running and becomes leader
    service1.onJoin = joinHandler;

    // Make service1 the leader by giving it a heartbeat cycle
    vi.advanceTimersByTime(2000);

    const service2 = new WindowSyncService();
    service2.onWelcome = welcomeHandler;

    // service2 joins
    service2.sendJoin();

    // service1 should have received the join
    expect(joinHandler).toHaveBeenCalled();

    service1.destroy();
    service2.destroy();
  });

  it('destroy() closes channel and clears timers', () => {
    const service = new WindowSyncService();
    service.destroy();

    expect(service.isAvailable).toBe(false);
    expect(service.peerCount).toBe(0);

    // No errors when advancing timers after destroy
    vi.advanceTimersByTime(10000);
  });

  it('gracefully degrades when BroadcastChannel is undefined', () => {
    vi.stubGlobal('BroadcastChannel', undefined);

    const service = new WindowSyncService();
    expect(service.isAvailable).toBe(false);

    // All send methods are no-ops
    expect(() => service.sendPresetChange('test', 1)).not.toThrow();
    expect(() => service.sendSettingsChange({ volume: 1 })).not.toThrow();
    expect(() => service.sendHeartbeat()).not.toThrow();
    expect(() => service.sendJoin()).not.toThrow();
    expect(() => service.sendWelcome('test')).not.toThrow();
    expect(() => service.destroy()).not.toThrow();
  });

  it('ignores malformed messages', () => {
    const service1 = new WindowSyncService();
    const service2 = new WindowSyncService();
    const handler = vi.fn();
    service2.onPresetChange = handler;

    // Send malformed data directly via the channel
    const channel = MockBroadcastChannel.instances.find(
      (ch) => ch.name === 'mangowave-sync' && !ch.closed,
    )!;

    // Missing required fields
    channel.postMessage({ type: 'preset-change', senderId: 'fake' });
    channel.postMessage(null);
    channel.postMessage('not an object');
    channel.postMessage({ type: 'unknown-type', senderId: 'fake', timestamp: Date.now() });

    expect(handler).not.toHaveBeenCalled();
    service1.destroy();
    service2.destroy();
  });
});
