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
  prevTrackKey: string | null;
  timer: ReturnType<typeof setTimeout> | null;
  listeners: Set<() => void>;
}

function useAutoShow(
  track: NowPlayingTrackInfo | null,
  songInfoDisplay: 'off' | 'always' | number,
) {
  const storeRef = useRef<AutoShowStore>({
    autoShow: false,
    prevTrackKey: null,
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
    if (!trackKey || trackKey === store.prevTrackKey || songInfoDisplay === 'off') {
      store.prevTrackKey = trackKey;
      return;
    }

    store.prevTrackKey = trackKey;

    if (store.timer) {
      clearTimeout(store.timer);
      store.timer = null;
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
  }, [trackKey, songInfoDisplay]);

  useEffect(() => {
    return () => {
      if (storeRef.current.timer) {
        clearTimeout(storeRef.current.timer);
      }
    };
  }, []);

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
