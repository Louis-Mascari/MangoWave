import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// --- PeerJS mock ---
class MockDataConnection {
  peer: string;
  open = true;
  private handlers: Record<string, ((...args: unknown[]) => void)[]> = {};

  constructor(peer: string) {
    this.peer = peer;
  }

  on(event: string, handler: (...args: unknown[]) => void): void {
    if (!this.handlers[event]) this.handlers[event] = [];
    this.handlers[event].push(handler);
  }

  emit(event: string, ...args: unknown[]): void {
    for (const h of this.handlers[event] ?? []) {
      h(...args);
    }
  }

  send = vi.fn();
  close = vi.fn(() => {
    this.open = false;
  });
}

class MockPeer {
  static instances: MockPeer[] = [];
  id: string;
  private handlers: Record<string, ((...args: unknown[]) => void)[]> = {};
  destroyed = false;

  constructor(id?: string) {
    this.id = id ?? `peer-${Math.random().toString(36).slice(2, 8)}`;
    MockPeer.instances.push(this);
    // Fire 'open' synchronously via microtask for test predictability
    queueMicrotask(() => this.emit('open', this.id));
  }

  on(event: string, handler: (...args: unknown[]) => void): void {
    if (!this.handlers[event]) this.handlers[event] = [];
    this.handlers[event].push(handler);
  }

  emit(event: string, ...args: unknown[]): void {
    for (const h of this.handlers[event] ?? []) {
      h(...args);
    }
  }

  connect(peerId: string, _opts?: unknown): MockDataConnection {
    const conn = new MockDataConnection(peerId);
    queueMicrotask(() => conn.emit('open'));
    return conn;
  }

  destroy = vi.fn(() => {
    this.destroyed = true;
  });
  reconnect = vi.fn();
}

vi.mock('peerjs', () => ({
  Peer: MockPeer,
}));

beforeEach(() => {
  MockPeer.instances = [];
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('DeviceSyncService', () => {
  async function importAndCreate() {
    const mod = await import('../DeviceSyncService.ts');
    return new mod.DeviceSyncService();
  }

  it('creates a room and becomes host', async () => {
    const service = await importAndCreate();
    const statusChanges: string[] = [];
    service.onStatusChange = (s) => statusChanges.push(s);

    const createPromise = service.createRoom();
    // Flush microtask for Peer 'open'
    await vi.advanceTimersByTimeAsync(0);
    const code = await createPromise;

    expect(code).toMatch(/^MANGO-[A-HJ-NP-Z]{4}$/);
    expect(service.isHost).toBe(true);
    expect(service.roomCode).toBe(code);
    expect(statusChanges).toContain('connecting');
    expect(statusChanges).toContain('connected');

    service.destroy();
  });

  it('relays messages from one peer to others (host relay)', async () => {
    const service = await importAndCreate();

    const createPromise = service.createRoom();
    await vi.advanceTimersByTimeAsync(0);
    await createPromise;

    // Simulate two peers connecting
    const hostPeer = MockPeer.instances.find((p) => p.id === service.roomCode)!;
    const conn1 = new MockDataConnection('client-1');
    const conn2 = new MockDataConnection('client-2');

    hostPeer.emit('connection', conn1);
    conn1.emit('open');
    hostPeer.emit('connection', conn2);
    conn2.emit('open');

    expect(service.peerCount).toBe(2);

    // Message from client-1 → should relay to conn2 only
    const msg = {
      type: 'preset-change',
      presetName: 'TestPreset',
      transitionTime: 2,
      senderId: 'client-1',
      timestamp: Date.now(),
    };
    conn1.emit('data', msg);

    expect(conn2.send).toHaveBeenCalledWith(msg);
    expect(conn1.send).not.toHaveBeenCalledWith(msg);

    service.destroy();
  });

  it('prunes stale peers after timeout', async () => {
    const service = await importAndCreate();

    const createPromise = service.createRoom();
    await vi.advanceTimersByTimeAsync(0);
    await createPromise;

    const hostPeer = MockPeer.instances.find((p) => p.id === service.roomCode)!;
    const conn = new MockDataConnection('stale-client');
    hostPeer.emit('connection', conn);
    conn.emit('open');

    expect(service.peerCount).toBe(1);

    // Advance past heartbeat + timeout (3s heartbeat + 6s timeout)
    await vi.advanceTimersByTimeAsync(10_000);

    expect(service.peerCount).toBe(0);
    expect(conn.close).toHaveBeenCalled();

    service.destroy();
  });

  it('calls preset change handler on inbound message', async () => {
    const service = await importAndCreate();
    const presetChanges: { name: string; time: number }[] = [];
    service.onPresetChange = (name, time) => presetChanges.push({ name, time });

    const createPromise = service.createRoom();
    await vi.advanceTimersByTimeAsync(0);
    await createPromise;

    const hostPeer = MockPeer.instances.find((p) => p.id === service.roomCode)!;
    const conn = new MockDataConnection('client-1');
    hostPeer.emit('connection', conn);
    conn.emit('open');

    conn.emit('data', {
      type: 'preset-change',
      presetName: 'CoolPreset',
      transitionTime: 1.5,
      senderId: 'client-1',
      timestamp: Date.now(),
    });

    expect(presetChanges).toEqual([{ name: 'CoolPreset', time: 1.5 }]);

    service.destroy();
  });

  it('rejects invalid messages', async () => {
    const service = await importAndCreate();
    const presetChanges: string[] = [];
    service.onPresetChange = (name) => presetChanges.push(name);

    const createPromise = service.createRoom();
    await vi.advanceTimersByTimeAsync(0);
    await createPromise;

    const hostPeer = MockPeer.instances.find((p) => p.id === service.roomCode)!;
    const conn = new MockDataConnection('client-1');
    hostPeer.emit('connection', conn);
    conn.emit('open');

    conn.emit('data', null);
    conn.emit('data', { type: 'bogus' });
    conn.emit('data', 'not an object');
    conn.emit('data', { type: 'preset-change', senderId: 123, timestamp: 0 });

    expect(presetChanges).toHaveLength(0);

    service.destroy();
  });

  it('cleans up on destroy', async () => {
    const service = await importAndCreate();

    const createPromise = service.createRoom();
    await vi.advanceTimersByTimeAsync(0);
    await createPromise;

    const hostPeer = MockPeer.instances.find((p) => p.id === service.roomCode)!;
    const conn = new MockDataConnection('client-1');
    hostPeer.emit('connection', conn);
    conn.emit('open');

    service.destroy();

    expect(conn.close).toHaveBeenCalled();
    expect(hostPeer.destroy).toHaveBeenCalled();
    expect(service.peerCount).toBe(0);
  });
});
