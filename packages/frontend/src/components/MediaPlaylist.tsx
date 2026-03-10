import { useRef } from 'react';
import { useMediaPlayerStore } from '../store/useMediaPlayerStore.ts';

function formatDuration(seconds: number): string {
  if (!seconds || !isFinite(seconds)) return '--:--';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

interface MediaPlaylistProps {
  onAddFiles: (files: File[]) => void;
}

export function MediaPlaylist({ onAddFiles }: MediaPlaylistProps) {
  const tracks = useMediaPlayerStore((s) => s.tracks);
  const currentTrackIndex = useMediaPlayerStore((s) => s.currentTrackIndex);
  const setCurrentTrack = useMediaPlayerStore((s) => s.setCurrentTrack);
  const removeTrack = useMediaPlayerStore((s) => s.removeTrack);
  const clearPlaylist = useMediaPlayerStore((s) => s.clearPlaylist);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAddClick = () => {
    fileInputRef.current?.click();
  };

  const handleFilesChosen = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length > 0) {
      onAddFiles(files);
    }
    e.target.value = '';
  };

  return (
    <div className="flex max-h-80 flex-col gap-2 rounded-lg bg-black/60 p-4 backdrop-blur-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">Playlist</h3>
        <div className="flex gap-2">
          <button
            onClick={handleAddClick}
            className="cursor-pointer rounded border-none bg-white/10 px-2 py-1 text-xs text-white/70 hover:bg-white/20"
          >
            Add Files
          </button>
          <button
            onClick={clearPlaylist}
            className="cursor-pointer rounded border-none bg-white/10 px-2 py-1 text-xs text-red-400/70 hover:bg-white/20"
          >
            Clear
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-0.5 overflow-y-auto">
        {tracks.map((track, index) => (
          <div
            key={track.id}
            className={`flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs transition-colors ${
              index === currentTrackIndex
                ? 'bg-orange-500/20 text-white'
                : 'text-white/70 hover:bg-white/10'
            }`}
            onClick={() => setCurrentTrack(index)}
          >
            <span className="min-w-0 flex-1 truncate">{track.name}</span>
            <span className="shrink-0 text-white/40">{formatDuration(track.duration)}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                removeTrack(track.id);
              }}
              className="shrink-0 cursor-pointer rounded border-none bg-transparent px-1 text-white/30 hover:text-red-400"
              aria-label={`Remove ${track.name}`}
            >
              ×
            </button>
          </div>
        ))}
        {tracks.length === 0 && (
          <p className="py-4 text-center text-xs text-white/30">No tracks loaded</p>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="audio/*"
        onChange={handleFilesChosen}
        className="hidden"
      />
    </div>
  );
}
