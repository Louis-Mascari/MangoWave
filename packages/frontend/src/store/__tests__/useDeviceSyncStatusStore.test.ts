import { describe, it, expect } from 'vitest';
import i18n from '../../i18n/index.ts';
import { deviceSyncErrorKey } from '../useDeviceSyncStatusStore.ts';
import type { DeviceSyncErrorCode } from '../../services/DeviceSyncService.ts';

const CODES: DeviceSyncErrorCode[] = [
  'roomNotFound',
  'signalingTimeout',
  'joinTimeout',
  'connectionLost',
  'connectionFailed',
];

describe('deviceSyncErrorKey', () => {
  it.each(CODES)('maps %s to a translated message of its own', (code) => {
    const key = deviceSyncErrorKey(code);
    expect(key).toBe(`sync.deviceSync.${code}`);
    expect(i18n.exists(key, { ns: 'settings' })).toBe(true);
  });

  it('falls back to the generic connection error when there is no code', () => {
    expect(deviceSyncErrorKey(null)).toBe('sync.deviceSync.error');
    expect(i18n.exists('sync.deviceSync.error', { ns: 'settings' })).toBe(true);
  });
});
