import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useImportModalStore } from '../store/useImportModalStore.ts';
import { useSettingsStore } from '../store/useSettingsStore.ts';
import { useFocusTrap } from '../hooks/useFocusTrap.ts';
import { processPresetImport, processTextureImport } from '../engine/importProcessor.ts';
import type { ImportResult } from '../engine/importProcessor.ts';

type Phase = 'select' | 'processing' | 'results';

/** Outer gate — renders nothing when closed, fresh-mounts inner on each open. */
export function ImportModal() {
  const isOpen = useImportModalStore((s) => s.isOpen);
  if (!isOpen) return null;
  return <ImportModalInner />;
}

/** Inner content — unmounts when modal closes, so state resets automatically. */
function ImportModalInner() {
  const { t } = useTranslation('messages');
  const { t: tc } = useTranslation('common');
  const mode = useImportModalStore((s) => s.mode);
  const presetPackMap = useImportModalStore((s) => s.presetPackMap);
  const close = useImportModalStore((s) => s.close);

  const [phase, setPhase] = useState<Phase>('select');
  const [results, setResults] = useState<ImportResult[]>([]);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [isDragOver, setIsDragOver] = useState(false);
  const [idbError, setIdbError] = useState(false);
  const dragCounterRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const resultListRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useFocusTrap(dialogRef, true);

  // Auto-scroll result list as results arrive
  useEffect(() => {
    if (resultListRef.current) {
      resultListRef.current.scrollTop = resultListRef.current.scrollHeight;
    }
  }, [results.length]);

  // Escape key closes (but not during processing)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && phase !== 'processing') close();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [phase, close]);

  const importedPresets = useSettingsStore((s) => s.importedPresets);
  const importedTextures = useSettingsStore((s) => s.importedTextures);

  const importedNameSet = useMemo(
    () => new Set(importedPresets.map((p) => p.name)),
    [importedPresets],
  );
  const importedTextureNameSet = useMemo(
    () => new Set(importedTextures.map((t) => t.name)),
    [importedTextures],
  );

  const handleFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;

      setPhase('processing');
      setProgress({ current: 0, total: files.length });
      setResults([]);
      setIdbError(false);

      const onProgress = (result: ImportResult, current: number, total: number) => {
        setResults((prev) => [...prev, result]);
        setProgress({ current, total });
      };

      try {
        if (mode === 'preset') {
          await processPresetImport(files, {
            importedNameSet,
            importedTextureNameSet,
            presetPackMap,
            onProgress,
          });
        } else {
          await processTextureImport(files, {
            existingTextureNames: importedTextureNameSet,
            onProgress,
          });
        }
      } catch (err) {
        if (err instanceof Error && err.message === 'batchTooLarge') {
          setResults([
            { fileName: '', status: 'failed', errorCode: 'batchTooLarge', warnings: [] },
          ]);
        } else {
          setIdbError(true);
        }
      }

      setPhase('results');
    },
    [mode, importedNameSet, importedTextureNameSet, presetPackMap],
  );

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (dragCounterRef.current === 1) setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) setIsDragOver(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounterRef.current = 0;
      setIsDragOver(false);
      handleFiles(Array.from(e.dataTransfer.files));
    },
    [handleFiles],
  );

  const handleBrowse = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files ? Array.from(e.target.files) : [];
      e.target.value = '';
      handleFiles(files);
    },
    [handleFiles],
  );

  const handleDropZoneKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleBrowse();
      }
    },
    [handleBrowse],
  );

  const handleImportMore = useCallback(() => {
    setPhase('select');
    setResults([]);
    setProgress({ current: 0, total: 0 });
    setIdbError(false);
  }, []);

  const handleUploadTextures = useCallback(() => {
    useImportModalStore.getState().close();
    setTimeout(() => useImportModalStore.getState().open('texture'), 50);
  }, []);

  const handleBackdropClick = useCallback(() => {
    if (phase !== 'processing') close();
  }, [phase, close]);

  const successCount = results.filter((r) => r.status === 'success').length;
  const warningCount = results.filter((r) => r.status === 'warning').length;
  const failedCount = results.filter((r) => r.status === 'failed').length;
  const hasTextureWarnings = mode === 'preset' && results.some((r) => r.warnings.length > 0);
  const title = mode === 'preset' ? t('importModal.titlePresets') : t('importModal.titleTextures');
  const typeLabel = mode === 'preset' ? t('importModal.presets') : t('importModal.textures');

  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-label={title}
        className="flex w-full max-w-lg flex-col rounded-lg bg-gray-900/95 p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-3 text-sm font-semibold text-white">{title}</h3>

        {/* Select phase */}
        {phase === 'select' && (
          <>
            <div
              role="button"
              tabIndex={0}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onClick={handleBrowse}
              onKeyDown={handleDropZoneKeyDown}
              className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors ${
                isDragOver
                  ? 'border-orange-500 bg-orange-500/10'
                  : 'border-white/20 hover:border-white/40'
              }`}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                className="mb-3 h-8 w-8 text-white/40"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
                />
              </svg>
              <p className="text-center text-xs text-white/60">
                {mode === 'preset'
                  ? t('importModal.dropZonePresets')
                  : t('importModal.dropZoneTextures')}
              </p>
              <button
                type="button"
                className="mt-3 cursor-pointer rounded-lg border-none bg-orange-500 px-4 py-1.5 text-xs font-medium text-white hover:bg-orange-600"
              >
                {t('importModal.browseFiles')}
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={mode === 'preset' ? '.milk' : 'image/jpeg,image/png,image/webp'}
              onChange={handleInputChange}
              className="hidden"
            />
          </>
        )}

        {/* Processing phase */}
        {phase === 'processing' && (
          <div className="flex flex-col gap-3">
            <p className="text-xs text-white/60">
              {t('importModal.importingProgress', {
                current: progress.current,
                total: progress.total,
              })}
            </p>
            <progress
              value={progress.current}
              max={progress.total}
              aria-valuenow={progress.current}
              aria-valuemax={progress.total}
              className="h-2 w-full appearance-none overflow-hidden rounded-full [&::-moz-progress-bar]:bg-orange-500 [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-bar]:bg-white/10 [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-orange-500"
            />
            <div
              ref={resultListRef}
              role="log"
              aria-live="polite"
              className="max-h-[40vh] overflow-y-auto"
            >
              {results.map((r, i) => (
                <ResultRow key={i} result={r} mode={mode} />
              ))}
            </div>
          </div>
        )}

        {/* Results phase */}
        {phase === 'results' && (
          <div className="flex flex-col gap-3">
            {idbError && <p className="text-xs text-red-400">{t('importModal.idbUnavailable')}</p>}

            {!idbError && results.length > 0 && (
              <p className="text-xs text-white/70">
                <SummaryText
                  successCount={successCount + warningCount}
                  failedCount={failedCount}
                  warningCount={warningCount}
                  total={results.length}
                  typeLabel={typeLabel}
                />
              </p>
            )}

            {results.length > 0 && !idbError && (
              <div
                ref={resultListRef}
                role="log"
                aria-live="polite"
                className="max-h-[50vh] overflow-y-auto"
              >
                {results.map((r, i) => (
                  <ResultRow key={i} result={r} mode={mode} />
                ))}
              </div>
            )}

            <div className="flex flex-wrap justify-end gap-2">
              {hasTextureWarnings && (
                <button
                  onClick={handleUploadTextures}
                  className="cursor-pointer rounded-lg border-none bg-amber-500/80 px-4 py-1.5 text-xs font-medium text-white hover:bg-amber-500"
                >
                  {t('importModal.uploadMissingTextures')}
                </button>
              )}
              {!idbError && (
                <button
                  onClick={handleImportMore}
                  className="cursor-pointer rounded-lg border-none bg-white/10 px-4 py-1.5 text-xs text-white/70 hover:bg-white/20"
                >
                  {t('importModal.importMore')}
                </button>
              )}
              <button
                onClick={close}
                className="cursor-pointer rounded-lg border-none bg-orange-500 px-4 py-1.5 text-xs font-medium text-white hover:bg-orange-600"
              >
                {tc('close')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryText({
  successCount,
  failedCount,
  warningCount,
  total,
  typeLabel,
}: {
  successCount: number;
  failedCount: number;
  warningCount: number;
  total: number;
  typeLabel: string;
}) {
  const { t } = useTranslation('messages');

  if (failedCount === 0) {
    return <>{t('importModal.summaryAllSuccess', { count: successCount, type: typeLabel })}</>;
  }
  if (successCount === 0) {
    return <>{t('importModal.summaryAllFailed', { count: total, type: typeLabel })}</>;
  }
  return (
    <>
      {t('importModal.summaryPartial', {
        success: successCount,
        total,
        type: typeLabel,
        failed: failedCount,
        warnings: warningCount,
      })}
    </>
  );
}

function ResultRow({ result, mode }: { result: ImportResult; mode: 'preset' | 'texture' }) {
  const { t } = useTranslation('messages');
  const displayName = result.presetName ?? result.fileName;
  const errorNs = mode === 'preset' ? 'importedPresets' : 'importedTextures';

  return (
    <div className="flex items-start gap-2 border-b border-white/5 py-1.5 last:border-b-0">
      <span className="mt-0.5 flex-shrink-0">
        {result.status === 'success' && (
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 text-green-400">
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
              clipRule="evenodd"
            />
          </svg>
        )}
        {result.status === 'warning' && (
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 text-amber-400">
            <path
              fillRule="evenodd"
              d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.345 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
              clipRule="evenodd"
            />
          </svg>
        )}
        {result.status === 'failed' && (
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 text-red-400">
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
              clipRule="evenodd"
            />
          </svg>
        )}
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-xs text-white/80">{displayName}</p>
        {result.status === 'failed' && result.errorCode && (
          <p className="text-[10px] text-red-400/80">
            {result.errorCode === 'batchTooLarge'
              ? t('importModal.batchTooLarge')
              : t(`${errorNs}.${result.errorCode}`, {
                  name: result.fileName,
                  defaultValue: result.errorCode,
                })}
          </p>
        )}
        {result.warnings.length > 0 && (
          <p className="text-[10px] text-amber-400/80">
            {t('importedPresets.missingTextures', { textures: result.warnings.join(', ') })}
          </p>
        )}
      </div>
    </div>
  );
}
