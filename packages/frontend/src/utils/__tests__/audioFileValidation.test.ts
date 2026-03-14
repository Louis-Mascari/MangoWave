import { describe, it, expect } from 'vitest';
import { validateAudioFiles, rejectionMessage } from '../audioFileValidation.ts';

function fakeFile(name: string, type: string): File {
  return new File([''], name, { type });
}

describe('validateAudioFiles', () => {
  it('accepts files with audio/* MIME type', () => {
    const files = [fakeFile('song.mp3', 'audio/mpeg'), fakeFile('track.wav', 'audio/wav')];
    const { valid, rejected } = validateAudioFiles(files);
    expect(valid).toHaveLength(2);
    expect(rejected).toHaveLength(0);
  });

  it('accepts files with known audio extension but empty MIME', () => {
    const file = fakeFile('song.flac', '');
    const { valid, rejected } = validateAudioFiles([file]);
    expect(valid).toHaveLength(1);
    expect(rejected).toHaveLength(0);
  });

  it('rejects non-audio files', () => {
    const files = [fakeFile('photo.jpg', 'image/jpeg'), fakeFile('doc.pdf', 'application/pdf')];
    const { valid, rejected } = validateAudioFiles(files);
    expect(valid).toHaveLength(0);
    expect(rejected).toEqual(['photo.jpg', 'doc.pdf']);
  });

  it('partitions mixed file lists', () => {
    const files = [
      fakeFile('song.mp3', 'audio/mpeg'),
      fakeFile('photo.png', 'image/png'),
      fakeFile('track.ogg', 'audio/ogg'),
    ];
    const { valid, rejected } = validateAudioFiles(files);
    expect(valid).toHaveLength(2);
    expect(rejected).toEqual(['photo.png']);
  });
});

describe('rejectionMessage', () => {
  it('singular message for one file', () => {
    const msg = rejectionMessage(['photo.jpg']);
    expect(msg).toContain('"photo.jpg"');
    expect(msg).toContain('not a supported audio file');
  });

  it('lists up to 3 filenames', () => {
    const msg = rejectionMessage(['a.jpg', 'b.png', 'c.txt']);
    expect(msg).toContain('3 files');
    expect(msg).toContain('a.jpg, b.png, c.txt');
  });

  it('truncates beyond 3 filenames', () => {
    const msg = rejectionMessage(['a.jpg', 'b.png', 'c.txt', 'd.bmp']);
    expect(msg).toContain('a.jpg, b.png, c.txt and 1 more');
  });
});
