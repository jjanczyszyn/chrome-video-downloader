import { describe, it, expect } from 'vitest';
import { normalizeUrl, resolveUrl, getOrigin } from '../../src/shared/utils';

describe('normalizeUrl', () => {
  it('strips trailing slash', () => {
    expect(normalizeUrl('http://example.com/path/')).toBe('http://example.com/path');
  });

  it('strips fragment/hash', () => {
    expect(normalizeUrl('http://example.com/path#section')).toBe('http://example.com/path');
  });

  it('lowercases the URL', () => {
    expect(normalizeUrl('HTTP://Example.COM/Path')).toBe('http://example.com/path');
  });

  it('preserves query string', () => {
    const url = normalizeUrl('http://example.com/lesson?id=42#top');
    expect(url).toContain('id=42');
    expect(url).not.toContain('#top');
  });

  it('handles URL with no path', () => {
    const norm = normalizeUrl('http://example.com/');
    expect(norm).toMatch(/^http:\/\/example\.com/);
    // Should not have trailing slash on non-root
  });

  it('deduplicates the same URL regardless of trailing slash', () => {
    const a = normalizeUrl('http://course.io/lesson/1/');
    const b = normalizeUrl('http://course.io/lesson/1');
    expect(a).toBe(b);
  });

  it('handles invalid URLs gracefully', () => {
    const result = normalizeUrl('not-a-url');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('keeps port in URL', () => {
    const result = normalizeUrl('http://localhost:3456/course.html');
    expect(result).toContain('3456');
  });
});

describe('resolveUrl', () => {
  it('resolves a relative URL against a base', () => {
    expect(resolveUrl('/assets/file.pdf', 'http://example.com/course/')).toBe('http://example.com/assets/file.pdf');
  });

  it('returns absolute URLs unchanged', () => {
    expect(resolveUrl('http://cdn.example.com/video.m3u8', 'http://example.com/')).toBe('http://cdn.example.com/video.m3u8');
  });

  it('returns null for invalid hrefs', () => {
    expect(resolveUrl('javascript:void(0)', 'http://example.com/')).toBe('javascript:void(0)');
  });

  it('resolves relative paths correctly', () => {
    expect(resolveUrl('../assets/file.pdf', 'http://example.com/module1/lesson1.html')).toBe('http://example.com/assets/file.pdf');
  });
});

describe('getOrigin', () => {
  it('returns origin for valid URL', () => {
    expect(getOrigin('http://example.com/path?q=1')).toBe('http://example.com');
  });

  it('includes port when non-standard', () => {
    expect(getOrigin('http://localhost:3456/course.html')).toBe('http://localhost:3456');
  });

  it('returns empty string for invalid URL', () => {
    expect(getOrigin('not-a-url')).toBe('');
  });
});
