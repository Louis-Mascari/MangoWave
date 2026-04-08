import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Virtuoso } from 'react-virtuoso';
import { useImportModalStore } from '../store/useImportModalStore.ts';
import { useSettingsStore } from '../store/useSettingsStore.ts';
import { useFocusTrap } from '../hooks/useFocusTrap.ts';
import type { ImportResult } from '../engine/importProcessor.ts';

type Phase = 'select' | 'processing' | 'results';
type ResultFilter = 'all' | 'success' | 'warning' | 'failed';

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
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [isDragOver, setIsDragOver] = useState(false);
  const [idbError, setIdbError] = useState(false);
  const [resultFilter, setResultFilter] = useState<ResultFilter>('all');
  const dragCounterRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textureInputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const textureSectionRef = useRef<HTMLDivElement>(null);

  // Mutable results array — avoids O(n²) array copies from [...prev, result].
  // resultCount state triggers re-renders; Virtuoso reads from the ref.
  const resultsRef = useRef<ImportResult[]>([]);
  const [resultCount, setResultCount] = useState(0);

  // Inline texture upload state
  const [uploadedTextures, setUploadedTextures] = useState<Set<string>>(new Set());
  const [textureSectionExpanded, setTextureSectionExpanded] = useState(true);
  const [textureUploading, setTextureUploading] = useState(false);
  const [textureUploadError, setTextureUploadError] = useState<string | null>(null);
  const [textureDragOver, setTextureDragOver] = useState(false);
  const textureDragCounterRef = useRef(0);

  useFocusTrap(dialogRef, true);

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

  // Aggregate all missing texture names from results, deduplicated.
  const missingTextureNames = useMemo(() => {
    const names = new Set<string>();
    for (const r of resultsRef.current) {
      for (const w of r.warnings) {
        names.add(w);
      }
    }
    return names;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultCount]);

  const unresolvedTextureCount = useMemo(() => {
    let count = 0;
    for (const name of missingTextureNames) {
      if (!uploadedTextures.has(name) && !importedTextureNameSet.has(name)) count++;
    }
    return count;
  }, [missingTextureNames, uploadedTextures, importedTextureNameSet]);

  // Derive summary stats from the ref, recomputed only when resultCount changes.
  const { successCount, warningCount, failedCount, hasTextureWarnings } = useMemo(() => {
    let success = 0;
    let warning = 0;
    let failed = 0;
    let texWarn = false;
    for (const r of resultsRef.current) {
      if (r.status === 'success') success++;
      else if (r.status === 'warning') warning++;
      else if (r.status === 'failed') failed++;
      if (r.warnings.length > 0) texWarn = true;
    }
    return {
      successCount: success,
      warningCount: warning,
      failedCount: failed,
      hasTextureWarnings: mode === 'preset' && texWarn,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultCount, mode]);

  // Filtered result indices for the active tab — avoids copying the array.
  const filteredIndices = useMemo(() => {
    if (resultFilter === 'all') return null; // null = show all (Virtuoso uses resultCount directly)
    const indices: number[] = [];
    for (let i = 0; i < resultsRef.current.length; i++) {
      const r = resultsRef.current[i];
      if (resultFilter === 'success' && r.status === 'success') indices.push(i);
      else if (resultFilter === 'warning' && r.status === 'warning') indices.push(i);
      else if (resultFilter === 'failed' && r.status === 'failed') indices.push(i);
    }
    return indices;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultFilter, resultCount]);

  const visibleCount = filteredIndices ? filteredIndices.length : resultCount;

  const handleFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;

      setPhase('processing');
      setProgress({ current: 0, total: files.length });
      resultsRef.current = [];
      setResultCount(0);
      setIdbError(false);
      setResultFilter('all');

      const onProgress = (result: ImportResult, current: number, total: number) => {
        resultsRef.current.push(result);
        setResultCount(resultsRef.current.length);
        setProgress({ current, total });
      };

      try {
        const { processPresetImport, processTextureImport } =
          await import('../engine/importProcessor.ts');
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
      } catch {
        // IDB unavailable
        setIdbError(true);
      }

      setPhase('results');
    },
    [mode, importedNameSet, importedTextureNameSet, presetPackMap],
  );

  const handleInlineTextureFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;

      setTextureUploading(true);
      setTextureUploadError(null);

      try {
        const { processTextureImport } = await import('../engine/importProcessor.ts');
        const uploaded = new Set<string>();

        await processTextureImport(files, {
          existingTextureNames: importedTextureNameSet,
          onProgress: (result) => {
            if (result.status === 'success' && result.presetName) {
              uploaded.add(result.presetName);
            }
          },
        });

        if (uploaded.size > 0) {
          setUploadedTextures((prev) => {
            const next = new Set(prev);
            for (const name of uploaded) next.add(name);
            return next;
          });
        }
      } catch {
        setTextureUploadError(t('importModal.idbUnavailable'));
      }

      setTextureUploading(false);
    },
    [importedTextureNameSet, t],
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

  const handleTextureDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    textureDragCounterRef.current++;
    if (textureDragCounterRef.current === 1) setTextureDragOver(true);
  }, []);

  const handleTextureDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    textureDragCounterRef.current--;
    if (textureDragCounterRef.current === 0) setTextureDragOver(false);
  }, []);

  const handleTextureDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      textureDragCounterRef.current = 0;
      setTextureDragOver(false);
      handleInlineTextureFiles(Array.from(e.dataTransfer.files));
    },
    [handleInlineTextureFiles],
  );

  const handleBrowse = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleTextureBrowse = useCallback(() => {
    textureInputRef.current?.click();
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files ? Array.from(e.target.files) : [];
      e.target.value = '';
      handleFiles(files);
    },
    [handleFiles],
  );

  const handleTextureInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files ? Array.from(e.target.files) : [];
      e.target.value = '';
      handleInlineTextureFiles(files);
    },
    [handleInlineTextureFiles],
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

  const handleTextureDropZoneKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleTextureBrowse();
      }
    },
    [handleTextureBrowse],
  );

  const handleImportMore = useCallback(() => {
    resultsRef.current = [];
    setResultCount(0);
    setPhase('select');
    setProgress({ current: 0, total: 0 });
    setIdbError(false);
    setResultFilter('all');
    setUploadedTextures(new Set());
    setTextureUploadError(null);
  }, []);

  const handleBackdropClick = useCallback(() => {
    if (phase !== 'processing') close();
  }, [phase, close]);

  const title = mode === 'preset' ? t('importModal.titlePresets') : t('importModal.titleTextures');
  const typeLabel = mode === 'preset' ? t('importModal.presets') : t('importModal.textures');

  const renderResultItem = useCallback(
    (index: number) => {
      const actualIndex = filteredIndices ? filteredIndices[index] : index;
      const result = resultsRef.current[actualIndex];
      if (!result) return <div />;
      return (
        <ResultRow
          result={result}
          mode={mode}
          uploadedTextures={uploadedTextures}
          importedTextureNameSet={importedTextureNameSet}
        />
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filteredIndices, mode, resultCount, uploadedTextures, importedTextureNameSet],
  );

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
        className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-lg bg-gray-900/95 p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">{title}</h3>
          {phase !== 'processing' && (
            <button
              onClick={close}
              className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border-none bg-white/10 text-sm text-white/70 hover:bg-white/20"
              aria-label={tc('close')}
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
                <path
                  fillRule="evenodd"
                  d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          )}
        </div>

        {/* Select phase */}
        {phase === 'select' && (
          <>
            <ul className="mb-3 flex list-outside list-disc flex-col gap-1 pl-4 text-xs leading-relaxed text-white/50">
              {(mode === 'preset'
                ? t('importModal.descriptionPresets')
                : t('importModal.descriptionTextures')
              )
                .split('\n')
                .map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
            </ul>
            <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2">
              <p className="text-xs text-amber-300/70">
                {mode === 'preset'
                  ? t('importModal.storageNotePresets')
                  : t('importModal.storageNoteTextures')}
              </p>
            </div>
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
          <div className="flex flex-col items-center gap-3 py-4">
            <svg className="h-6 w-6 animate-spin text-orange-400" viewBox="0 0 24 24" fill="none">
              <circle
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="3"
                className="opacity-25"
              />
              <path
                d="M4 12a8 8 0 018-8"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
              />
            </svg>
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
          </div>
        )}

        {/* Results phase */}
        {phase === 'results' && (
          <div className="flex min-h-0 flex-col gap-3">
            {idbError && <p className="text-xs text-red-400">{t('importModal.idbUnavailable')}</p>}

            {!idbError && resultCount > 0 && (
              <>
                <p className="text-xs text-white/70">
                  <SummaryText
                    successCount={successCount + warningCount}
                    failedCount={failedCount}
                    warningCount={warningCount}
                    total={resultCount}
                    typeLabel={typeLabel}
                  />
                </p>

                {/* Filter tabs — only shown when there are mixed statuses */}
                {(failedCount > 0 || warningCount > 0) && successCount + warningCount > 0 && (
                  <div className="flex gap-1">
                    <FilterTab
                      label={t('importModal.filterAll')}
                      count={resultCount}
                      active={resultFilter === 'all'}
                      onClick={() => setResultFilter('all')}
                    />
                    {successCount > 0 && (
                      <FilterTab
                        label={t('importModal.statusSuccess')}
                        count={successCount}
                        active={resultFilter === 'success'}
                        onClick={() => setResultFilter('success')}
                        color="text-green-400"
                      />
                    )}
                    {warningCount > 0 && (
                      <FilterTab
                        label={t('importModal.statusWarning')}
                        count={warningCount}
                        active={resultFilter === 'warning'}
                        onClick={() => setResultFilter('warning')}
                        color="text-amber-400"
                      />
                    )}
                    {failedCount > 0 && (
                      <FilterTab
                        label={t('importModal.statusFailed')}
                        count={failedCount}
                        active={resultFilter === 'failed'}
                        onClick={() => setResultFilter('failed')}
                        color="text-red-400"
                      />
                    )}
                  </div>
                )}

                <Virtuoso
                  totalCount={visibleCount}
                  itemContent={renderResultItem}
                  style={{ height: Math.min(visibleCount * 36, 350) }}
                  className="overflow-y-auto"
                />

                {/* Inline missing textures section */}
                {hasTextureWarnings && (
                  <div
                    ref={textureSectionRef}
                    className="rounded-lg border border-amber-500/20 bg-amber-500/5"
                  >
                    <button
                      onClick={() => setTextureSectionExpanded((prev) => !prev)}
                      className="flex w-full cursor-pointer items-center justify-between border-none bg-transparent px-3 py-2 text-left"
                    >
                      <span className="text-xs font-medium text-amber-300">
                        {unresolvedTextureCount > 0
                          ? t('importModal.missingTexturesSection', {
                              remaining: unresolvedTextureCount,
                            })
                          : t('importModal.missingTexturesAllResolved')}
                      </span>
                      <svg
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        className={`h-4 w-4 text-amber-300/60 transition-transform ${
                          textureSectionExpanded ? 'rotate-180' : ''
                        }`}
                      >
                        <path
                          fillRule="evenodd"
                          d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </button>

                    {textureSectionExpanded && (
                      <div className="flex flex-col gap-2 border-t border-amber-500/10 px-3 pb-3 pt-2">
                        <p className="text-[10px] leading-relaxed text-white/40">
                          {t('importModal.missingTexturesHint')}
                        </p>
                        {/* Missing texture list */}
                        <div className="flex max-h-24 flex-col gap-0.5 overflow-y-auto">
                          {[...missingTextureNames].map((name) => {
                            const resolved =
                              uploadedTextures.has(name) || importedTextureNameSet.has(name);
                            return (
                              <div key={name} className="flex items-center gap-1.5">
                                {resolved ? (
                                  <svg
                                    viewBox="0 0 20 20"
                                    fill="currentColor"
                                    className="h-3 w-3 flex-shrink-0 text-green-400"
                                  >
                                    <path
                                      fillRule="evenodd"
                                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                                      clipRule="evenodd"
                                    />
                                  </svg>
                                ) : (
                                  <svg
                                    viewBox="0 0 20 20"
                                    fill="currentColor"
                                    className="h-3 w-3 flex-shrink-0 text-amber-400"
                                  >
                                    <path
                                      fillRule="evenodd"
                                      d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.345 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
                                      clipRule="evenodd"
                                    />
                                  </svg>
                                )}
                                <span
                                  className={`text-[10px] ${resolved ? 'text-white/40 line-through' : 'text-white/70'}`}
                                >
                                  {name}
                                </span>
                              </div>
                            );
                          })}
                        </div>

                        {/* Compact upload area */}
                        {unresolvedTextureCount > 0 && (
                          <>
                            <div
                              role="button"
                              tabIndex={0}
                              onDragEnter={handleTextureDragEnter}
                              onDragLeave={handleTextureDragLeave}
                              onDragOver={handleDragOver}
                              onDrop={handleTextureDrop}
                              onClick={handleTextureBrowse}
                              onKeyDown={handleTextureDropZoneKeyDown}
                              className={`flex cursor-pointer items-center justify-center gap-2 rounded border-2 border-dashed px-3 py-2 transition-colors ${
                                textureDragOver
                                  ? 'border-orange-500 bg-orange-500/10'
                                  : 'border-white/15 hover:border-white/30'
                              }`}
                            >
                              {textureUploading ? (
                                <svg
                                  className="h-4 w-4 animate-spin text-orange-400"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                >
                                  <circle
                                    cx="12"
                                    cy="12"
                                    r="10"
                                    stroke="currentColor"
                                    strokeWidth="3"
                                    className="opacity-25"
                                  />
                                  <path
                                    d="M4 12a8 8 0 018-8"
                                    stroke="currentColor"
                                    strokeWidth="3"
                                    strokeLinecap="round"
                                  />
                                </svg>
                              ) : (
                                <svg
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth={1.5}
                                  className="h-4 w-4 text-white/40"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
                                  />
                                </svg>
                              )}
                              <span className="text-[10px] text-white/50">
                                {t('importModal.dropTexturesHere')}
                              </span>
                            </div>
                            <input
                              ref={textureInputRef}
                              type="file"
                              multiple
                              accept="image/jpeg,image/png,image/webp"
                              onChange={handleTextureInputChange}
                              className="hidden"
                            />
                          </>
                        )}

                        {textureUploadError && (
                          <p className="text-[10px] text-red-400">{textureUploadError}</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            <div className="flex flex-wrap justify-end gap-2">
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

function FilterTab({
  label,
  count,
  active,
  onClick,
  color,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  color?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`cursor-pointer rounded border-none px-2 py-0.5 text-[10px] transition-colors ${
        active ? 'bg-white/15 text-white' : 'bg-white/5 text-white/50 hover:bg-white/10'
      }`}
    >
      <span className={color}>{label}</span> <span className="text-white/40">{count}</span>
    </button>
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

function ResultRow({
  result,
  mode,
  uploadedTextures,
  importedTextureNameSet,
}: {
  result: ImportResult;
  mode: 'preset' | 'texture';
  uploadedTextures: Set<string>;
  importedTextureNameSet: Set<string>;
}) {
  const { t } = useTranslation('messages');
  const displayName = result.presetName ?? result.fileName;
  const errorNs = mode === 'preset' ? 'importedPresets' : 'importedTextures';

  // Compute which warnings are still unresolved
  const unresolvedWarnings = result.warnings.filter(
    (w) => !uploadedTextures.has(w) && !importedTextureNameSet.has(w),
  );
  const allWarningsResolved = result.warnings.length > 0 && unresolvedWarnings.length === 0;

  // Effective status icon: if all warnings are resolved, show success icon
  const effectiveStatus = allWarningsResolved ? 'success' : result.status;

  return (
    <div className="flex items-start gap-2 border-b border-white/5 py-1.5 last:border-b-0">
      <span className="mt-0.5 flex-shrink-0">
        {effectiveStatus === 'success' && (
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 text-green-400">
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
              clipRule="evenodd"
            />
          </svg>
        )}
        {effectiveStatus === 'warning' && (
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 text-amber-400">
            <path
              fillRule="evenodd"
              d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.345 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
              clipRule="evenodd"
            />
          </svg>
        )}
        {effectiveStatus === 'failed' && (
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
            {t(`${errorNs}.${result.errorCode}`, {
              name: result.fileName,
              defaultValue: result.errorCode,
            })}
          </p>
        )}
        {result.warnings.length > 0 && (
          <p className="text-[10px] text-amber-400/80">
            {allWarningsResolved ? (
              <span className="text-green-400/80 line-through">
                {t('importedPresets.missingTextures', {
                  textures: result.warnings.join(', '),
                })}
              </span>
            ) : unresolvedWarnings.length < result.warnings.length ? (
              <>
                {t('importedPresets.missingTextures', {
                  textures: unresolvedWarnings.join(', '),
                })}
              </>
            ) : (
              t('importedPresets.missingTextures', { textures: result.warnings.join(', ') })
            )}
          </p>
        )}
      </div>
    </div>
  );
}
