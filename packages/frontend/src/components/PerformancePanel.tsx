import { useSettingsStore } from '../store/useSettingsStore.ts';
import { Tooltip } from './Tooltip.tsx';

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

const FFT_OPTIONS = [512, 1024, 2048, 4096];

export function PerformancePanel() {
  const performance = useSettingsStore((s) => s.performance);
  const setFpsCap = useSettingsStore((s) => s.setFpsCap);
  const setResolutionScale = useSettingsStore((s) => s.setResolutionScale);
  const audio = useSettingsStore((s) => s.audio);
  const setSmoothingConstant = useSettingsStore((s) => s.setSmoothingConstant);
  const setFftSize = useSettingsStore((s) => s.setFftSize);
  const showPresetName = useSettingsStore((s) => s.showPresetName);
  const setShowPresetName = useSettingsStore((s) => s.setShowPresetName);
  const autopilot = useSettingsStore((s) => s.autopilot);
  const setAutopilotEnabled = useSettingsStore((s) => s.setAutopilotEnabled);
  const setAutopilotInterval = useSettingsStore((s) => s.setAutopilotInterval);
  const setAutopilotFavoritesOnly = useSettingsStore((s) => s.setAutopilotFavoritesOnly);

  return (
    <div className="flex flex-col gap-3 rounded-lg bg-black/60 p-4 backdrop-blur-sm">
      <h3 className="text-sm font-semibold text-white">Performance</h3>

      <div className="flex flex-col gap-1">
        <label className="flex items-center text-xs text-white/60">
          Frame Rate
          <Tooltip text="Lower frame rates reduce GPU usage" />
        </label>
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
        <label className="flex items-center text-xs text-white/60">
          Resolution
          <Tooltip text="Lower resolution reduces GPU load but looks less sharp" />
        </label>
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

      <div className="flex flex-col gap-1">
        <label className="flex items-center text-xs text-white/60">
          Audio Smoothing: {audio.smoothingConstant.toFixed(2)}
          <Tooltip text="Lower = snappier reaction to beats, higher = smoother movement. Effect is subtle — presets apply their own internal smoothing" />
        </label>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={audio.smoothingConstant}
          onChange={(e) => setSmoothingConstant(parseFloat(e.target.value))}
          className="w-full accent-orange-500"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="flex items-center text-xs text-white/60">
          FFT Size
          <Tooltip text="Higher = more frequency detail but more latency. Effect is subtle — the engine maps to fixed internal frequency bands" />
        </label>
        <div className="flex gap-2">
          {FFT_OPTIONS.map((size) => (
            <button
              key={size}
              onClick={() => setFftSize(size)}
              className={`cursor-pointer rounded border-none px-3 py-1 text-xs ${
                audio.fftSize === size
                  ? 'bg-orange-500 text-white'
                  : 'bg-white/10 text-white/70 hover:bg-white/20'
              }`}
            >
              {size}
            </button>
          ))}
        </div>
      </div>

      <label className="flex items-center gap-2 text-xs text-white/60">
        <input
          type="checkbox"
          checked={showPresetName}
          onChange={(e) => setShowPresetName(e.target.checked)}
          className="accent-orange-500"
        />
        Show preset name
      </label>

      <div className="mt-1 border-t border-white/10 pt-3">
        <div className="flex items-center justify-between">
          <label className="flex items-center text-xs font-semibold text-white/80">
            Autopilot
            <Tooltip text="Automatically cycles through presets at the set interval" />
          </label>
          <button
            onClick={() => setAutopilotEnabled(!autopilot.enabled)}
            className={`cursor-pointer rounded border-none px-3 py-1 text-xs ${
              autopilot.enabled
                ? 'bg-orange-500 text-white'
                : 'bg-white/10 text-white/70 hover:bg-white/20'
            }`}
          >
            {autopilot.enabled ? 'On' : 'Off'}
          </button>
        </div>

        <div className="mt-2 flex flex-col gap-1">
          <label className="text-xs text-white/60">Interval: {autopilot.interval}s</label>
          <input
            type="range"
            min="5"
            max="120"
            step="5"
            value={autopilot.interval}
            onChange={(e) => setAutopilotInterval(parseInt(e.target.value))}
            className="w-full accent-orange-500"
          />
        </div>

        <label className="mt-2 flex items-center gap-2 text-xs text-white/60">
          <input
            type="checkbox"
            checked={autopilot.favoritesOnly}
            onChange={(e) => setAutopilotFavoritesOnly(e.target.checked)}
            className="accent-orange-500"
          />
          Favorites only
        </label>
      </div>
    </div>
  );
}
