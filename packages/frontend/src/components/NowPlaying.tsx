import { useSpotifyStore } from '../store/useSpotifyStore.ts';
import { useNowPlaying } from '../hooks/useNowPlaying.ts';

interface NowPlayingProps {
  visible: boolean;
}

export function NowPlaying({ visible }: NowPlayingProps) {
  useNowPlaying(visible);

  const nowPlaying = useSpotifyStore((s) => s.nowPlaying);

  if (!visible || !nowPlaying) return null;

  return (
    <div className="pointer-events-none fixed left-4 top-4 z-40 flex max-w-xs items-center gap-3 rounded-lg bg-black/70 p-3 backdrop-blur-sm">
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
    </div>
  );
}
