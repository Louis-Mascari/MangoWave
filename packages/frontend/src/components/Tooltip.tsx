import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface TooltipPosition {
  top: number;
  left: number;
  flipped: boolean;
}

export function Tooltip({ text }: { text: string }) {
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState<TooltipPosition>({ top: 0, left: 0, flipped: false });

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const tooltipWidth = 192; // w-48 = 12rem = 192px
    const margin = 4;

    let left = rect.left + rect.width / 2 - tooltipWidth / 2;
    left = Math.max(margin, Math.min(left, window.innerWidth - tooltipWidth - margin));

    let top = rect.top - margin;
    let flipped = false;

    // If tooltip would go above viewport, show below instead
    if (top < 40) {
      top = rect.bottom + margin;
      flipped = true;
    }

    setPosition({ top, left, flipped });
  }, []);

  const show = useCallback(() => {
    updatePosition();
    setVisible(true);
  }, [updatePosition]);

  const handlePointerEnter = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType === 'mouse') show();
    },
    [show],
  );

  const handlePointerLeave = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === 'mouse') setVisible(false);
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') setVisible(false);
  }, []);

  // Dismiss on outside tap/click or scroll
  useEffect(() => {
    if (!visible) return;
    const dismiss = (e: PointerEvent) => {
      if (triggerRef.current?.contains(e.target as Node)) return;
      setVisible(false);
    };
    const hide = () => setVisible(false);
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('scroll', hide, true);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('scroll', hide, true);
    };
  }, [visible]);

  return (
    <button
      ref={triggerRef}
      type="button"
      className="ml-1 inline-flex cursor-help border-none bg-transparent p-0 max-sm:p-2 max-sm:-m-2"
      aria-describedby={id}
      onClick={show}
      onKeyDown={handleKeyDown}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        className="h-3.5 w-3.5 text-white/40"
        aria-hidden="true"
      >
        <path
          fillRule="evenodd"
          d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z"
          clipRule="evenodd"
        />
      </svg>
      {visible &&
        createPortal(
          <span
            id={id}
            role="tooltip"
            className="pointer-events-none fixed z-[70] w-48 rounded border border-orange-400/50 bg-gray-900 px-2 py-1 text-center text-xs leading-snug text-white/80 shadow-lg"
            style={{
              top: position.top,
              left: position.left,
              transform: position.flipped ? undefined : 'translateY(-100%)',
            }}
          >
            {text}
          </span>,
          document.body,
        )}
    </button>
  );
}
