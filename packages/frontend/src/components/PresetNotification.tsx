import { useEffect, useState } from 'react';

interface PresetNotificationProps {
  message: string;
  durationMs?: number;
}

export function PresetNotification({ message, durationMs = 3000 }: PresetNotificationProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!message) return;

    // Defer setState to satisfy React 19's set-state-in-effect rule.
    // setTimeout ordering guarantees the 0ms fires before durationMs.
    const showTimer = setTimeout(() => {
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

  if (!message) return null;

  return (
    <div
      className={`pointer-events-none fixed bottom-16 left-4 z-40 font-mono text-sm text-white transition-opacity duration-500 drop-shadow-[0_0_4px_black] ${
        visible ? 'opacity-80' : 'opacity-0'
      }`}
    >
      {message}
    </div>
  );
}
