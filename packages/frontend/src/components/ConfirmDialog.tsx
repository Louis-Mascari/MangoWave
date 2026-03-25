import { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useConfirmStore } from '../store/useConfirmStore.ts';
import { useFocusTrap } from '../hooks/useFocusTrap.ts';

export function ConfirmDialog() {
  const { t: tc } = useTranslation('common');
  const isOpen = useConfirmStore((s) => s.isOpen);
  const title = useConfirmStore((s) => s.title);
  const message = useConfirmStore((s) => s.message);
  const confirmLabel = useConfirmStore((s) => s.confirmLabel);
  const destructive = useConfirmStore((s) => s.destructive);
  const onConfirm = useConfirmStore((s) => s.onConfirm);
  const close = useConfirmStore((s) => s.close);

  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, isOpen);

  const handleConfirm = useCallback(() => {
    onConfirm?.();
    close();
  }, [onConfirm, close]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, close]);

  if (!isOpen) return null;

  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={close}
    >
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-label={title}
        className="w-full max-w-xs rounded-lg bg-gray-900/95 p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-2 text-sm font-semibold text-white">{title}</h3>
        <p className="mb-4 text-xs leading-relaxed text-white/60">{message}</p>
        <div className="flex justify-end gap-2">
          <button
            onClick={close}
            className="cursor-pointer rounded-lg border-none bg-white/10 px-4 py-1.5 text-xs text-white/70 hover:bg-white/20"
          >
            {tc('cancel')}
          </button>
          <button
            onClick={handleConfirm}
            className={`cursor-pointer rounded-lg border-none px-4 py-1.5 text-xs font-medium text-white ${
              destructive ? 'bg-red-500/80 hover:bg-red-500' : 'bg-orange-500 hover:bg-orange-600'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
