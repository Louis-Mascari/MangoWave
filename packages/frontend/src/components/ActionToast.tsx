import { useToastStore } from '../store/useToastStore.ts';
import type { ToastType } from '../store/useToastStore.ts';

const typeStyles: Record<ToastType, string> = {
  info: 'rounded-full bg-white/10 text-white/80',
  error: 'rounded-lg bg-red-500/20 text-red-200 border border-red-500/30',
  warning: 'rounded-lg bg-amber-500/20 text-amber-200 border border-amber-500/30',
};

export function ActionToast() {
  const message = useToastStore((s) => s.message);
  const type = useToastStore((s) => s.type);
  const key = useToastStore((s) => s.key);

  if (!message) return null;

  return (
    <div
      key={key}
      className={`action-toast fixed bottom-20 left-1/2 z-[60] max-w-sm -translate-x-1/2 px-4 py-1.5 text-center text-xs backdrop-blur ${typeStyles[type]}`}
    >
      {message}
    </div>
  );
}
