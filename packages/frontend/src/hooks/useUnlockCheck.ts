import { useEffect, useRef } from 'react';
import { useSpotifyStore } from '../store/useSpotifyStore.ts';

async function sha256Hex(text: string): Promise<string> {
  const encoded = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  const bytes = new Uint8Array(digest);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function useUnlockCheck() {
  const setUnlocked = useSpotifyStore((s) => s.setUnlocked);
  const hasChecked = useRef(false);

  useEffect(() => {
    if (hasChecked.current) return;
    hasChecked.current = true;

    const params = new URLSearchParams(window.location.search);
    const unlockValue = params.get('unlock');
    const expectedHash = import.meta.env.VITE_UNLOCK_HASH;

    if (!unlockValue || !expectedHash) return;

    sha256Hex(unlockValue).then((hash) => {
      if (hash === expectedHash) {
        setUnlocked();
      }
      // Strip the unlock param from URL regardless of match
      params.delete('unlock');
      const newSearch = params.toString();
      const newUrl = window.location.pathname + (newSearch ? `?${newSearch}` : '');
      window.history.replaceState({}, '', newUrl);
    });
  }, [setUnlocked]);
}
