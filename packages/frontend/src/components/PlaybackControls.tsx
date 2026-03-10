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

const repeatLabels: Record<RepeatMode, string> = {
  off: 'Repeat: off',
  all: 'Repeat all',
  one: 'Repeat one',
};

const defaultTooltips: Record<PlaybackAdapter['source'], string> = {
  local: 'Add songs to your queue',
  mic: 'Microphone input — no playback controls',
  spotify: 'Playback controls unavailable',
  none: 'Sharing audio — no playback controls',
};

export function PlaybackControls({ adapter }: PlaybackControlsProps) {
  const isDisabled = !adapter.canControl;
  const disabledTooltip = adapter.tooltip ?? defaultTooltips[adapter.source];

  return (
    <div className="flex items-center gap-1">
      {adapter.onToggleShuffle != null && (
        <ToggleButton
          onClick={adapter.onToggleShuffle}
          active={adapter.shuffle ?? false}
          label={adapter.shuffle ? 'Disable shuffle' : 'Enable shuffle'}
          title={adapter.shuffle ? 'Shuffle: on' : 'Shuffle: off'}
        >
          🔀
        </ToggleButton>
      )}
      <PlaybackButton
        onClick={adapter.onPrevious}
        disabled={isDisabled}
        label="Previous track"
        title={isDisabled ? disabledTooltip : 'Previous track'}
      >
        ⏮
      </PlaybackButton>
      <PlaybackButton
        onClick={adapter.isPlaying ? adapter.onPause : adapter.onPlay}
        disabled={isDisabled}
        label={adapter.isPlaying ? 'Pause' : 'Play'}
        title={isDisabled ? disabledTooltip : adapter.isPlaying ? 'Pause' : 'Play'}
      >
        {adapter.isPlaying ? '⏸' : '▶'}
      </PlaybackButton>
      <PlaybackButton
        onClick={adapter.onNext}
        disabled={isDisabled}
        label="Next track"
        title={isDisabled ? disabledTooltip : 'Next track'}
      >
        ⏭
      </PlaybackButton>
      {adapter.onCycleRepeat != null && (
        <ToggleButton
          onClick={adapter.onCycleRepeat}
          active={adapter.repeatMode !== 'off'}
          label={repeatLabels[adapter.repeatMode ?? 'off']}
          title={repeatLabels[adapter.repeatMode ?? 'off']}
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
  title,
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  label: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={title}
      className={`rounded border-none px-2.5 py-1.5 text-base ${
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
  title,
  children,
}: {
  onClick: () => void;
  active: boolean;
  label: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={title}
      className={`cursor-pointer rounded border-none px-2.5 py-1.5 text-base ${
        active
          ? 'bg-orange-500/30 text-white hover:bg-orange-500/40'
          : 'bg-white/10 text-white/50 hover:bg-white/20'
      }`}
    >
      {children}
    </button>
  );
}
