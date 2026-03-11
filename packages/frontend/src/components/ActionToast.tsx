import { useToastStore } from '../store/useToastStore.ts';

export function ActionToast() {
  const message = useToastStore((s) => s.message);
  const key = useToastStore((s) => s.key);

  if (!message) return null;

  return (
    <div
      key={key}
      className="action-toast fixed bottom-20 left-1/2 z-[60] -translate-x-1/2 rounded-full bg-white/10 px-4 py-1.5 text-xs text-white/80 backdrop-blur"
    >
      {message}
    </div>
  );
}
