export interface PlaybackAdapter {
  source: 'spotify' | 'local' | 'mic' | 'none';
  isPlaying: boolean;
  canControl: boolean;
  onPlay: () => void;
  onPause: () => void;
  onNext: () => void;
  onPrevious: () => void;
  tooltip?: string;
}

interface PlaybackControlsProps {
  adapter: PlaybackAdapter;
}

export function PlaybackControls({ adapter }: PlaybackControlsProps) {
  const isDisabled = !adapter.canControl;

  return (
    <div className="flex items-center gap-1" title={adapter.tooltip}>
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
