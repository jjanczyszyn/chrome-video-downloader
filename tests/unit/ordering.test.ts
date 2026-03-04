import { describe, it, expect } from 'vitest';
import { padIndex, buildSavePath, extractVttFromM3u8 } from '../../src/shared/utils';

describe('padIndex (ordering)', () => {
  it('produces correct lex-sortable zero-padded strings', () => {
    const indices = [1, 2, 10, 11, 20].map((n) => padIndex(n, 20));
    const sorted = [...indices].sort();
    // Lexicographic sort should match numeric order
    expect(sorted).toEqual(indices);
    // All should be 2 digits minimum
    indices.forEach((s) => expect(s.length).toBeGreaterThanOrEqual(2));
  });

  it('uses at least 2 digits (minimum padding)', () => {
    // Even a single-item list gets 2 digits for readability
    expect(padIndex(1, 1)).toBe('01');
    expect(padIndex(9, 9)).toBe('09');
  });

  it('three digits for 100+ total', () => {
    expect(padIndex(5, 100)).toBe('005');
    expect(padIndex(99, 100)).toBe('099');
    expect(padIndex(100, 100)).toBe('100');
  });
});

describe('buildSavePath folder structure', () => {
  it('always starts with Course Library Exporter', () => {
    const path = buildSavePath({
      courseTitle: 'My Course',
      moduleIndex: 0,
      moduleTotal: 1,
      moduleTitle: 'Intro',
      lessonIndex: 0,
      lessonTotal: 1,
      lessonTitle: 'Lesson',
      filename: 'file.pdf',
    });
    expect(path.startsWith('Course Library Exporter/')).toBe(true);
  });

  it('organizes into 4-level hierarchy', () => {
    const path = buildSavePath({
      courseTitle: 'Course',
      moduleIndex: 0,
      moduleTotal: 1,
      moduleTitle: 'Module',
      lessonIndex: 0,
      lessonTotal: 1,
      lessonTitle: 'Lesson',
      filename: 'file.pdf',
    });
    // Should have 4 segments separated by /
    const segments = path.split('/');
    expect(segments.length).toBe(5); // CLE / course / module / lesson / file
  });

  it('generates stable paths for same inputs', () => {
    const opts = {
      courseTitle: 'TypeScript Mastery',
      moduleIndex: 1,
      moduleTotal: 3,
      moduleTitle: 'Advanced Types',
      lessonIndex: 0,
      lessonTotal: 5,
      lessonTitle: 'Generics',
      filename: 'notes.pdf',
    };
    expect(buildSavePath(opts)).toBe(buildSavePath(opts));
  });

  it('zero-pads module and lesson numbers', () => {
    const path = buildSavePath({
      courseTitle: 'Course',
      moduleIndex: 0,
      moduleTotal: 10,
      moduleTitle: 'Module A',
      lessonIndex: 2,
      lessonTotal: 10,
      lessonTitle: 'Lesson C',
      filename: 'file.pdf',
    });
    expect(path).toContain('01 - Module A');
    expect(path).toContain('03 - Lesson C');
  });
});

describe('extractVttFromM3u8', () => {
  const BASE_URL = 'http://cdn.example.com/course/playlist.m3u8';

  it('extracts VTT URI from EXT-X-MEDIA subtitle declaration', () => {
    const m3u8 = [
      '#EXTM3U',
      '#EXT-X-VERSION:3',
      '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="English",URI="en.vtt"',
      '#EXTINF:10.0,',
      'segment.ts',
    ].join('\n');

    const vtts = extractVttFromM3u8(m3u8, BASE_URL);
    expect(vtts).toHaveLength(1);
    expect(vtts[0]).toBe('http://cdn.example.com/course/en.vtt');
  });

  it('extracts absolute VTT URIs correctly', () => {
    const m3u8 = '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",URI="http://other.cdn.com/subs.vtt"';
    const vtts = extractVttFromM3u8(m3u8, BASE_URL);
    expect(vtts[0]).toBe('http://other.cdn.com/subs.vtt');
  });

  it('extracts bare .vtt lines', () => {
    const m3u8 = [
      '#EXTM3U',
      '#EXTINF:10.0,',
      'subtitles/en.vtt',
    ].join('\n');

    const vtts = extractVttFromM3u8(m3u8, BASE_URL);
    expect(vtts).toHaveLength(1);
    expect(vtts[0]).toContain('.vtt');
  });

  it('deduplicates the same VTT URL', () => {
    const m3u8 = [
      '#EXT-X-MEDIA:TYPE=SUBTITLES,URI="subs.vtt"',
      '#EXT-X-MEDIA:TYPE=SUBTITLES,URI="subs.vtt"',
    ].join('\n');

    const vtts = extractVttFromM3u8(m3u8, BASE_URL);
    expect(vtts).toHaveLength(1);
  });

  it('returns empty array for m3u8 with no subtitles', () => {
    const m3u8 = [
      '#EXTM3U',
      '#EXT-X-VERSION:3',
      '#EXTINF:10.0,',
      'video.ts',
      '#EXT-X-ENDLIST',
    ].join('\n');

    expect(extractVttFromM3u8(m3u8, BASE_URL)).toHaveLength(0);
  });

  it('handles multiple subtitle tracks', () => {
    const m3u8 = [
      '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="English",URI="en.vtt"',
      '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="French",URI="fr.vtt"',
      '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="Spanish",URI="es.vtt"',
    ].join('\n');

    const vtts = extractVttFromM3u8(m3u8, BASE_URL);
    expect(vtts).toHaveLength(3);
  });
});
