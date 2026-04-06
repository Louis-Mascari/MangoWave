import { useTranslation } from 'react-i18next';
import type { RepeatMode } from '../store/useMediaPlayerStore.ts';
import {
  PlayIcon,
  PauseIcon,
  PreviousTrackIcon,
  NextTrackIcon,
  ShuffleIcon,
  RepeatIcon,
  RepeatOneIcon,
} from './icons.tsx';

export interface PlaybackAdapter {
  source: 'spotify' | 'local' | 'mic' | 'system' | 'none';
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

const repeatLabelKeys: Record<RepeatMode, string> = {
  off: 'playback.repeatOff',
  all: 'playback.repeatAll',
  one: 'playback.repeatOne',
};

const defaultTooltipKeys: Record<PlaybackAdapter['source'], string> = {
  local: 'playback.addSongsToQueue',
  mic: 'playback.micNoControls',
  system: 'playback.sharingNoControls',
  spotify: 'playback.controlsUnavailable',
  none: 'playback.sharingNoControls',
};

export function PlaybackControls({ adapter }: PlaybackControlsProps) {
  const { t } = useTranslation('messages');
  const isDisabled = !adapter.canControl;
  const disabledTooltip = adapter.tooltip ?? t(defaultTooltipKeys[adapter.source]);

  return (
    <div className="flex items-center gap-1">
      {adapter.onToggleShuffle != null && (
        <ToggleButton
          onClick={adapter.onToggleShuffle}
          active={adapter.shuffle ?? false}
          label={adapter.shuffle ? t('playback.disableShuffle') : t('playback.enableShuffle')}
          title={adapter.shuffle ? t('playback.shuffleOn') : t('playback.shuffleOff')}
        >
          <ShuffleIcon className="h-3.5 w-3.5" />
        </ToggleButton>
      )}
      <PlaybackButton
        onClick={adapter.onPrevious}
        disabled={isDisabled}
        label={t('playback.previousTrack')}
        title={isDisabled ? disabledTooltip : t('playback.previousTrackShortcut')}
      >
        <PreviousTrackIcon className="h-3.5 w-3.5" />
      </PlaybackButton>
      <PlaybackButton
        onClick={adapter.isPlaying ? adapter.onPause : adapter.onPlay}
        disabled={isDisabled}
        label={adapter.isPlaying ? t('playback.pause') : t('playback.play')}
        title={
          isDisabled
            ? disabledTooltip
            : adapter.isPlaying
              ? t('playback.pauseShortcut')
              : t('playback.playShortcut')
        }
      >
        {adapter.isPlaying ? (
          <PauseIcon className="h-3.5 w-3.5" />
        ) : (
          <PlayIcon className="h-3.5 w-3.5" />
        )}
      </PlaybackButton>
      <PlaybackButton
        onClick={adapter.onNext}
        disabled={isDisabled}
        label={t('playback.nextTrack')}
        title={isDisabled ? disabledTooltip : t('playback.nextTrackShortcut')}
      >
        <NextTrackIcon className="h-3.5 w-3.5" />
      </PlaybackButton>
      {adapter.onCycleRepeat != null && (
        <ToggleButton
          onClick={adapter.onCycleRepeat}
          active={adapter.repeatMode !== 'off'}
          label={t(repeatLabelKeys[adapter.repeatMode ?? 'off'])}
          title={t(repeatLabelKeys[adapter.repeatMode ?? 'off'])}
        >
          {adapter.repeatMode === 'one' ? (
            <RepeatOneIcon className="h-3.5 w-3.5" />
          ) : (
            <RepeatIcon className="h-3.5 w-3.5" />
          )}
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
