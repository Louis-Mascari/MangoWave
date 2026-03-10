interface ShortcutOverlayProps {
  visible: boolean;
  onClose: () => void;
}

const SHORTCUTS = [
  { key: 'Space / N', action: 'Next preset' },
  { key: 'F', action: 'Toggle fullscreen' },
  { key: 'A', action: 'Toggle autopilot' },
  { key: 'S', action: 'Toggle favorite' },
  { key: 'B', action: 'Toggle block' },
  { key: 'Q', action: 'Toggle queue (local files)' },
  { key: 'Escape', action: 'Close panel / overlay' },
  { key: '? / H', action: 'Toggle this overlay' },
];

export function ShortcutOverlay({ visible, onClose }: ShortcutOverlayProps) {
  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-80 rounded-lg bg-gray-900/95 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-center text-sm font-semibold text-white">Keyboard Shortcuts</h2>
        <div className="flex flex-col gap-2">
          {SHORTCUTS.map((s) => (
            <div key={s.key} className="flex items-center justify-between">
              <kbd className="rounded bg-white/10 px-2 py-0.5 text-xs font-mono text-white/80">
                {s.key}
              </kbd>
              <span className="text-xs text-white/60">{s.action}</span>
            </div>
          ))}
        </div>
        <button
          onClick={onClose}
          className="mt-4 w-full cursor-pointer rounded border-none bg-white/10 py-1.5 text-xs text-white/70 hover:bg-white/20"
        >
          Close
        </button>
      </div>
    </div>
  );
}
