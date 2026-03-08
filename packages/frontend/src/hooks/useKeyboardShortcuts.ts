import { useCallback, useEffect, useState } from 'react';

interface KeyboardHandlers {
  onNextPreset: () => void;
  onToggleFullscreen: () => void;
  onClosePanel: () => void;
  onToggleAutopilot: () => void;
}

export function useKeyboardShortcuts(handlers: KeyboardHandlers) {
  const [showShortcutOverlay, setShowShortcutOverlay] = useState(false);

  const toggleShortcutOverlay = useCallback(() => {
    setShowShortcutOverlay((prev) => !prev);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if typing in an input
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      // Skip if modifier keys held
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      switch (e.key) {
        case ' ':
          e.preventDefault();
          handlers.onNextPreset();
          break;
        case 'n':
        case 'N':
          handlers.onNextPreset();
          break;
        case 'f':
        case 'F':
          handlers.onToggleFullscreen();
          break;
        case 'Escape':
          if (showShortcutOverlay) {
            setShowShortcutOverlay(false);
          } else {
            handlers.onClosePanel();
          }
          break;
        case 'a':
        case 'A':
          handlers.onToggleAutopilot();
          break;
        case '?':
        case 'h':
        case 'H':
          setShowShortcutOverlay((prev) => !prev);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlers, showShortcutOverlay]);

  return { showShortcutOverlay, toggleShortcutOverlay };
}
