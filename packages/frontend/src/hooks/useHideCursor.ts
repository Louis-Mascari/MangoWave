import { useEffect } from 'react';
import { useIdleTimer } from './useIdleTimer.ts';

/**
 * Hides the cursor after idle timeout when in fullscreen.
 */
export function useHideCursor(timeoutMs = 3000): void {
  const { isIdle } = useIdleTimer(timeoutMs);

  useEffect(() => {
    if (isIdle && document.fullscreenElement) {
      document.documentElement.style.cursor = 'none';
    } else {
      document.documentElement.style.cursor = '';
    }

    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) {
        document.documentElement.style.cursor = '';
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.documentElement.style.cursor = '';
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, [isIdle]);
}
