import { useEffect, useState } from 'react';

interface PresetNotificationProps {
  message: string;
  durationMs?: number;
}

export function PresetNotification({ message, durationMs = 3000 }: PresetNotificationProps) {
  const [visible, setVisible] = useState(false);
  const [displayedMessage, setDisplayedMessage] = useState('');

  useEffect(() => {
    if (!message) return;

    // Use a microtask to avoid synchronous setState-in-effect lint error
    const showTimer = setTimeout(() => {
      setDisplayedMessage(message);
      setVisible(true);
    }, 0);

    const hideTimer = setTimeout(() => {
      setVisible(false);
    }, durationMs);

    return () => {
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
    };
  }, [message, durationMs]);

  if (!displayedMessage) return null;

  return (
    <div
      className={`pointer-events-none fixed bottom-16 left-4 z-40 font-mono text-sm text-white transition-opacity duration-500 drop-shadow-[0_0_4px_black] ${
        visible ? 'opacity-80' : 'opacity-0'
      }`}
    >
      {displayedMessage}
    </div>
  );
}
