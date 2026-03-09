import { useEffect, useState } from 'react';

interface PresetNotificationProps {
  message: string;
  mode: 'always' | number; // 'always' or duration in seconds
}

export function PresetNotification({ message, mode }: PresetNotificationProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!message) return;

    // Defer setState to satisfy React 19's set-state-in-effect rule.
    // setTimeout ordering guarantees the 0ms fires before durationMs.
    const showTimer = setTimeout(() => {
      setVisible(true);
    }, 0);

    let hideTimer: ReturnType<typeof setTimeout> | undefined;
    if (mode !== 'always') {
      hideTimer = setTimeout(() => {
        setVisible(false);
      }, mode * 1000);
    }

    return () => {
      clearTimeout(showTimer);
      if (hideTimer !== undefined) clearTimeout(hideTimer);
    };
  }, [message, mode]);

  if (!message) return null;

  const isAlways = mode === 'always';

  return (
    <div
      className={`pointer-events-none fixed bottom-16 left-4 z-40 font-mono text-sm text-white transition-opacity duration-500 drop-shadow-[0_0_4px_black] ${
        visible || isAlways ? 'opacity-80' : 'opacity-0'
      }`}
    >
      {message}
    </div>
  );
}
