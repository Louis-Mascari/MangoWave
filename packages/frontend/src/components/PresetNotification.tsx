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
      data-testid="preset-name"
      className={`font-mono text-sm text-white transition-all duration-500 drop-shadow-[0_0_4px_black] ${visible || isAlways ? 'max-h-8 opacity-80' : 'max-h-0 opacity-0 overflow-hidden'}`}
    >
      {message}
    </div>
  );
}
