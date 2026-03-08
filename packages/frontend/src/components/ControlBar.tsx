import { useState } from 'react';
import { useIdleTimer } from '../hooks/useIdleTimer.ts';
import { EQPanel } from './EQPanel.tsx';
import { PerformancePanel } from './PerformancePanel.tsx';

interface ControlBarProps {
  onNextPreset: () => void;
  onStop: () => void;
  onToggleFullscreen: () => void;
}

type PanelView = 'none' | 'eq' | 'performance';

export function ControlBar({ onNextPreset, onStop, onToggleFullscreen }: ControlBarProps) {
  const isIdle = useIdleTimer(3000);
  const [activePanel, setActivePanel] = useState<PanelView>('none');

  const togglePanel = (panel: PanelView) => {
    setActivePanel((current) => (current === panel ? 'none' : panel));
  };

  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-50 transition-opacity duration-500 ${
        isIdle && activePanel === 'none' ? 'pointer-events-none opacity-0' : 'opacity-100'
      }`}
    >
      {activePanel !== 'none' && (
        <div className="mx-4 mb-2">
          {activePanel === 'eq' && <EQPanel />}
          {activePanel === 'performance' && <PerformancePanel />}
        </div>
      )}

      <div className="flex items-center justify-between bg-black/50 px-4 py-2 backdrop-blur-sm">
        <div className="flex gap-2">
          <BarButton onClick={onNextPreset}>Next Preset</BarButton>
          <BarButton onClick={() => togglePanel('eq')} active={activePanel === 'eq'}>
            EQ
          </BarButton>
          <BarButton
            onClick={() => togglePanel('performance')}
            active={activePanel === 'performance'}
          >
            Performance
          </BarButton>
        </div>

        <div className="flex gap-2">
          <BarButton onClick={onToggleFullscreen}>Fullscreen</BarButton>
          <BarButton onClick={onStop}>Stop</BarButton>
        </div>
      </div>
    </div>
  );
}

function BarButton({
  onClick,
  active = false,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`cursor-pointer rounded border-none px-3 py-1.5 text-xs font-medium ${
        active ? 'bg-orange-500 text-white' : 'bg-white/10 text-white/80 hover:bg-white/20'
      }`}
    >
      {children}
    </button>
  );
}
