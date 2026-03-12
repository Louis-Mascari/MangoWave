import { useState } from 'react';
import { useSpotifyStore } from '../store/useSpotifyStore.ts';
import { useSpotifyProgress } from '../hooks/useSpotifyProgress.ts';
import { useMediaPlayerStore } from '../store/useMediaPlayerStore.ts';
import type { PlaybackAdapter } from './PlaybackControls.tsx';
import { isMobileDevice } from '../utils/isMobileDevice.ts';

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

interface PlaybackPanelProps {
  adapter: PlaybackAdapter;
  onSeek: (time: number) => void;
  volume?: number;
  onVolumeChange?: (volume: number) => void;
  isMuted?: boolean;
  onToggleMute?: () => void;
  isIdle: boolean;
}

/**
 * Seek bar that reads time data from the appropriate store.
 * For Spotify: uses useSpotifyProgress for smooth interpolation, fires seek on pointer-up only.
 * For local: reads from useMediaPlayerStore, fires seek on every change.
 */
function SeekBar({
  source,
  onSeek,
}: {
  source: 'local' | 'spotify';
  onSeek: (time: number) => void;
}) {
  // Spotify progress (smooth interpolation)
  const spotifyNowPlaying = useSpotifyStore((s) => s.nowPlaying);
  const spotifyProgressMs = useSpotifyProgress(
    spotifyNowPlaying?.progressMs ?? 0,
    spotifyNowPlaying?.durationMs ?? 0,
    spotifyNowPlaying?.isPlaying ?? false,
  );

  // Local progress
  const localCurrentTime = useMediaPlayerStore((s) => s.currentTime);
  const localDuration = useMediaPlayerStore((s) => s.duration);

  // Track whether user is actively dragging the Spotify seek bar
  const [seekDragValue, setSeekDragValue] = useState<number | null>(null);

  const isSpotify = source === 'spotify';
  const currentTime = isSpotify ? (seekDragValue ?? spotifyProgressMs / 1000) : localCurrentTime;
  const duration = isSpotify ? (spotifyNowPlaying?.durationMs ?? 0) / 1000 : localDuration;

  if (duration <= 0) return null;

  const seekTooltip = isSpotify ? 'Seek updates may take a moment to sync with Spotify' : undefined;

  return (
    <div className="flex items-center gap-1.5" title={seekTooltip}>
      <span className="text-[10px] tabular-nums text-white/50">{formatTime(currentTime)}</span>
      <input
        type="range"
        min={0}
        max={duration}
        value={currentTime}
        onChange={(e) => {
          const val = Number(e.target.value);
          if (isSpotify) {
            setSeekDragValue(val);
          } else {
            onSeek(val);
          }
        }}
        onPointerUp={() => {
          if (isSpotify && seekDragValue != null) {
            onSeek(seekDragValue);
            setSeekDragValue(null);
          }
        }}
        className={`seek-bar h-1 cursor-pointer appearance-none rounded-full bg-white/20 accent-orange-500 ${
          isMobileDevice ? 'min-w-0 flex-1' : 'w-48'
        }`}
        aria-label="Seek"
      />
      <span className="text-[10px] tabular-nums text-white/50">{formatTime(duration)}</span>
    </div>
  );
}

