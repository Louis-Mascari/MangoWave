import { useEffect } from 'react';
import { useIdleTimer } from './useIdleTimer.ts';
import { FULLSCREEN_CHANGE_EVENT, getFullscreenElement } from '../utils/fullscreen.ts';

/**
 * Hides the cursor after idle timeout when in fullscreen.
 */
export function useHideCursor(timeoutMs = 3000): void {
  const { isIdle } = useIdleTimer(timeoutMs);

  useEffect(() => {
    if (isIdle && getFullscreenElement()) {
      document.documentElement.style.cursor = 'none';
    } else {
      document.documentElement.style.cursor = '';
    }

    const handleFullscreenChange = () => {
      if (!getFullscreenElement()) {
        document.documentElement.style.cursor = '';
      }
    };

    document.addEventListener(FULLSCREEN_CHANGE_EVENT, handleFullscreenChange);
    return () => {
      document.documentElement.style.cursor = '';
      document.removeEventListener(FULLSCREEN_CHANGE_EVENT, handleFullscreenChange);
    };
  }, [isIdle]);
}
