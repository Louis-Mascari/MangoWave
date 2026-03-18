import quarantinedData from './quarantined-presets.json';
import mobileBlockedData from './mobile-blocked-presets.json';

export const quarantinedSet = new Set(quarantinedData.presets as string[]);
export const mobileBlockedSet = new Set(mobileBlockedData.presets as string[]);
