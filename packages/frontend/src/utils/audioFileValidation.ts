/**
 * Validates files selected by the user are audio files.
 *
 * Defence-in-depth: the `<input accept="audio/*">` attribute is advisory and
 * can be bypassed (drag-and-drop, devtools, non-compliant browsers). This
 * check enforces MIME type validation before files reach the audio pipeline.
 */

const AUDIO_MIME_PREFIX = 'audio/';

/** Common audio extensions for files that lack a MIME type (e.g. `.ogg` on some platforms). */
const AUDIO_EXTENSIONS = new Set([
  'mp3',
  'wav',
  'flac',
  'aac',
  'ogg',
  'oga',
  'opus',
  'weba',
  'webm',
  'm4a',
  'aiff',
  'aif',
  'wma',
  'mid',
  'midi',
]);

function isAudioFile(file: File): boolean {
  if (file.type.startsWith(AUDIO_MIME_PREFIX)) return true;

  // Fallback: some browsers report empty or generic MIME types for valid audio
  const ext = file.name.split('.').pop()?.toLowerCase();
  return ext !== undefined && AUDIO_EXTENSIONS.has(ext);
}

export interface ValidationResult {
  valid: File[];
  rejected: string[];
}

/**
 * Partitions a file list into valid audio files and rejected filenames.
 * Returns both so callers can decide how to surface the rejection.
 */
export function validateAudioFiles(files: File[]): ValidationResult {
  const valid: File[] = [];
  const rejected: string[] = [];

  for (const file of files) {
    if (isAudioFile(file)) {
      valid.push(file);
    } else {
      rejected.push(file.name);
    }
  }

  return { valid, rejected };
}

/** Builds a user-friendly rejection message listing the bad filenames. */
export function rejectionMessage(rejected: string[]): string {
  const count = rejected.length;
  const names =
    count <= 3 ? rejected.join(', ') : `${rejected.slice(0, 3).join(', ')} and ${count - 3} more`;

  return count === 1
    ? `"${names}" is not a supported audio file. Please use MP3, WAV, FLAC, OGG, AAC, or other common audio formats.`
    : `${count} files were not supported audio formats and were skipped: ${names}. Please use MP3, WAV, FLAC, OGG, AAC, or other common audio formats.`;
}
