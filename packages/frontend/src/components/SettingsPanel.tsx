import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EQ_BANDS } from '../engine/AudioEngine.ts';
import { useSettingsStore } from '../store/useSettingsStore.ts';
import { useSpotifyStore } from '../store/useSpotifyStore.ts';
import { useToastStore } from '../store/useToastStore.ts';
import { useConfirmStore } from '../store/useConfirmStore.ts';
import { buildSpotifyAuthUrl } from '../services/spotifyApi.ts';
import { Tooltip } from './Tooltip.tsx';
import { isMobileDevice } from '../utils/isMobileDevice.ts';
import { useWindowSyncStatusStore } from '../store/useWindowSyncStatusStore.ts';
import { quarantinedSet, mobileBlockedSet } from '../data/excludedPresets.ts';
import { SHORTCUTS } from '../constants/shortcuts.ts';
import {
  EXPORT_CATEGORIES,
  buildExport,
  downloadExport,
  parseImportFile,
  buildImportPayload,
} from '../utils/settingsPortability.ts';
import type { ParseResult } from '../utils/settingsPortability.ts';

type Tab = 'equalizer' | 'rendering' | 'presets' | 'shortcuts' | 'data' | 'sync' | 'spotify';

/** Compute CSS custom property for range-fill slider track */
function rangeFillStyle(value: number, min: number, max: number) {
  const pct = ((value - min) / (max - min)) * 100;
  return { '--fill': `${pct}%` } as React.CSSProperties;
}

/** Compute CSS custom property for vertical range-fill slider (inverted axis) */
function rangeFillVerticalStyle(value: number, min: number, max: number) {
  const pct = ((value - min) / (max - min)) * 100;
  return { '--fill-inv': `${100 - pct}%` } as React.CSSProperties;
}

const FPS_QUICK_PICKS = [30, 60, 120, 144, 240];

const RESOLUTION_OPTIONS = [
  { label: '25%', value: 0.25 },
  { label: '50%', value: 0.5 },
  { label: '75%', value: 0.75 },
  { label: '100%', value: 1.0 },
];

const MESH_OPTIONS = [
  { labelKey: 'low', width: 32, height: 24 },
  { labelKey: 'default', width: 48, height: 36 },
  { labelKey: 'high', width: 64, height: 48 },
  { labelKey: 'ultra', width: 96, height: 72 },
];

const TEXTURE_OPTIONS = [
  { labelKey: 'low', value: 0.5 },
  { labelKey: 'default', value: 1.0 },
  { labelKey: 'high', value: 1.5 },
];

const FFT_OPTIONS = [512, 1024, 2048, 4096];

function formatFreq(freq: number): string {
  return freq >= 1000 ? `${freq / 1000}k` : `${freq}`;
}

export function SettingsPanel() {
  const { t } = useTranslation('settings');
  const { t: tc } = useTranslation('common');
  const [activeTab, setActiveTab] = useState<Tab>('equalizer');
  const getAuthMode = useSpotifyStore((s) => s.getAuthMode);
  const accessToken = useSpotifyStore((s) => s.accessToken);
  const sessionId = useSpotifyStore((s) => s.sessionId);
  const authMode = getAuthMode();
  const showSpotifyTab = !isMobileDevice && (authMode !== 'locked' || !!(accessToken || sessionId));
  const showSyncTab = !isMobileDevice;

  return (
    <div className="flex flex-col gap-3 rounded-lg bg-black/60 p-4 backdrop-blur-sm">
      <div className="flex flex-wrap gap-2 border-b border-white/10 pb-2">
        <TabButton active={activeTab === 'equalizer'} onClick={() => setActiveTab('equalizer')}>
          {t('tabs.equalizer')}
        </TabButton>
        <TabButton active={activeTab === 'rendering'} onClick={() => setActiveTab('rendering')}>
          {t('tabs.rendering')}
        </TabButton>
        <TabButton active={activeTab === 'presets'} onClick={() => setActiveTab('presets')}>
          {t('tabs.presets')}
        </TabButton>
        <TabButton active={activeTab === 'shortcuts'} onClick={() => setActiveTab('shortcuts')}>
          {t('tabs.shortcuts')}
        </TabButton>
        <TabButton active={activeTab === 'data'} onClick={() => setActiveTab('data')}>
          {t('tabs.data')}
        </TabButton>
        {showSyncTab && (
          <TabButton active={activeTab === 'sync'} onClick={() => setActiveTab('sync')}>
            {t('tabs.sync')}
          </TabButton>
        )}
        {showSpotifyTab && (
          <TabButton active={activeTab === 'spotify'} onClick={() => setActiveTab('spotify')}>
            {t('tabs.spotify')}
          </TabButton>
        )}
      </div>

      {activeTab === 'equalizer' && <EqualizerTab />}
      {activeTab === 'rendering' && <RenderingTab />}
      {activeTab === 'presets' && <PresetsTab />}
      {activeTab === 'shortcuts' && <ShortcutsTab />}
      {activeTab === 'data' && <DataTab />}
      {activeTab === 'sync' && showSyncTab && <SyncTab />}
      {activeTab === 'spotify' && showSpotifyTab && <SpotifyTab />}

      <div className="mt-2 border-t border-white/10 pt-2">
        <a
          href="https://github.com/Louis-Mascari/MangoWave/issues/new/choose"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-xs text-white/40 no-underline transition-colors hover:text-white/60"
        >
          <svg
            viewBox="0 0 24 24"
            width="14"
            height="14"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          {tc('sendFeedback')}
        </a>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`cursor-pointer rounded border-none px-3 py-1.5 text-xs font-medium ${
        active ? 'bg-orange-500 text-white' : 'bg-white/10 text-white/70 hover:bg-white/20'
      }`}
    >
      {children}
    </button>
  );
}

