import { describe, it, expect } from 'vitest';
import { getResourceType, isDownloadableUrl, classifyResource } from '../../src/shared/utils';
import type { RawResource } from '../../src/shared/types';

describe('getResourceType', () => {
  it('detects PDF', () => {
    expect(getResourceType('http://example.com/notes.pdf')).toBe('pdf');
  });

  it('detects MP4 variants', () => {
    expect(getResourceType('http://example.com/video.mp4')).toBe('mp4');
    expect(getResourceType('http://example.com/video.m4v')).toBe('mp4');
    expect(getResourceType('http://example.com/video.webm')).toBe('mp4');
  });

  it('detects ZIP variants', () => {
    expect(getResourceType('http://example.com/files.zip')).toBe('zip');
    expect(getResourceType('http://example.com/files.tar.gz')).toBe('zip');
  });

  it('detects RAR variants', () => {
    expect(getResourceType('http://example.com/files.rar')).toBe('rar');
    expect(getResourceType('http://example.com/files.7z')).toBe('rar');
  });

  it('detects m3u8 playlist', () => {
    expect(getResourceType('http://cdn.example.com/playlist.m3u8')).toBe('m3u8');
  });

  it('detects VTT subtitles', () => {
    expect(getResourceType('http://example.com/subtitles.vtt')).toBe('vtt');
    expect(getResourceType('http://example.com/subs.srt')).toBe('vtt');
  });

  it('detects Office documents', () => {
    expect(getResourceType('http://example.com/slides.pptx')).toBe('pptx');
    expect(getResourceType('http://example.com/data.xlsx')).toBe('xlsx');
    expect(getResourceType('http://example.com/doc.docx')).toBe('docx');
  });

  it('returns null for HTML pages', () => {
    expect(getResourceType('http://example.com/lesson/1')).toBeNull();
    expect(getResourceType('http://example.com/lesson.html')).toBeNull();
  });

  it('returns null for JS and CSS', () => {
    expect(getResourceType('http://example.com/app.js')).toBeNull();
    expect(getResourceType('http://example.com/style.css')).toBeNull();
  });

  it('handles URLs with query strings', () => {
    expect(getResourceType('http://example.com/video.mp4?token=xyz&quality=hd')).toBe('mp4');
  });

  it('handles URLs with uppercase extensions', () => {
    // Our implementation lowercases pathname
    expect(getResourceType('http://example.com/VIDEO.MP4')).toBe('mp4');
  });
});

describe('isDownloadableUrl', () => {
  it('returns true for downloadable file types', () => {
    expect(isDownloadableUrl('http://example.com/file.pdf')).toBe(true);
    expect(isDownloadableUrl('http://example.com/video.mp4')).toBe(true);
    expect(isDownloadableUrl('http://example.com/playlist.m3u8')).toBe(true);
  });

  it('returns false for HTML and navigation URLs', () => {
    expect(isDownloadableUrl('http://example.com/')).toBe(false);
    expect(isDownloadableUrl('http://example.com/lesson')).toBe(false);
    expect(isDownloadableUrl('http://example.com/course/module')).toBe(false);
  });
});

describe('classifyResource', () => {
  function makeResource(type: RawResource['type']): RawResource {
    return { url: `http://example.com/file.${type}`, title: 'Test', type };
  }

  it('marks PDFs as downloadable_allowed', () => {
    expect(classifyResource(makeResource('pdf'))).toBe('downloadable_allowed');
  });

  it('marks MP4 as downloadable_allowed', () => {
    expect(classifyResource(makeResource('mp4'))).toBe('downloadable_allowed');
  });

  it('marks m3u8 playlists as downloadable_allowed', () => {
    // We download the playlist file, not stream it
    expect(classifyResource(makeResource('m3u8'))).toBe('downloadable_allowed');
  });

  it('marks VTT subtitles as downloadable_allowed', () => {
    expect(classifyResource(makeResource('vtt'))).toBe('downloadable_allowed');
  });

  it('marks ZIP as downloadable_allowed', () => {
    expect(classifyResource(makeResource('zip'))).toBe('downloadable_allowed');
  });

  it('marks Office docs as downloadable_allowed', () => {
    expect(classifyResource(makeResource('docx'))).toBe('downloadable_allowed');
    expect(classifyResource(makeResource('pptx'))).toBe('downloadable_allowed');
    expect(classifyResource(makeResource('xlsx'))).toBe('downloadable_allowed');
  });

  it('marks unknown types as skipped_streaming', () => {
    expect(classifyResource(makeResource('other'))).toBe('skipped_streaming');
  });
});
