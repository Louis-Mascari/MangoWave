import { EQ_BANDS } from '../engine/AudioEngine.ts';
import { useSettingsStore } from '../store/useSettingsStore.ts';
import { Tooltip } from './Tooltip.tsx';

function formatFreq(freq: number): string {
  return freq >= 1000 ? `${freq / 1000}k` : `${freq}`;
}

export function EQPanel() {
  const eq = useSettingsStore((s) => s.eq);
  const setPreAmpGain = useSettingsStore((s) => s.setPreAmpGain);
  const setEQBandGain = useSettingsStore((s) => s.setEQBandGain);
  const resetEQ = useSettingsStore((s) => s.resetEQ);

  return (
    <div className="flex flex-col gap-3 rounded-lg bg-black/60 p-4 backdrop-blur-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">Equalizer</h3>
        <button
          onClick={resetEQ}
          className="cursor-pointer rounded border-none bg-white/10 px-2 py-1 text-xs text-white/70 hover:bg-white/20"
        >
          Reset
        </button>
      </div>

      <div className="flex flex-col gap-1">
        <label className="flex items-center text-xs text-white/60">
          Pre-Amp
          <Tooltip text="Boost or cut the overall input signal before the EQ bands" />
        </label>
        <input
          type="range"
          min="0"
          max="3"
          step="0.1"
          value={eq.preAmpGain}
          onChange={(e) => setPreAmpGain(parseFloat(e.target.value))}
          className="w-full accent-orange-500"
        />
        <span className="text-right text-xs text-white/50">{eq.preAmpGain.toFixed(1)}x</span>
      </div>

      <div className="flex gap-2">
        {EQ_BANDS.map((freq, i) => (
          <div key={freq} className="flex flex-col items-center gap-1">
            <input
              type="range"
              min="-12"
              max="12"
              step="1"
              value={eq.bandGains[i]}
              onChange={(e) => setEQBandGain(i, parseFloat(e.target.value))}
              // @ts-expect-error - orient="vertical" is a non-standard Firefox attribute
              orient="vertical"
              className="h-24 accent-orange-500"
              style={{ writingMode: 'vertical-lr', direction: 'rtl' }}
            />
            <span className="text-[10px] text-white/50">{formatFreq(freq)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
