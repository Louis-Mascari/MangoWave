import { useSettingsStore } from '../store/useSettingsStore.ts';

const FPS_OPTIONS = [
  { label: 'Uncapped', value: 0 },
  { label: '60 FPS', value: 60 },
  { label: '30 FPS', value: 30 },
];

const RESOLUTION_OPTIONS = [
  { label: '100%', value: 1.0 },
  { label: '75%', value: 0.75 },
  { label: '50%', value: 0.5 },
  { label: '25%', value: 0.25 },
];

export function PerformancePanel() {
  const { performance, setFpsCap, setResolutionScale } = useSettingsStore();

  return (
    <div className="flex flex-col gap-3 rounded-lg bg-black/60 p-4 backdrop-blur-sm">
      <h3 className="text-sm font-semibold text-white">Performance</h3>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-white/60">Frame Rate</label>
        <div className="flex gap-2">
          {FPS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setFpsCap(opt.value)}
              className={`cursor-pointer rounded border-none px-3 py-1 text-xs ${
                performance.fpsCap === opt.value
                  ? 'bg-orange-500 text-white'
                  : 'bg-white/10 text-white/70 hover:bg-white/20'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-white/60">Resolution</label>
        <div className="flex gap-2">
          {RESOLUTION_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setResolutionScale(opt.value)}
              className={`cursor-pointer rounded border-none px-3 py-1 text-xs ${
                performance.resolutionScale === opt.value
                  ? 'bg-orange-500 text-white'
                  : 'bg-white/10 text-white/70 hover:bg-white/20'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
