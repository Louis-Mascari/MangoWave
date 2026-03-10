import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';

export interface NowPlayingTrackInfo {
  title: string;
  artist: string;
  albumName: string;
  albumArtUrl: string | null;
}

interface NowPlayingProps {
  visible: boolean;
  songInfoDisplay: 'off' | 'always' | number;
  track: NowPlayingTrackInfo | null;
}

interface AutoShowStore {
  autoShow: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  listeners: Set<() => void>;
}

/**
 * Triggers auto-show on track change with optional timed auto-hide.
 * StrictMode-safe: cleanup clears the timer and the re-run restarts it.
 */
function useAutoShow(
  track: NowPlayingTrackInfo | null,
  songInfoDisplay: 'off' | 'always' | number,
) {
  const storeRef = useRef<AutoShowStore>({
    autoShow: false,
    timer: null,
    listeners: new Set(),
  });

  const trackKey = track ? `${track.title}|${track.artist}` : null;

  const subscribe = useCallback((listener: () => void) => {
    storeRef.current.listeners.add(listener);
    return () => {
      storeRef.current.listeners.delete(listener);
    };
  }, []);

  const getSnapshot = useCallback(() => storeRef.current.autoShow, []);

  useEffect(() => {
    const store = storeRef.current;

    if (store.timer) {
      clearTimeout(store.timer);
      store.timer = null;
    }

    if (!trackKey || songInfoDisplay === 'off') {
      if (store.autoShow) {
        store.autoShow = false;
        store.listeners.forEach((l) => l());
      }
      return;
    }

    store.autoShow = true;
    store.listeners.forEach((l) => l());

    if (typeof songInfoDisplay === 'number') {
      store.timer = setTimeout(() => {
        store.autoShow = false;
        store.timer = null;
        store.listeners.forEach((l) => l());
      }, songInfoDisplay * 1000);
    }

    return () => {
      if (store.timer) {
        clearTimeout(store.timer);
        store.timer = null;
      }
    };
  }, [trackKey, songInfoDisplay]);

  return useSyncExternalStore(subscribe, getSnapshot);
}

export function NowPlaying({ visible, songInfoDisplay, track }: NowPlayingProps) {
  const autoShow = useAutoShow(track, songInfoDisplay);
  const shouldShow = (visible || autoShow) && track;

  return (
    <div
      className={`pointer-events-none fixed left-4 top-4 z-40 flex max-w-xs items-center gap-3 rounded-lg bg-black/70 p-3 backdrop-blur-sm transition-opacity duration-500 ${
        shouldShow ? 'opacity-100' : 'opacity-0'
      }`}
    >
      {track && (
        <>
          {track.albumArtUrl && (
            <img
              src={track.albumArtUrl}
              alt={track.albumName}
              className="h-14 w-14 rounded shadow-lg"
            />
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">{track.title}</p>
            <p className="truncate text-xs text-white/70">{track.artist}</p>
            {track.albumName && <p className="truncate text-xs text-white/50">{track.albumName}</p>}
          </div>
        </>
      )}
    </div>
  );
}
