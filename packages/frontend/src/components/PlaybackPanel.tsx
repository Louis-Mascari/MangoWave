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
  onPauseIdle: () => void;
  onResumeIdle: () => void;
  nowPlayingEnabled: boolean;
  onToggleNowPlaying: () => void;
  onToggleQueue?: () => void;
  isQueueOpen?: boolean;
  hidden?: boolean;
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
        className="seek-bar h-1 min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-white/20 accent-orange-500"
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
  onPauseIdle,
  onResumeIdle,
  nowPlayingEnabled,
  onToggleNowPlaying,
  onToggleQueue,
  isQueueOpen,
  hidden,
}: PlaybackPanelProps) {
  const spotifyDeviceName = useSpotifyStore((s) => s.nowPlaying?.deviceName);

  if (adapter.source !== 'local' && adapter.source !== 'spotify') return null;
  if (hidden) return null;

  const isDisabled = !adapter.canControl;
  const showVolume = volume != null && onVolumeChange != null && onToggleMute != null;
  const showDevice = !isMobileDevice && adapter.source === 'spotify' && spotifyDeviceName;
  const showQueue = adapter.source === 'local' && onToggleQueue;

  const hasShuffle = adapter.onToggleShuffle != null;
  const hasRepeat = adapter.onCycleRepeat != null;

  // Shared button elements
  const prevBtn = (
    <TransportButton
      onClick={adapter.onPrevious}
      disabled={isDisabled}
      label="Previous track"
      title={isDisabled ? (adapter.tooltip ?? '') : 'Previous track (J)'}
    >
      ⏮
    </TransportButton>
  );

  const playBtn = (
    <TransportButton
      onClick={adapter.isPlaying ? adapter.onPause : adapter.onPlay}
      disabled={isDisabled}
      label={adapter.isPlaying ? 'Pause' : 'Play'}
      title={isDisabled ? (adapter.tooltip ?? '') : adapter.isPlaying ? 'Pause (K)' : 'Play (K)'}
      primary
    >
      {adapter.isPlaying ? '⏸' : '▶'}
    </TransportButton>
  );

  const nextBtn = (
    <TransportButton
      onClick={adapter.onNext}
      disabled={isDisabled}
      label="Next track"
      title={isDisabled ? (adapter.tooltip ?? '') : 'Next track (L)'}
    >
      ⏭
    </TransportButton>
  );

  const shuffleBtn = hasShuffle ? (
    <TransportToggle
      onClick={adapter.onToggleShuffle!}
      active={adapter.shuffle ?? false}
      label={adapter.shuffle ? 'Shuffle: on' : 'Shuffle: off'}
    >
      🔀
    </TransportToggle>
  ) : null;

  const repeatBtn = hasRepeat ? (
    <TransportToggle
      onClick={adapter.onCycleRepeat!}
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
  ) : null;

  const nowPlayingBtn = (
    <TransportToggle
      onClick={onToggleNowPlaying}
      active={nowPlayingEnabled}
      label={
        nowPlayingEnabled
          ? 'Now Playing: on (shows 5s per track)'
          : 'Now Playing: off (shows 5s per track)'
      }
    >
      <svg
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        className="h-4 w-4"
      >
        <path d="M7 4v12l10-6z" />
        <rect x="1" y="6" width="4" height="8" rx="0.5" />
      </svg>
    </TransportToggle>
  );

  const queueBtn = showQueue ? (
    <TransportToggle onClick={onToggleQueue} active={isQueueOpen ?? false} label="Queue (Q)">
      <svg
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="h-4 w-4"
      >
        <line x1="3" y1="5" x2="17" y2="5" />
        <line x1="3" y1="10" x2="17" y2="10" />
        <line x1="3" y1="15" x2="13" y2="15" />
      </svg>
    </TransportToggle>
  ) : null;

  const volumeControl = showVolume ? (
    <div className="flex items-center gap-1">
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
  ) : null;

  const deviceLabel = showDevice ? (
    <span
      className="ml-1 max-w-[120px] truncate text-[10px] text-white/30"
      title={`Playing on ${spotifyDeviceName}`}
    >
      {spotifyDeviceName}
    </span>
  ) : null;

  return (
    <div
      onMouseEnter={onPauseIdle}
      onMouseLeave={onResumeIdle}
      className={`fixed z-[48] transition-opacity duration-500 ${
        isIdle ? 'pointer-events-none opacity-0' : 'opacity-100'
      } ${
        isMobileDevice ? 'bottom-24 left-4 right-4' : 'bottom-16 left-1/2 -translate-x-1/2'
      } rounded-lg bg-black/60 backdrop-blur-sm ${isMobileDevice ? 'px-3 py-2' : 'px-4 py-2'}`}
    >
      <SeekBar source={adapter.source} onSeek={onSeek} />

      {/* Controls: wraps responsively. Core transport stays together,
          secondary group (shuffle/repeat/nowplaying/queue) wraps as a unit,
          volume wraps last */}
      <div className="mt-1 flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
        {/* Core transport — stays together */}
        <div className="flex items-center gap-2">
          {prevBtn}
          {playBtn}
          {nextBtn}
        </div>
        {/* Secondary controls — wraps as a group */}
        <div className="flex items-center gap-2">
          {shuffleBtn}
          {repeatBtn}
          {nowPlayingBtn}
          {queueBtn}
        </div>
        {/* Volume — wraps independently as last resort */}
        {volumeControl}
        {deviceLabel}
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
