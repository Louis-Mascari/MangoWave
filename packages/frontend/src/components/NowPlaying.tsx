import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useSpotifyStore } from '../store/useSpotifyStore.ts';

interface NowPlayingProps {
  visible: boolean;
  songInfoDisplay: 'off' | 'always' | number;
}

/**
 * Subscribes to store changes to derive auto-show state without
 * calling setState inside an effect (avoids react-hooks/set-state-in-effect).
 */
function useAutoShow(songInfoDisplay: 'off' | 'always' | number) {
  const [autoShow, setAutoShow] = useState(false);
  const prevTrackKeyRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Subscribe to nowPlaying changes via useSyncExternalStore to
  // derive the trackKey and trigger auto-show from subscription callback
  const trackKey = useSyncExternalStore(
    (onStoreChange) => {
      return useSpotifyStore.subscribe((state, prevState) => {
        const newKey = state.nowPlaying
          ? `${state.nowPlaying.title}|${state.nowPlaying.artist}`
          : null;
        const oldKey = prevState.nowPlaying
          ? `${prevState.nowPlaying.title}|${prevState.nowPlaying.artist}`
          : null;

        if (newKey && newKey !== oldKey && songInfoDisplay !== 'off') {
          // Clear any existing timer
          if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
          }

          setAutoShow(true);

          if (typeof songInfoDisplay === 'number') {
            timerRef.current = setTimeout(() => {
              setAutoShow(false);
              timerRef.current = null;
            }, songInfoDisplay * 1000);
          }
        }

        onStoreChange();
      });
    },
    () => {
      const np = useSpotifyStore.getState().nowPlaying;
      return np ? `${np.title}|${np.artist}` : null;
    },
  );

  // Track initial mount — set prevTrackKeyRef without triggering auto-show
  useEffect(() => {
    prevTrackKeyRef.current = trackKey;
  }, [trackKey]);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  return autoShow;
}

export function NowPlaying({ visible, songInfoDisplay }: NowPlayingProps) {
  const nowPlaying = useSpotifyStore((s) => s.nowPlaying);
  const autoShow = useAutoShow(songInfoDisplay);

  const shouldShow = (visible || autoShow) && nowPlaying;

  return (
    <div
      className={`pointer-events-none fixed left-4 top-4 z-40 flex max-w-xs items-center gap-3 rounded-lg bg-black/70 p-3 backdrop-blur-sm transition-opacity duration-500 ${
        shouldShow ? 'opacity-100' : 'opacity-0'
      }`}
    >
      {nowPlaying && (
        <>
          {nowPlaying.albumArtUrl && (
            <img
              src={nowPlaying.albumArtUrl}
              alt={nowPlaying.albumName}
              className="h-14 w-14 rounded shadow-lg"
            />
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">{nowPlaying.title}</p>
            <p className="truncate text-xs text-white/70">{nowPlaying.artist}</p>
            <p className="truncate text-xs text-white/50">{nowPlaying.albumName}</p>
          </div>
        </>
      )}
    </div>
  );
}