export function PlaybackPanel({
  adapter,
  onSeek,
  volume,
  onVolumeChange,
  isMuted,
  onToggleMute,
  isIdle,
}: PlaybackPanelProps) {
  const spotifyDeviceName = useSpotifyStore((s) => s.nowPlaying?.deviceName);

  if (adapter.source !== 'local' && adapter.source !== 'spotify') return null;

  const isDisabled = !adapter.canControl;
  const showVolume =
    !isMobileDevice && volume != null && onVolumeChange != null && onToggleMute != null;
  const showDevice = !isMobileDevice && adapter.source === 'spotify' && spotifyDeviceName;

  return (
    <div
      className={`fixed z-[48] transition-opacity duration-500 ${
        isIdle ? 'pointer-events-none opacity-0' : 'opacity-100'
      } ${
        isMobileDevice ? 'bottom-20 left-4 right-4' : 'bottom-14 left-1/2 -translate-x-1/2'
      } rounded-lg bg-black/60 backdrop-blur-sm ${isMobileDevice ? 'px-3 py-2' : 'px-4 py-2'}`}
    >
      <SeekBar source={adapter.source} onSeek={onSeek} />

      {/* Transport row */}
      <div className="mt-1 flex items-center justify-center gap-2">
        {adapter.onToggleShuffle != null && (
          <TransportToggle
            onClick={adapter.onToggleShuffle}
            active={adapter.shuffle ?? false}
            label={adapter.shuffle ? 'Shuffle: on' : 'Shuffle: off'}
          >
            🔀
          </TransportToggle>
        )}
        <TransportButton
          onClick={adapter.onPrevious}
          disabled={isDisabled}
          label="Previous track"
          title={isDisabled ? (adapter.tooltip ?? '') : 'Previous track (J)'}
        >
          ⏮
        </TransportButton>
        <TransportButton
          onClick={adapter.isPlaying ? adapter.onPause : adapter.onPlay}
          disabled={isDisabled}
          label={adapter.isPlaying ? 'Pause' : 'Play'}
          title={
            isDisabled ? (adapter.tooltip ?? '') : adapter.isPlaying ? 'Pause (K)' : 'Play (K)'
          }
          primary
        >
          {adapter.isPlaying ? '⏸' : '▶'}
        </TransportButton>
        <TransportButton
          onClick={adapter.onNext}
          disabled={isDisabled}
          label="Next track"
          title={isDisabled ? (adapter.tooltip ?? '') : 'Next track (L)'}
        >
          ⏭
        </TransportButton>
        {adapter.onCycleRepeat != null && (
          <TransportToggle
            onClick={adapter.onCycleRepeat}
            active={adapter.repeatMode !== 'off'}
            label={
              adapter.repeatMode === 'one'
                ? 'Repeat: one'
                : adapter.repeatMode === 'all'
                  ? 'Repeat: all'
                  : 'Repeat: off'
            }
          >
            {adapter.repeatMode === 'one' ? '🔂' : '🔁'}
          </TransportToggle>
        )}

        {showVolume && (
          <div className="ml-2 flex items-center gap-1">
            <button
              onClick={onToggleMute}
              className="cursor-pointer border-none bg-transparent p-0 text-[10px] text-white/40 hover:text-white/70"
              title={isMuted ? 'Unmute' : 'Mute'}
              aria-label={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? '🔇' : '🔊'}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={volume}
              onChange={(e) => onVolumeChange!(Number(e.target.value))}
              className="seek-bar h-1 w-16 cursor-pointer appearance-none rounded-full bg-white/20 accent-orange-500"
              aria-label="Volume"
            />
          </div>
        )}

        {showDevice && (
          <span
            className="ml-2 max-w-[120px] truncate text-[10px] text-white/30"
            title={`Playing on ${spotifyDeviceName}`}
          >
            {spotifyDeviceName}
          </span>
        )}
      </div>
    </div>
  );
}

function TransportButton({
  onClick,
  disabled,
  label,
  title,
  primary,
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  label: string;
  title: string;
  primary?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={title}
      className={`rounded border-none text-sm ${
        disabled
          ? 'cursor-not-allowed text-white/30'
          : 'cursor-pointer text-white/80 hover:text-white'
      } ${primary ? 'bg-white/15 px-3 py-1' : 'bg-transparent px-1.5 py-1'}`}
    >
      {children}
    </button>
  );
}

function TransportToggle({
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
      title={label}
      className={`cursor-pointer rounded border-none bg-transparent px-1.5 py-1 text-sm ${
        active ? 'text-orange-400' : 'text-white/40 hover:text-white/60'
      }`}
    >
      {children}
    </button>
  );
}
