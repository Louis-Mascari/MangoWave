import { useEffect, useRef, useSyncExternalStore } from 'react';
import { useSpotifyStore } from '../store/useSpotifyStore.ts';

function useCountdown(resetsAt: number | null): number {
  const resetsAtRef = useRef(resetsAt);

  useEffect(() => {
    resetsAtRef.current = resetsAt;
  }, [resetsAt]);

  return useSyncExternalStore(
    (onStoreChange) => {
      const interval = setInterval(onStoreChange, 1000);
      return () => clearInterval(interval);
    },
    () => {
      if (!resetsAtRef.current) return 0;
      return Math.max(0, Math.ceil((resetsAtRef.current - Date.now()) / 1000));
    },
  );
}

export function RateLimitToast() {
  const isRateLimited = useSpotifyStore((s) => s.isRateLimited);
  const rateLimitResetsAt = useSpotifyStore((s) => s.rateLimitResetsAt);
  const secondsLeft = useCountdown(rateLimitResetsAt);

  if (!isRateLimited) return null;

  return (
    <div className="fixed right-4 top-4 z-50 rounded-lg bg-amber-500/90 px-4 py-2 text-sm font-medium text-black shadow-lg backdrop-blur-sm">
      Spotify rate limited — retrying in {secondsLeft}s
    </div>
  );
}
