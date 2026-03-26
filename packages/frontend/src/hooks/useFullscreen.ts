import { useEffect, useState } from 'react';
import { FULLSCREEN_CHANGE_EVENT, getFullscreenElement } from '../utils/fullscreen.ts';

export function useFullscreen(): boolean {
  const [isFullscreen, setIsFullscreen] = useState(!!getFullscreenElement());

  useEffect(() => {
    const handler = () => setIsFullscreen(!!getFullscreenElement());
    document.addEventListener(FULLSCREEN_CHANGE_EVENT, handler);
    return () => document.removeEventListener(FULLSCREEN_CHANGE_EVENT, handler);
  }, []);

  return isFullscreen;
}
