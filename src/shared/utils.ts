import type { ResourceType, RawResource } from './types';

// ─── URL utilities ─────────────────────────────────────────────────────────

/** Remove hash + trailing slash and lowercase for deduplication */
export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = '';
    let path = u.pathname.replace(/\/+$/, '');
    u.pathname = path || '/';
    return u.toString().toLowerCase();
  } catch {
    return url.toLowerCase().trim();
  }
}

/** Resolve a possibly-relative URL against a base */
export function resolveUrl(href: string, base: string): string | null {
  try {
    return new URL(href, base).href;
  } catch {
    return null;
  }
}

/** Extract the origin (scheme + host + port) from a URL */
export function getOrigin(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
}

// ─── Extension/type detection ──────────────────────────────────────────────

const DOWNLOADABLE_EXTS: Record<string, ResourceType> = {
  pdf: 'pdf',
  mp4: 'mp4',
  m4v: 'mp4',
  mov: 'mp4',
  webm: 'mp4',
  zip: 'zip',
  gz: 'zip',
  tar: 'zip',
  rar: 'rar',
  '7z': 'rar',
  m3u8: 'm3u8',
  vtt: 'vtt',
  srt: 'vtt',
  docx: 'docx',
  doc: 'docx',
  pptx: 'pptx',
  ppt: 'pptx',
  xlsx: 'xlsx',
  xls: 'xlsx',
};

/** Return the resource type for a URL, or null if not downloadable */
export function getResourceType(url: string): ResourceType | null {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    const ext = pathname.split('.').pop()?.replace(/[?#].*/, '') ?? '';
    return DOWNLOADABLE_EXTS[ext] ?? null;
  } catch {
    return null;
  }
}

/** True if the URL points to a directly downloadable resource */
export function isDownloadableUrl(url: string): boolean {
  return getResourceType(url) !== null;
}

// ─── Filename sanitization ─────────────────────────────────────────────────

/** Replace characters that are illegal or problematic in filesystem paths */
export function sanitizeFilename(name: string): string {
  return name
    .normalize('NFC')
    // Remove control characters
    .replace(/[\x00-\x1f\x7f]/g, '')
    // Replace path separators and reserved characters
    .replace(/[/\\:*?"<>|]/g, '-')
    // Collapse repeated hyphens/spaces
    .replace(/[-\s]+/g, ' ')
    .trim()
    // Truncate to 200 chars to stay within filesystem limits
    .slice(0, 200)
    || 'untitled';
}

/** Pad a number with leading zeros so lexicographic sort == numeric sort.
 *  Always uses at least 2 digits (e.g. 01, 02 … 09, 10) for readability. */
export function padIndex(n: number, total: number): string {
  const digits = Math.max(2, String(total).length);
  return String(n).padStart(digits, '0');
}

/**
 * Build the download save-path for a resource.
 * Format: "Course Library Exporter/<course>/<MM - Module>/<LL - Lesson>/<filename>"
 */
export function buildSavePath(opts: {
  courseTitle: string;
  moduleIndex: number;
  moduleTotal: number;
  moduleTitle: string;
  lessonIndex: number;
  lessonTotal: number;
  lessonTitle: string;
  filename: string;
}): string {
  const {
    courseTitle,
    moduleIndex,
    moduleTotal,
    moduleTitle,
    lessonIndex,
    lessonTotal,
    lessonTitle,
    filename,
  } = opts;

  const parts = [
    'Course Library Exporter',
    sanitizeFilename(courseTitle),
    `${padIndex(moduleIndex + 1, moduleTotal)} - ${sanitizeFilename(moduleTitle)}`,
    `${padIndex(lessonIndex + 1, lessonTotal)} - ${sanitizeFilename(lessonTitle)}`,
    sanitizeFilename(filename),
  ];

  return parts.join('/');
}

/** Derive a filename from a URL */
export function filenameFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const parts = pathname.split('/');
    const last = parts[parts.length - 1];
    if (last && last.includes('.')) return decodeURIComponent(last);
    return 'download';
  } catch {
    return 'download';
  }
}

// ─── Misc helpers ──────────────────────────────────────────────────────────

export function generateId(): string {
  return crypto.randomUUID();
}

export function nowISO(): string {
  return new Date().toISOString();
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Parse an m3u8 playlist text and return any referenced VTT subtitle URLs,
 * resolved against the playlist's own URL.
 */
export function extractVttFromM3u8(m3u8Text: string, m3u8Url: string): string[] {
  const urls: string[] = [];
  const lines = m3u8Text.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();

    // #EXT-X-MEDIA:TYPE=SUBTITLES,...,URI="path/to/subs.vtt"
    if (trimmed.startsWith('#EXT-X-MEDIA') && trimmed.includes('TYPE=SUBTITLES')) {
      const uriMatch = trimmed.match(/URI="([^"]+)"/i);
      if (uriMatch) {
        const resolved = resolveUrl(uriMatch[1], m3u8Url);
        if (resolved) urls.push(resolved);
      }
    }

    // Plain .vtt lines (some playlists embed vtt segment references)
    if (trimmed.endsWith('.vtt') && !trimmed.startsWith('#')) {
      const resolved = resolveUrl(trimmed, m3u8Url);
      if (resolved) urls.push(resolved);
    }
  }

  return [...new Set(urls)];
}

/** Decide whether a resource should be downloaded or skipped.
 *  Returns 'downloadable_allowed' | 'skipped_streaming'.
 *
 *  Rules (as documented in README – no DRM bypass):
 *  - m3u8 playlists:  DOWNLOAD the playlist file (and any VTT refs found)
 *  - direct mp4/pdf/zip/docx/… links: DOWNLOAD
 *  - vtt subtitle files: DOWNLOAD
 *  - Everything else: skipped
 */
export function classifyResource(r: RawResource): 'downloadable_allowed' | 'skipped_streaming' {
  // All types we explicitly handle are downloadable
  if (
    r.type === 'pdf' ||
    r.type === 'mp4' ||
    r.type === 'zip' ||
    r.type === 'rar' ||
    r.type === 'm3u8' ||
    r.type === 'vtt' ||
    r.type === 'docx' ||
    r.type === 'pptx' ||
    r.type === 'xlsx'
  ) {
    return 'downloadable_allowed';
  }
  return 'skipped_streaming';
}
