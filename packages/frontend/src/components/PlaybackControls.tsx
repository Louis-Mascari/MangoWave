import type { RepeatMode } from '../store/useMediaPlayerStore.ts';

export interface PlaybackAdapter {
  source: 'spotify' | 'local' | 'mic' | 'none';
  isPlaying: boolean;
  canControl: boolean;
  onPlay: () => void;
  onPause: () => void;
  onNext: () => void;
  onPrevious: () => void;
  tooltip?: string;
  shuffle?: boolean;
  repeatMode?: RepeatMode;
  onToggleShuffle?: () => void;
  onCycleRepeat?: () => void;
}

interface PlaybackControlsProps {
  adapter: PlaybackAdapter;
}

export function PlaybackControls({ adapter }: PlaybackControlsProps) {
  const isDisabled = !adapter.canControl;

  return (
    <div className="flex items-center gap-1" title={adapter.tooltip}>
      {adapter.onToggleShuffle != null && (
        <ToggleButton
          onClick={adapter.onToggleShuffle}
          active={adapter.shuffle ?? false}
          label={adapter.shuffle ? 'Disable shuffle' : 'Enable shuffle'}
        >
          🔀
        </ToggleButton>
      )}
      <PlaybackButton onClick={adapter.onPrevious} disabled={isDisabled} label="Previous track">
        ⏮
      </PlaybackButton>
      <PlaybackButton
        onClick={adapter.isPlaying ? adapter.onPause : adapter.onPlay}
        disabled={isDisabled}
        label={adapter.isPlaying ? 'Pause' : 'Play'}
      >
        {adapter.isPlaying ? '⏸' : '▶'}
      </PlaybackButton>
      <PlaybackButton onClick={adapter.onNext} disabled={isDisabled} label="Next track">
        ⏭
      </PlaybackButton>
      {adapter.onCycleRepeat != null && (
        <ToggleButton
          onClick={adapter.onCycleRepeat}
          active={adapter.repeatMode !== 'off'}
          label={`Repeat: ${adapter.repeatMode ?? 'off'}`}
        >
          {adapter.repeatMode === 'one' ? '🔂' : '🔁'}
        </ToggleButton>
      )}
    </div>
  );
}

function PlaybackButton({
  onClick,
  disabled,
  label,
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={`rounded border-none px-2 py-1 text-sm ${
        disabled
          ? 'cursor-not-allowed bg-white/5 text-white/30'
          : 'cursor-pointer bg-white/10 text-white/80 hover:bg-white/20'
      }`}
    >
      {children}
    </button>
  );
}

function ToggleButton({
  onClick,
  active,
  label,
  children,
}: {
  onClick: () => void;
  active: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className={`cursor-pointer rounded border-none px-2 py-1 text-sm ${
        active
          ? 'bg-orange-500/30 text-white hover:bg-orange-500/40'
          : 'bg-white/10 text-white/50 hover:bg-white/20'
      }`}
    >
      {children}
    </button>
  );
}
