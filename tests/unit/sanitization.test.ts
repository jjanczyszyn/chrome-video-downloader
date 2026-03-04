import { describe, it, expect } from 'vitest';
import { sanitizeFilename, buildSavePath, filenameFromUrl, padIndex } from '../../src/shared/utils';

describe('sanitizeFilename', () => {
  it('removes path separators', () => {
    expect(sanitizeFilename('path/to/file')).not.toContain('/');
    expect(sanitizeFilename('path\\to\\file')).not.toContain('\\');
  });

  it('removes colon and other reserved chars', () => {
    const result = sanitizeFilename('Module: "Advanced" <Topic>');
    expect(result).not.toMatch(/[:*?"<>|]/);
  });

  it('trims whitespace', () => {
    expect(sanitizeFilename('  hello world  ')).toBe('hello world');
  });

  it('handles emoji in filename', () => {
    // Should not throw and should produce a non-empty string
    const result = sanitizeFilename('🎓 Lesson 1 – TypeScript');
    expect(result.length).toBeGreaterThan(0);
  });

  it('collapses repeated spaces/hyphens', () => {
    const result = sanitizeFilename('Hello   ---   World');
    expect(result).not.toMatch(/\s{2,}/);
    expect(result).not.toMatch(/-{2,}/);
  });

  it('truncates long names to 200 chars', () => {
    const long = 'a'.repeat(300);
    expect(sanitizeFilename(long).length).toBeLessThanOrEqual(200);
  });

  it('returns "untitled" for empty or whitespace-only input', () => {
    expect(sanitizeFilename('')).toBe('untitled');
    expect(sanitizeFilename('   ')).toBe('untitled');
  });

  it('handles slashes that look like course hierarchy', () => {
    const result = sanitizeFilename('Module 1/Lesson 2');
    expect(result).not.toContain('/');
  });
});

describe('padIndex', () => {
  it('pads with leading zeros based on total', () => {
    expect(padIndex(1, 10)).toBe('01');
    expect(padIndex(1, 100)).toBe('001');
    expect(padIndex(99, 100)).toBe('099');
  });

  it('always uses at least 2 digits for readability', () => {
    expect(padIndex(3, 9)).toBe('03');
  });

  it('handles equal n and total (2-digit minimum)', () => {
    expect(padIndex(5, 5)).toBe('05');
  });
});

describe('buildSavePath', () => {
  it('constructs a correct path', () => {
    const path = buildSavePath({
      courseTitle: 'My Course',
      moduleIndex: 0,
      moduleTotal: 2,
      moduleTitle: 'Introduction',
      lessonIndex: 1,
      lessonTotal: 5,
      lessonTitle: 'First Steps',
      filename: 'notes.pdf',
    });

    expect(path).toContain('Course Library Exporter');
    expect(path).toContain('My Course');
    expect(path).toContain('01 - Introduction');
    expect(path).toContain('02 - First Steps');
    expect(path).toContain('notes.pdf');
  });

  it('sanitizes course title in path', () => {
    const path = buildSavePath({
      courseTitle: 'Course: "Advanced/Topics"',
      moduleIndex: 0,
      moduleTotal: 1,
      moduleTitle: 'Module',
      lessonIndex: 0,
      lessonTotal: 1,
      lessonTitle: 'Lesson',
      filename: 'file.pdf',
    });
    // Path must not contain illegal chars
    expect(path).not.toMatch(/[:*?"<>]/);
  });

  it('uses correct zero-padding based on total count', () => {
    const path = buildSavePath({
      courseTitle: 'Course',
      moduleIndex: 0,
      moduleTotal: 12,
      moduleTitle: 'Module One',
      lessonIndex: 9,
      lessonTotal: 15,
      lessonTitle: 'Lesson Ten',
      filename: 'file.mp4',
    });
    expect(path).toContain('01 - Module One');
    expect(path).toContain('10 - Lesson Ten');
  });
});

describe('filenameFromUrl', () => {
  it('extracts filename from URL', () => {
    expect(filenameFromUrl('http://example.com/assets/lecture.pdf')).toBe('lecture.pdf');
  });

  it('strips query string from filename', () => {
    const name = filenameFromUrl('http://example.com/video.mp4?token=abc');
    // URL object pathname gives /video.mp4 without query
    expect(name).toBe('video.mp4');
  });

  it('decodes URL-encoded filenames', () => {
    expect(filenameFromUrl('http://example.com/les%C3%B3n.pdf')).toBe('lesón.pdf');
  });

  it('returns "download" for paths without extension', () => {
    expect(filenameFromUrl('http://example.com/lesson/view')).toBe('download');
  });
});
