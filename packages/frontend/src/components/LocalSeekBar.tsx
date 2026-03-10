import { useMediaPlayerStore } from '../store/useMediaPlayerStore.ts';

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

interface LocalSeekBarProps {
  onSeek: (time: number) => void;
  onVolumeChange: (volume: number) => void;
  volume: number;
}

export function LocalSeekBar({ onSeek, onVolumeChange, volume }: LocalSeekBarProps) {
  const currentTime = useMediaPlayerStore((s) => s.currentTime);
  const duration = useMediaPlayerStore((s) => s.duration);

  if (!duration || duration <= 0) return null;

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] tabular-nums text-white/50">{formatTime(currentTime)}</span>
      <input
        type="range"
        min={0}
        max={duration}
        value={currentTime}
        onChange={(e) => onSeek(Number(e.target.value))}
        className="seek-bar h-1 w-24 cursor-pointer appearance-none rounded-full bg-white/20 accent-orange-500"
        aria-label="Seek"
      />
      <span className="text-[10px] tabular-nums text-white/50">{formatTime(duration)}</span>
      <span className="ml-1 text-[10px] text-white/40" title="Volume">
        🔊
      </span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={volume}
        onChange={(e) => onVolumeChange(Number(e.target.value))}
        className="seek-bar h-1 w-16 cursor-pointer appearance-none rounded-full bg-white/20 accent-orange-500"
        aria-label="Volume"
      />
    </div>
  );
}