function EqualizerTab() {
  const { t } = useTranslation('settings');
  const { t: tc } = useTranslation('common');
  const eq = useSettingsStore((s) => s.eq);
  const setPreAmpGain = useSettingsStore((s) => s.setPreAmpGain);
  const setEQBandGain = useSettingsStore((s) => s.setEQBandGain);
  const resetEQ = useSettingsStore((s) => s.resetEQ);

  return (
    <>
      <div className="flex items-center justify-between">
        <h3 className="flex items-center text-sm font-semibold text-white">
          {t('equalizer.title')}
          <Tooltip text={t('equalizer.tooltip')} />
        </h3>
        <button
          onClick={resetEQ}
          className="cursor-pointer rounded border-none bg-white/10 px-2 py-1 text-xs text-white/70 hover:bg-white/20"
        >
          {tc('reset')}
        </button>
      </div>

      <div className="flex w-full items-start">
        <div className="flex h-24 flex-col justify-between pr-1.5 text-[10px] text-white/30">
          <span>{t('equalizer.scaleHigh')}</span>
          <span>{t('equalizer.scaleMid')}</span>
          <span>{t('equalizer.scaleLow')}</span>
        </div>
        <div className="relative flex flex-1 justify-between">
          <div className="pointer-events-none absolute left-0 right-0 top-12 border-t border-dashed border-white/15" />
          {EQ_BANDS.map((freq, i) => (
            <div key={freq} className="flex flex-col items-center gap-1">
              <input
                type="range"
                min="-12"
                max="12"
                step="1"
                value={eq.bandGains[i]}
                onChange={(e) => setEQBandGain(i, parseFloat(e.target.value))}
                aria-label={`${formatFreq(freq)} Hz`}
                aria-valuetext={`${eq.bandGains[i]} dB`}
                // @ts-expect-error - orient="vertical" is a non-standard Firefox attribute
                orient="vertical"
                className="range-fill-vertical h-24"
                style={{
                  writingMode: 'vertical-lr',
                  direction: 'rtl',
                  ...rangeFillVerticalStyle(eq.bandGains[i], -12, 12),
                }}
              />
              <span className="text-[10px] text-white/50">{formatFreq(freq)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-1 border-t border-white/10 pt-3">
        <div className="flex flex-col gap-1">
          <span className="flex items-center text-xs text-white/60">
            {t('equalizer.preAmp')}
            <Tooltip text={t('equalizer.preAmpTooltip')} />
          </span>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min="0"
              max="3"
              step="0.1"
              value={eq.preAmpGain}
              onChange={(e) => setPreAmpGain(parseFloat(e.target.value))}
              aria-label={t('equalizer.preAmp')}
              aria-valuetext={`${eq.preAmpGain.toFixed(1)}x`}
              className="range-fill flex-1"
              style={rangeFillStyle(eq.preAmpGain, 0, 3)}
            />
            <span className="w-8 text-right text-xs text-white/50">
              {eq.preAmpGain.toFixed(1)}x
            </span>
          </div>
        </div>
      </div>
    </>
  );
}

function RenderingTab() {
  const { t } = useTranslation('settings');
  const { t: tc } = useTranslation('common');
  const performance = useSettingsStore((s) => s.performance);
  const setFpsCap = useSettingsStore((s) => s.setFpsCap);
  const setResolutionScale = useSettingsStore((s) => s.setResolutionScale);
  const setMeshSize = useSettingsStore((s) => s.setMeshSize);
  const setTextureRatio = useSettingsStore((s) => s.setTextureRatio);
  const setFxaa = useSettingsStore((s) => s.setFxaa);
  const audio = useSettingsStore((s) => s.audio);
  const setSmoothingConstant = useSettingsStore((s) => s.setSmoothingConstant);
  const setFftSize = useSettingsStore((s) => s.setFftSize);
  const resetRendering = useSettingsStore((s) => s.resetRendering);

  const [fpsEditing, setFpsEditing] = useState<string | null>(null);
  const fpsDisplayValue =
    fpsEditing !== null ? fpsEditing : performance.fpsCap === 0 ? '' : String(performance.fpsCap);

  const commitFpsInput = (raw: string) => {
    setFpsEditing(null);
    const val = parseInt(raw, 10);
    if (isNaN(val) || raw === '') {
      setFpsCap(0);
    } else {
      setFpsCap(val);
    }
  };

  return (
    <>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">{t('rendering.title')}</h3>
        <button
          onClick={resetRendering}
          className="cursor-pointer rounded border-none bg-white/10 px-2 py-1 text-xs text-white/70 hover:bg-white/20"
        >
          {tc('reset')}
        </button>
      </div>

      <div className="flex flex-col gap-1">
        <span className="flex items-center text-xs text-white/60">
          {t('rendering.frameRate')}
          <Tooltip text={t('rendering.frameRateTooltip')} />
        </span>
        <input
          type="number"
          min={15}
          max={300}
          step={1}
          value={fpsDisplayValue}
          placeholder={t('rendering.frameRatePlaceholder')}
          onFocus={(e) => setFpsEditing(e.target.value)}
          onChange={(e) => setFpsEditing(e.target.value)}
          onBlur={(e) => commitFpsInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitFpsInput(fpsDisplayValue);
          }}
          className="w-[72px] rounded border border-white/10 bg-white/10 px-2 py-1 text-xs text-white placeholder:text-white/30 [appearance:textfield] focus:border-orange-500 focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <div className="flex gap-1.5">
          {FPS_QUICK_PICKS.map((fps) => (
            <button
              key={fps}
              onClick={() => setFpsCap(fps)}
              className={`cursor-pointer rounded border-none px-2 py-0.5 text-[11px] ${
                performance.fpsCap === fps
                  ? 'bg-orange-500 text-white'
                  : 'bg-white/10 text-white/70 hover:bg-white/20'
              }`}
            >
              {fps}
            </button>
          ))}
          <button
            onClick={() => setFpsCap(0)}
            className={`cursor-pointer rounded border-none px-2 py-0.5 text-[11px] ${
              performance.fpsCap === 0
                ? 'bg-orange-500 text-white'
                : 'bg-white/10 text-white/70 hover:bg-white/20'
            }`}
          >
            {t('rendering.uncapped')}
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <span className="flex items-center text-xs text-white/60">
          {t('rendering.resolution')}
          <Tooltip text={t('rendering.resolutionTooltip')} />
        </span>
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
        <span className="flex items-center text-xs text-white/60">
          {t('rendering.meshResolution')}
          <Tooltip text={t('rendering.meshResolutionTooltip')} />
        </span>
        <div className="flex gap-2">
          {MESH_OPTIONS.map((opt) => (
            <button
              key={opt.labelKey}
              onClick={() => setMeshSize(opt.width, opt.height)}
              className={`cursor-pointer rounded border-none px-3 py-1 text-xs ${
                performance.meshWidth === opt.width && performance.meshHeight === opt.height
                  ? 'bg-orange-500 text-white'
                  : 'bg-white/10 text-white/70 hover:bg-white/20'
              }`}
            >
              {tc(opt.labelKey)}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <span className="flex items-center text-xs text-white/60">
          {t('rendering.textureQuality')}
          <Tooltip text={t('rendering.textureQualityTooltip')} />
        </span>
        <div className="flex gap-2">
          {TEXTURE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setTextureRatio(opt.value)}
              className={`cursor-pointer rounded border-none px-3 py-1 text-xs ${
                performance.textureRatio === opt.value
                  ? 'bg-orange-500 text-white'
                  : 'bg-white/10 text-white/70 hover:bg-white/20'
              }`}
            >
              {tc(opt.labelKey)}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <span className="flex items-center text-xs text-white/60">
          {t('rendering.antiAliasing')}
          <Tooltip text={t('rendering.antiAliasingTooltip')} />
        </span>
        <div className="flex gap-2">
          <button
            onClick={() => setFxaa(true)}
            className={`cursor-pointer rounded border-none px-3 py-1 text-xs ${
              performance.fxaa
                ? 'bg-orange-500 text-white'
                : 'bg-white/10 text-white/70 hover:bg-white/20'
            }`}
          >
            {tc('on')}
          </button>
          <button
            onClick={() => setFxaa(false)}
            className={`cursor-pointer rounded border-none px-3 py-1 text-xs ${
              !performance.fxaa
                ? 'bg-orange-500 text-white'
                : 'bg-white/10 text-white/70 hover:bg-white/20'
            }`}
          >
            {tc('off')}
          </button>
        </div>
      </div>

      <div className="mt-1 border-t border-white/10 pt-3">
        <label className="text-xs font-semibold text-white/80">{t('rendering.analysis')}</label>
      </div>

      <div className="flex flex-col gap-1">
        <span className="flex items-center text-xs text-white/60">
          {t('rendering.audioSmoothing', { value: audio.smoothingConstant.toFixed(2) })}
          <Tooltip text={t('rendering.audioSmoothingTooltip')} />
        </span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={audio.smoothingConstant}
          onChange={(e) => setSmoothingConstant(parseFloat(e.target.value))}
          aria-label={t('rendering.audioSmoothing', { value: audio.smoothingConstant.toFixed(2) })}
          aria-valuetext={audio.smoothingConstant.toFixed(2)}
          className="range-fill w-full"
          style={rangeFillStyle(audio.smoothingConstant, 0, 1)}
        />
      </div>

      <div className="flex flex-col gap-1">
        <span className="flex items-center text-xs text-white/60">
          {t('rendering.fftSize')}
          <Tooltip text={t('rendering.fftSizeTooltip')} />
        </span>
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
    </>
  );
}

function PresetsTab() {
  const { t } = useTranslation('settings');
  const { t: tc } = useTranslation('common');
  const { t: tm } = useTranslation('messages');
  const transitionTime = useSettingsStore((s) => s.transitionTime);
  const setTransitionTime = useSettingsStore((s) => s.setTransitionTime);
  const presetNameDisplay = useSettingsStore((s) => s.presetNameDisplay);
  const setPresetNameDisplay = useSettingsStore((s) => s.setPresetNameDisplay);
  const autopilot = useSettingsStore((s) => s.autopilot);
  const setAutopilotEnabled = useSettingsStore((s) => s.setAutopilotEnabled);
  const setAutopilotInterval = useSettingsStore((s) => s.setAutopilotInterval);
  const setAutopilotMode = useSettingsStore((s) => s.setAutopilotMode);
  const setAutopilotFavoriteWeight = useSettingsStore((s) => s.setAutopilotFavoriteWeight);
  const resetPresets = useSettingsStore((s) => s.resetPresets);
  const blockedPresets = useSettingsStore((s) => s.blockedPresets);
  const favoritePresets = useSettingsStore((s) => s.favoritePresets);
  const clearBlocked = useSettingsStore((s) => s.clearBlocked);
  const clearFavorites = useSettingsStore((s) => s.clearFavorites);
  const showToast = useToastStore((s) => s.show);

  return (
    <>
      <div className="flex items-center justify-between">
        <h3 className="flex items-center text-sm font-semibold text-white">
          {t('presets.title')}
          <Tooltip text={t('presets.tooltip')} />
        </h3>
        <button
          onClick={resetPresets}
          className="cursor-pointer rounded border-none bg-white/10 px-2 py-1 text-xs text-white/70 hover:bg-white/20"
        >
          {tc('reset')}
        </button>
      </div>

      <div className="flex flex-col gap-1">
        <span className="flex items-center text-xs text-white/60">
          {t('presets.transitionTime', { value: transitionTime.toFixed(1) })}
          <Tooltip text={t('presets.transitionTimeTooltip')} />
        </span>
        <input
          type="range"
          min="0"
          max="10"
          step="0.5"
          value={transitionTime}
          onChange={(e) => setTransitionTime(parseFloat(e.target.value))}
          aria-label={t('presets.transitionTime', { value: transitionTime.toFixed(1) })}
          aria-valuetext={`${transitionTime.toFixed(1)}s`}
          className="range-fill w-full"
          style={rangeFillStyle(transitionTime, 0, 10)}
        />
      </div>

      <div className="flex flex-col gap-1">
        <span className="flex items-center text-xs text-white/60">
          {t('presets.presetNameDisplay')}
          <Tooltip text={t('presets.presetNameDisplayTooltip')} />
        </span>
        <div className="flex gap-2">
          <button
            onClick={() => setPresetNameDisplay('off')}
            className={`cursor-pointer rounded border-none px-3 py-1 text-xs ${
              presetNameDisplay === 'off'
                ? 'bg-orange-500 text-white'
                : 'bg-white/10 text-white/70 hover:bg-white/20'
            }`}
          >
            {tc('off')}
          </button>
          <button
            onClick={() => setPresetNameDisplay('always')}
            className={`cursor-pointer rounded border-none px-3 py-1 text-xs ${
              presetNameDisplay === 'always'
                ? 'bg-orange-500 text-white'
                : 'bg-white/10 text-white/70 hover:bg-white/20'
            }`}
          >
            {t('presets.always')}
          </button>
          <button
            onClick={() =>
              setPresetNameDisplay(typeof presetNameDisplay === 'number' ? presetNameDisplay : 5)
            }
            className={`cursor-pointer rounded border-none px-3 py-1 text-xs ${
              typeof presetNameDisplay === 'number'
                ? 'bg-orange-500 text-white'
                : 'bg-white/10 text-white/70 hover:bg-white/20'
            }`}
          >
            {t('presets.timed')}
          </button>
        </div>
        {typeof presetNameDisplay === 'number' && (
          <div className="mt-1">
            <label className="text-xs text-white/60">
              {t('presets.duration', { value: presetNameDisplay })}
            </label>
            <input
              type="range"
              min="1"
              max="10"
              step="1"
              value={presetNameDisplay}
              onChange={(e) => setPresetNameDisplay(parseInt(e.target.value))}
              aria-label={t('presets.duration', { value: presetNameDisplay })}
              aria-valuetext={`${presetNameDisplay}s`}
              className="range-fill w-full"
              style={rangeFillStyle(presetNameDisplay as number, 1, 10)}
            />
          </div>
        )}
      </div>

      <div className="mt-1 border-t border-white/10 pt-3">
        <div className="flex items-center justify-between">
          <span className="flex items-center text-xs font-semibold text-white/80">
            {tc('autopilot')}
            <Tooltip text={t('presets.autopilotTooltip')} />
          </span>
          <button
            onClick={() => setAutopilotEnabled(!autopilot.enabled)}
            className={`cursor-pointer rounded border-none px-3 py-1 text-xs ${
              autopilot.enabled
                ? 'bg-orange-500 text-white'
                : 'bg-white/10 text-white/70 hover:bg-white/20'
            }`}
          >
            {autopilot.enabled ? tc('on') : tc('off')}
          </button>
        </div>

        <div className="mt-2 flex flex-col gap-1">
          <label className="text-xs text-white/60">
            {t('presets.interval', { value: autopilot.interval })}
          </label>
          <input
            type="range"
            min="5"
            max="120"
            step="5"
            value={autopilot.interval}
            onChange={(e) => setAutopilotInterval(parseInt(e.target.value))}
            aria-label={t('presets.interval', { value: autopilot.interval })}
            aria-valuetext={`${autopilot.interval}s`}
            className="range-fill w-full"
            style={rangeFillStyle(autopilot.interval, 5, 120)}
          />
        </div>

        <div className="mt-2 flex flex-col gap-1">
          <span className="flex items-center text-xs text-white/60">
            {t('presets.mode')}
            <Tooltip text={t('presets.modeTooltip')} />
          </span>
          <div className="flex gap-2">
            {[
              { mode: 'all' as const, label: t('presets.all') },
              { mode: 'favorites' as const, label: t('presets.favorites') },
            ].map(({ mode, label }) => (
              <button
                key={mode}
                onClick={() => setAutopilotMode(mode)}
                className={`cursor-pointer rounded border-none px-3 py-1 text-xs ${
                  autopilot.mode === mode
                    ? 'bg-orange-500 text-white'
                    : 'bg-white/10 text-white/70 hover:bg-white/20'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-2 flex flex-col gap-1">
          <span className="flex items-center text-xs text-white/60">
            {t('presets.favoriteFrequency', { value: autopilot.favoriteWeight })}
            <Tooltip text={t('presets.favoriteFrequencyTooltip')} />
          </span>
          <input
            type="range"
            min="1"
            max="10"
            step="1"
            value={autopilot.favoriteWeight}
            onChange={(e) => setAutopilotFavoriteWeight(parseInt(e.target.value))}
            aria-label={t('presets.favoriteFrequency', { value: autopilot.favoriteWeight })}
            aria-valuetext={`${autopilot.favoriteWeight}x`}
            className="range-fill w-full"
            style={rangeFillStyle(autopilot.favoriteWeight, 1, 10)}
          />
        </div>
      </div>

      <div className="mt-1 flex flex-wrap gap-2 border-t border-white/10 pt-3">
        {(() => {
          const clearableCount = blockedPresets.filter((p) => {
            return !quarantinedSet.has(p) && (!isMobileDevice || !mobileBlockedSet.has(p));
          }).length;
          return (
            <button
              onClick={() => {
                if (clearableCount === 0) return;
                useConfirmStore.getState().show({
                  title: t('presets.clearBlocked', { count: clearableCount }),
                  message: t('presets.clearBlockedConfirm', { count: clearableCount }),
                  confirmLabel: tc('clear'),
                  destructive: true,
                  onConfirm: () => {
                    clearBlocked();
                    showToast(tm('toasts.blockedPresetsCleared'));
                  },
                });
              }}
              disabled={clearableCount === 0}
              className="cursor-pointer rounded border-none bg-red-500/10 px-3 py-1 text-xs text-red-400 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t('presets.clearBlocked', { count: clearableCount })}
            </button>
          );
        })()}
        <button
          onClick={() => {
            if (favoritePresets.length === 0) return;
            useConfirmStore.getState().show({
              title: t('presets.clearFavorites', { count: favoritePresets.length }),
              message: t('presets.clearFavoritesConfirm', { count: favoritePresets.length }),
              confirmLabel: tc('clear'),
              destructive: true,
              onConfirm: () => {
                clearFavorites();
                showToast(tm('toasts.favoritePresetsCleared'));
              },
            });
          }}
          disabled={favoritePresets.length === 0}
          className="cursor-pointer rounded border-none bg-red-500/10 px-3 py-1 text-xs text-red-400 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {t('presets.clearFavorites', { count: favoritePresets.length })}
        </button>
      </div>
    </>
  );
}

function DataTab() {
  const { t } = useTranslation('settings');
  const { t: tc } = useTranslation('common');
  const { t: tm } = useTranslation('messages');
  const accessToken = useSpotifyStore((s) => s.accessToken);
  const sessionId = useSpotifyStore((s) => s.sessionId);
  const isSpotifyConnected = !!(accessToken || sessionId);

  const categories = isMobileDevice
    ? EXPORT_CATEGORIES.filter((c) => c.key !== 'sync')
    : EXPORT_CATEGORIES;

  const [exportSelected, setExportSelected] = useState<Set<string>>(
    () => new Set(categories.map((c) => c.key)),
  );
  const [importResult, setImportResult] = useState<(ParseResult & { ok: true }) | null>(null);
  const [importSelected, setImportSelected] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const showToast = useToastStore((s) => s.show);

  const toggleExportCategory = (key: string) => {
    setExportSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleExport = () => {
    const state = useSettingsStore.getState();
    const data = buildExport(state, exportSelected);
    downloadExport(data);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset input so the same file can be re-selected
    e.target.value = '';

    const result = await parseImportFile(file);
    if (!result.ok) {
      showToast(result.error, { type: 'error', durationMs: 6000 });
      return;
    }
    setImportResult(result);
    setImportSelected(new Set(result.categories));
  };

  const handleApplyImport = () => {
    if (!importResult) return;
    const { payload, warnings } = buildImportPayload(importResult.data, importSelected);
    useSettingsStore.getState().importSettings(payload);
    setImportResult(null);
    const allWarnings = importResult.versionWarning
      ? [importResult.versionWarning, ...warnings]
      : warnings;
    if (allWarnings.length > 0) {
      showToast(tm('settingsImport.importedWithWarnings'), {
        type: 'warning',
        durationMs: 6000,
      });
    } else {
      showToast(tm('settingsImport.importedSuccess'));
    }
  };

  const toggleImportCategory = (key: string) => {
    setImportSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <>
      <h3 className="text-sm font-semibold text-white">{t('data.title')}</h3>
      <p className="text-xs text-white/50">
        {isSpotifyConnected ? t('data.descriptionWithSync') : t('data.description')}
      </p>

      <div className="mt-1 flex flex-col gap-2">
        <label className="text-xs font-semibold text-white/80">{t('data.export')}</label>
        <div className="grid grid-cols-2 gap-1.5">
          {categories.map((cat) => (
            <label key={cat.key} className="flex items-center gap-1.5 text-xs text-white/70">
              <input
                type="checkbox"
                checked={exportSelected.has(cat.key)}
                onChange={() => toggleExportCategory(cat.key)}
                className="accent-orange-500"
              />
              {t(cat.labelKey)}
            </label>
          ))}
        </div>
        <div className="flex gap-3 text-[10px]">
          <button
            onClick={() => setExportSelected(new Set(categories.map((c) => c.key)))}
            className="cursor-pointer border-none bg-transparent p-0 text-[10px] text-white/40 underline hover:text-orange-400"
          >
            {tc('selectAll')}
          </button>
          <button
            onClick={() => setExportSelected(new Set())}
            className="cursor-pointer border-none bg-transparent p-0 text-[10px] text-white/40 underline hover:text-orange-400"
          >
            {tc('deselectAll')}
          </button>
        </div>
        <button
          onClick={handleExport}
          disabled={exportSelected.size === 0}
          className="w-fit cursor-pointer rounded border-none bg-orange-500/20 px-3 py-1 text-xs text-orange-400 hover:bg-orange-500/30 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {t('data.exportSettings')}
        </button>
      </div>

      <div className="mt-1 flex flex-col gap-2 border-t border-white/10 pt-3">
        <label className="text-xs font-semibold text-white/80">{t('data.import')}</label>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={handleFileSelect}
          className="hidden"
        />

        {importResult ? (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-white/60">{t('data.importDescription')}</p>
            <div className="grid grid-cols-2 gap-1.5">
              {categories
                .filter((cat) => importResult.categories.includes(cat.key))
                .map((cat) => (
                  <label key={cat.key} className="flex items-center gap-1.5 text-xs text-white/70">
                    <input
                      type="checkbox"
                      checked={importSelected.has(cat.key)}
                      onChange={() => toggleImportCategory(cat.key)}
                      className="accent-orange-500"
                    />
                    {t(cat.labelKey)}
                  </label>
                ))}
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleApplyImport}
                disabled={importSelected.size === 0}
                className="cursor-pointer rounded border-none bg-orange-500/20 px-3 py-1 text-xs text-orange-400 hover:bg-orange-500/30 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {tc('apply')}
              </button>
              <button
                onClick={() => setImportResult(null)}
                className="cursor-pointer rounded border-none bg-white/10 px-3 py-1 text-xs text-white/70 hover:bg-white/20"
              >
                {tc('cancel')}
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="text-xs text-white/50">{t('data.loadFileDescription')}</p>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-fit cursor-pointer rounded border-none bg-orange-500/20 px-3 py-1 text-xs text-orange-400 hover:bg-orange-500/30"
            >
              {t('data.importSettings')}
            </button>
          </>
        )}
      </div>
    </>
  );
}

function SpotifyTab() {
  const { t } = useTranslation('settings');
  const { t: tc } = useTranslation('common');
  const user = useSpotifyStore((s) => s.user);
  const accessToken = useSpotifyStore((s) => s.accessToken);
  const sessionId = useSpotifyStore((s) => s.sessionId);
  const getAuthMode = useSpotifyStore((s) => s.getAuthMode);
  const logout = useSpotifyStore((s) => s.logout);
  const authMode = getAuthMode();

  const isConnected = !!(accessToken || sessionId);
  const [isConnecting, setIsConnecting] = useState(false);
  const popupCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (popupCheckRef.current) clearInterval(popupCheckRef.current);
    };
  }, []);

  const handleOwnerConnect = () => {
    if (isConnecting) return;
    setIsConnecting(true);
    try {
      const url = buildSpotifyAuthUrl();
      const popup = window.open(url, 'spotify-auth', 'popup,width=500,height=700');
      if (!popup || popup.closed) {
        window.location.href = url;
      } else {
        const check = setInterval(() => {
          if (popup.closed) {
            clearInterval(check);
            popupCheckRef.current = null;
            setIsConnecting(false);
          }
        }, 500);
        popupCheckRef.current = check;
      }
    } catch {
      setIsConnecting(false);
    }
  };

  if (authMode !== 'owner' && !isConnected) {
    return (
      <>
        <h3 className="text-sm font-semibold text-white">{t('spotifyTab.title')}</h3>
        <p className="text-xs text-white/40">{t('spotifyTab.unavailable')}</p>
      </>
    );
  }

  return (
    <>
      <h3 className="text-sm font-semibold text-white">{t('spotifyTab.title')}</h3>

      {isConnected ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-green-400">&#10003;</span>
            <span className="text-white/80" data-ph-mask>
              {user?.displayName
                ? t('spotifyTab.connectedAs', { name: user.displayName })
                : t('spotifyTab.connected')}
            </span>
          </div>
          <p className="text-xs text-white/40">{t('spotifyTab.connectedInfo')}</p>
          <button
            onClick={logout}
            className="w-fit cursor-pointer rounded border-none bg-white/10 px-3 py-1 text-xs text-white/70 hover:bg-white/20"
          >
            {tc('disconnect')}
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-xs text-white/50">{t('spotifyTab.connectDescription')}</p>
          <div className="flex flex-col gap-1">
            <button
              onClick={handleOwnerConnect}
              disabled={isConnecting}
              className="w-fit cursor-pointer rounded border-none bg-[#1DB954]/20 px-3 py-1 text-xs text-[#1DB954] hover:bg-[#1DB954]/30 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isConnecting ? t('spotifyTab.connecting') : t('spotifyTab.connectSpotify')}
            </button>
            <p className="text-[10px] text-white/30">{t('spotifyTab.devInfo')}</p>
          </div>
        </div>
      )}
    </>
  );
}

function SyncTab() {
  const { t } = useTranslation('settings');
  const { t: tc } = useTranslation('common');
  const windowSyncEnabled = useSettingsStore((s) => s.windowSyncEnabled);
  const setWindowSyncEnabled = useSettingsStore((s) => s.setWindowSyncEnabled);
  const syncPerformance = useSettingsStore((s) => s.syncPerformance);
  const setSyncPerformance = useSettingsStore((s) => s.setSyncPerformance);
  const { peerCount, isSyncAvailable } = useWindowSyncStatusStore();

  return (
    <>
      <h3 className="text-sm font-semibold text-white">{t('sync.title')}</h3>
      <p className="text-xs text-white/50">{t('sync.description')}</p>

      {!isSyncAvailable ? (
        <p className="text-xs text-white/40">{t('sync.unavailable')}</p>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <span className="text-xs text-white/60">{t('sync.enabled')}</span>
            <button
              onClick={() => setWindowSyncEnabled(!windowSyncEnabled)}
              className={`cursor-pointer rounded border-none px-3 py-1 text-xs ${
                windowSyncEnabled
                  ? 'bg-orange-500 text-white'
                  : 'bg-white/10 text-white/70 hover:bg-white/20'
              }`}
            >
              {windowSyncEnabled ? tc('on') : tc('off')}
            </button>
          </div>

          {windowSyncEnabled && (
            <>
              <div className="flex items-center gap-2">
                <span
                  className={`inline-block h-2 w-2 rounded-full ${
                    peerCount > 0 ? 'bg-green-400' : 'bg-white/30'
                  }`}
                />
                <span className="text-xs text-white/60">
                  {peerCount > 0 ? t('sync.peerCount', { count: peerCount }) : t('sync.noPeers')}
                </span>
              </div>

              <p className="text-xs text-white/40">{t('sync.autoSyncNote')}</p>

              <label className="flex items-center gap-1.5 text-xs text-white/70">
                <input
                  type="checkbox"
                  checked={syncPerformance}
                  onChange={(e) => setSyncPerformance(e.target.checked)}
                  className="accent-orange-500"
                />
                {t('sync.syncPerformance')}
                <Tooltip text={t('sync.syncPerformanceHint')} />
              </label>
            </>
          )}
        </>
      )}
    </>
  );
}

function ShortcutsTab() {
  const { t } = useTranslation('settings');

  return (
    <>
      <h3 className="text-sm font-semibold text-white">{t('tabs.shortcuts')}</h3>
      <div className="flex flex-col gap-2">
        {SHORTCUTS.map((s) => (
          <div key={s.key} className="flex items-center justify-between">
            <kbd className="rounded bg-white/10 px-2 py-0.5 font-mono text-xs text-white/80">
              {s.key}
            </kbd>
            <span className="text-xs text-white/60">{t(`shortcutActions.${s.actionKey}`)}</span>
          </div>
        ))}
      </div>
    </>
  );
}
