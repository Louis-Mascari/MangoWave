import { useCallback, useState } from 'react';
import { useSpotifyStore } from '../store/useSpotifyStore.ts';
import {
  controlPlayback,
  PremiumRequiredError,
  TokenExpiredError,
  refreshToken,
} from '../services/spotifyApi.ts';

export function PlaybackControls() {
  const accessToken = useSpotifyStore((s) => s.accessToken);
  const sessionId = useSpotifyStore((s) => s.sessionId);
  const nowPlaying = useSpotifyStore((s) => s.nowPlaying);
  const premiumError = useSpotifyStore((s) => s.premiumError);
  const setPremiumError = useSpotifyStore((s) => s.setPremiumError);
  const setAccessToken = useSpotifyStore((s) => s.setAccessToken);
  const logout = useSpotifyStore((s) => s.logout);
  const [loading, setLoading] = useState(false);

  const isConnected = !!accessToken;
  const isDisabled = !isConnected || premiumError || loading;

  const handleAction = useCallback(
    async (action: 'play' | 'pause' | 'next' | 'previous') => {
      if (!accessToken || !sessionId) return;
      setLoading(true);

      try {
        await controlPlayback(accessToken, action);
      } catch (err) {
        if (err instanceof PremiumRequiredError) {
          setPremiumError(true);
        } else if (err instanceof TokenExpiredError) {
          try {
            const result = await refreshToken(sessionId);
            setAccessToken(result.accessToken, result.expiresIn);
            await controlPlayback(result.accessToken, action);
          } catch {
            logout();
          }
        }
      } finally {
        setLoading(false);
      }
    },
    [accessToken, sessionId, setPremiumError, setAccessToken, logout],
  );

  const tooltipText = !isConnected
    ? 'Connect Spotify to use playback controls'
    : premiumError
      ? 'Spotify Premium required for playback controls'
      : undefined;

  return (
    <div className="flex items-center gap-1" title={tooltipText}>
      <PlaybackButton
        onClick={() => handleAction('previous')}
        disabled={isDisabled}
        label="Previous track"
      >
        ⏮
      </PlaybackButton>
      <PlaybackButton
        onClick={() => handleAction(nowPlaying?.isPlaying ? 'pause' : 'play')}
        disabled={isDisabled}
        label={nowPlaying?.isPlaying ? 'Pause' : 'Play'}
      >
        {nowPlaying?.isPlaying ? '⏸' : '▶'}
      </PlaybackButton>
      <PlaybackButton onClick={() => handleAction('next')} disabled={isDisabled} label="Next track">
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
