/**
 * Crawler orchestrates sequential page visits:
 * 1. Pop URL from queue
 * 2. Navigate a dedicated tab to that URL
 * 3. Wait for page load
 * 4. Inject extraction function via chrome.scripting.executeScript
 * 5. Process results → add new lesson/module links to queue
 * 6. Throttle and repeat
 */

import type { CrawlState, Resource, RawResource, PageExtractionResult } from '../shared/types';
import { loadState, saveState, appendLog } from './storage';
import {
  normalizeUrl,
  getOrigin,
  filenameFromUrl,
  generateId,
  nowISO,
  classifyResource,
  extractVttFromM3u8,
} from '../shared/utils';
import { broadcastState } from './index';

// ─── Tab management ────────────────────────────────────────────────────────

let crawlTabId: number | null = null;

async function getCrawlTab(): Promise<number> {
  if (crawlTabId !== null) {
    try {
      const tab = await chrome.tabs.get(crawlTabId);
      if (tab && !tab.discarded) return crawlTabId;
    } catch {
      // tab was closed
    }
  }
  const tab = await chrome.tabs.create({ url: 'about:blank', active: false });
  crawlTabId = tab.id!;
  return crawlTabId;
}

export function closeCrawlTab(): void {
  if (crawlTabId !== null) {
    chrome.tabs.remove(crawlTabId).catch(() => undefined);
    crawlTabId = null;
  }
}

// ─── Page navigation + extraction ─────────────────────────────────────────

function waitForTabComplete(tabId: number, timeoutMs = 15_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error('Tab load timeout'));
    }, timeoutMs);

    function listener(id: number, info: chrome.tabs.TabChangeInfo) {
      if (id === tabId && info.status === 'complete') {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }

    chrome.tabs.onUpdated.addListener(listener);
  });
}

/**
 * Navigate crawlTab to url, wait for load, inject extractor, return results.
 * The injected function is SELF-CONTAINED (no imports) so it runs in page context.
 */
async function extractFromPage(url: string, options: { sameOriginOnly: boolean; origin: string }): Promise<PageExtractionResult> {
  const tabId = await getCrawlTab();

  await chrome.tabs.update(tabId, { url });
  await waitForTabComplete(tabId);

  // Small extra delay for JS-rendered pages
  await new Promise((r) => setTimeout(r, 400));

  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: pageExtractorFunction,
    args: [options],
  });

  if (!results || results.length === 0 || results[0].result === undefined) {
    throw new Error('No extraction result returned from content script');
  }

  return results[0].result as PageExtractionResult;
}

/**
 * Self-contained extraction function injected into the page via chrome.scripting.
 * MUST NOT reference any imports – everything it needs is defined inline.
 */
function pageExtractorFunction(opts: { sameOriginOnly: boolean; origin: string }): PageExtractionResult {
  const { sameOriginOnly, origin } = opts;

  const DOWNLOADABLE_EXTS = new Set([
    'pdf', 'mp4', 'm4v', 'mov', 'webm', 'zip', 'gz', 'tar', 'rar', '7z',
    'm3u8', 'vtt', 'srt', 'docx', 'doc', 'pptx', 'ppt', 'xlsx', 'xls',
  ]);

  type ResourceType = 'pdf' | 'mp4' | 'zip' | 'm3u8' | 'vtt' | 'docx' | 'pptx' | 'xlsx' | 'rar' | 'other';

  function getExt(url: string): string {
    try {
      const path = new URL(url).pathname.toLowerCase();
      return path.split('.').pop()?.replace(/[?#].*/, '') ?? '';
    } catch {
      return '';
    }
  }

  function extToType(ext: string): ResourceType {
    if (['pdf'].includes(ext)) return 'pdf';
    if (['mp4', 'm4v', 'mov', 'webm'].includes(ext)) return 'mp4';
    if (['zip', 'gz', 'tar'].includes(ext)) return 'zip';
    if (['rar', '7z'].includes(ext)) return 'rar';
    if (['m3u8'].includes(ext)) return 'm3u8';
    if (['vtt', 'srt'].includes(ext)) return 'vtt';
    if (['docx', 'doc'].includes(ext)) return 'docx';
    if (['pptx', 'ppt'].includes(ext)) return 'pptx';
    if (['xlsx', 'xls'].includes(ext)) return 'xlsx';
    return 'other';
  }

  function resolveHref(href: string): string | null {
    try { return new URL(href, location.href).href; } catch { return null; }
  }

  function isSameOrigin(url: string): boolean {
    try { return new URL(url).origin === origin; } catch { return false; }
  }

  function looksLikeLessonLink(href: string, el: Element): boolean {
    if (!href || href === '#') return false;
    const text = el.textContent?.trim() ?? '';
    if (text.length < 2) return false;
    // Avoid resource links
    const ext = getExt(href);
    if (DOWNLOADABLE_EXTS.has(ext)) return false;
    // Avoid external links when sameOriginOnly
    if (sameOriginOnly && !isSameOrigin(href)) return false;
    return true;
  }

  // ── Course title ──────────────────────────────────────────────────────
  const courseTitle =
    document.querySelector('[data-course-title]')?.textContent?.trim() ||
    document.querySelector('.course-title')?.textContent?.trim() ||
    document.querySelector('h1')?.textContent?.trim() ||
    document.title;

  // ── Module title (breadcrumb) ─────────────────────────────────────────
  const moduleTitle =
    document.querySelector('[data-module-title]')?.textContent?.trim() ||
    document.querySelector('.module-title')?.textContent?.trim() ||
    document.querySelector('.breadcrumb li:nth-last-child(2)')?.textContent?.trim() ||
    undefined;

  // ── Page / lesson title ───────────────────────────────────────────────
  const pageTitle =
    document.querySelector('[data-lesson-title]')?.textContent?.trim() ||
    document.querySelector('.lesson-title')?.textContent?.trim() ||
    document.querySelector('h1')?.textContent?.trim() ||
    document.title;

  // ── Navigation links (module/lesson links) ────────────────────────────
  const lessonLinks: Array<{ title: string; url: string }> = [];
  const seenLessonUrls = new Set<string>();

  const navSelectors = [
    'nav a[href]',
    '.sidebar a[href]',
    '.course-nav a[href]',
    '.lesson-nav a[href]',
    '.module-list a[href]',
    '.curriculum a[href]',
    '[data-lesson] a[href]',
    '[data-module] a[href]',
    '.toc a[href]',
    '.table-of-contents a[href]',
  ];

  navSelectors.forEach((sel) => {
    document.querySelectorAll<HTMLAnchorElement>(sel).forEach((el) => {
      const href = resolveHref(el.getAttribute('href') ?? '');
      if (!href) return;
      const norm = href.toLowerCase();
      if (seenLessonUrls.has(norm)) return;
      if (!looksLikeLessonLink(href, el)) return;
      seenLessonUrls.add(norm);
      lessonLinks.push({ title: el.textContent?.trim() ?? '', url: href });
    });
  });

  // ── Downloadable resources ────────────────────────────────────────────
  const resources: Array<{ url: string; title: string; type: ResourceType }> = [];
  const seenResourceUrls = new Set<string>();

  function addResource(url: string, title: string, type: ResourceType) {
    const norm = url.toLowerCase();
    if (seenResourceUrls.has(norm)) return;
    seenResourceUrls.add(norm);
    resources.push({ url, title, type });
  }

  // <a href="...pdf"> / direct download links
  document.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((el) => {
    const href = resolveHref(el.getAttribute('href') ?? '');
    if (!href) return;
    const ext = getExt(href);
    if (!DOWNLOADABLE_EXTS.has(ext)) return;
    addResource(href, el.textContent?.trim() || el.getAttribute('download') || '', extToType(ext));
  });

  // <video src> and <source src>
  document.querySelectorAll<HTMLElement>('video[src], source[src]').forEach((el) => {
    const src = resolveHref(el.getAttribute('src') ?? '');
    if (!src) return;
    const ext = getExt(src);
    addResource(src, 'Video', extToType(ext) === 'other' ? 'mp4' : extToType(ext));
  });

  // <track src> subtitle tracks
  document.querySelectorAll<HTMLTrackElement>('track[src]').forEach((el) => {
    const src = resolveHref(el.getAttribute('src') ?? '');
    if (!src) return;
    addResource(src, el.getAttribute('label') || el.getAttribute('srclang') || 'Subtitle', 'vtt');
  });

  // Scan inline <script> tags for m3u8 URLs (HLS players like Video.js, JWPlayer)
  const scriptPattern = /https?:\/\/[^\s"']+\.m3u8[^\s"']*/gi;
  document.querySelectorAll('script').forEach((s) => {
    const text = s.textContent ?? '';
    const matches = text.match(scriptPattern) ?? [];
    matches.forEach((url) => addResource(url, 'HLS Stream', 'm3u8'));
  });

  // Also scan data-* attributes for m3u8
  document.querySelectorAll('[data-src], [data-file], [data-video]').forEach((el) => {
    const val = el.getAttribute('data-src') || el.getAttribute('data-file') || el.getAttribute('data-video');
    if (!val) return;
    const href = resolveHref(val);
    if (!href) return;
    const ext = getExt(href);
    if (DOWNLOADABLE_EXTS.has(ext)) {
      addResource(href, el.textContent?.trim() || 'Resource', extToType(ext));
    }
  });

  return { courseTitle, pageTitle, moduleTitle, lessonLinks, resources };
}

// ─── Crawl orchestration ───────────────────────────────────────────────────

let crawling = false;

export function isCrawling(): boolean {
  return crawling;
}

export async function startCrawl(startUrl: string): Promise<void> {
  if (crawling) return;
  crawling = true;

  let state = await loadState();
  state = appendLog(state, 'info', `Starting scan from: ${startUrl}`);
  state.status = 'scanning';
  state.startedAt = nowISO();
  state.queue = [startUrl];
  state.visited = [];
  state.progress = { pagesVisited: 0, totalPages: 1, resourcesFound: 0, resourcesDownloaded: 0, resourcesFailed: 0 };
  state.course = {
    title: 'Scanning…',
    url: startUrl,
    domain: getOrigin(startUrl),
    scannedAt: nowISO(),
    modules: [],
  };
  await saveState(state);
  await broadcastState(state);

  try {
    await runCrawlLoop();
  } catch (err) {
    let s = await loadState();
    s = appendLog(s, 'error', `Crawl error: ${String(err)}`);
    s.status = 'error';
    s.error = String(err);
    await saveState(s);
    await broadcastState(s);
  } finally {
    crawling = false;
    closeCrawlTab();
  }
}

export async function pauseCrawl(): Promise<void> {
  crawling = false;
  let state = await loadState();
  state.status = 'paused';
  state = appendLog(state, 'info', 'Scan paused');
  await saveState(state);
  await broadcastState(state);
}

export async function resumeCrawl(): Promise<void> {
  const state = await loadState();
  if (state.status !== 'paused') return;
  if (state.queue.length === 0) {
    state.status = 'scan_complete';
    await saveState(state);
    await broadcastState(state);
    return;
  }
  await startCrawlLoop();
}

async function startCrawlLoop(): Promise<void> {
  if (crawling) return;
  crawling = true;
  try {
    await runCrawlLoop();
  } finally {
    crawling = false;
    closeCrawlTab();
  }
}

async function runCrawlLoop(): Promise<void> {
  while (true) {
    let state = await loadState();

    if (!crawling || state.status === 'paused') break;

    if (state.queue.length === 0) {
      state.status = 'scan_complete';
      state.completedAt = nowISO();
      if (state.course) state.course.completedAt = state.completedAt;
      state = appendLog(state, 'success', `Scan complete. ${state.progress.pagesVisited} pages visited, ${state.progress.resourcesFound} resources found.`);
      await saveState(state);
      await broadcastState(state);
      break;
    }

    if (state.progress.pagesVisited >= state.options.maxPages) {
      state = appendLog(state, 'warn', `Reached max pages limit (${state.options.maxPages}). Stopping.`);
      state.status = 'scan_complete';
      state.completedAt = nowISO();
      await saveState(state);
      await broadcastState(state);
      break;
    }

    // Pop next URL
    const url = state.queue.shift()!;
    const normalizedUrl = normalizeUrl(url);

    if (state.visited.includes(normalizedUrl)) {
      await saveState(state);
      continue;
    }

    state.visited.push(normalizedUrl);
    state.progress.pagesVisited++;
    state = appendLog(state, 'info', `Visiting (${state.progress.pagesVisited}): ${url}`);
    await saveState(state);
    await broadcastState(state);

    try {
      const result = await extractFromPage(url, {
        sameOriginOnly: state.options.sameOriginOnly,
        origin: getOrigin(state.course?.url ?? url),
      });

      // Apply extraction result to state
      state = await loadState(); // reload in case other updates happened
      state = await applyExtractionResult(state, url, result);
      await saveState(state);
      await broadcastState(state);
    } catch (err) {
      state = await loadState();
      state = appendLog(state, 'error', `Failed to extract from ${url}: ${String(err)}`);
      await saveState(state);
      await broadcastState(state);
    }

    // Throttle
    await new Promise((r) => setTimeout(r, state.options.delayMs));
  }
}

// ─── Extraction result processing ─────────────────────────────────────────

async function applyExtractionResult(
  state: CrawlState,
  pageUrl: string,
  result: PageExtractionResult,
): Promise<CrawlState> {
  if (!state.course) return state;

  // Update course title from first page if still placeholder
  if (state.course.title === 'Scanning…' && result.courseTitle) {
    state.course.title = result.courseTitle;
  }

  // Find or create module
  const moduleTitle = result.moduleTitle || result.courseTitle || 'Default Module';
  let mod = state.course.modules.find((m) => m.title === moduleTitle);
  if (!mod) {
    mod = {
      id: generateId(),
      index: state.course.modules.length,
      title: moduleTitle,
      lessons: [],
    };
    state.course.modules.push(mod);
  }

  // Find or create lesson for this page
  const lessonTitle = result.pageTitle || pageUrl;
  let lesson = mod.lessons.find((l) => normalizeUrl(l.url) === normalizeUrl(pageUrl));
  if (!lesson) {
    lesson = {
      id: generateId(),
      index: mod.lessons.length,
      title: lessonTitle,
      url: pageUrl,
      resources: [],
      visited: true,
      visitedAt: nowISO(),
    };
    mod.lessons.push(lesson);
  } else {
    lesson.visited = true;
    lesson.visitedAt = nowISO();
    if (lessonTitle && lesson.title === pageUrl) lesson.title = lessonTitle;
  }

  // Process resources found on this page
  const origin = getOrigin(state.course.url);
  for (const rawRes of result.resources) {
    if (state.options.sameOriginOnly && getOrigin(rawRes.url) !== origin) {
      // skip cross-origin only if not m3u8/vtt (those might be on CDN)
      if (rawRes.type !== 'm3u8' && rawRes.type !== 'vtt' && rawRes.type !== 'mp4') {
        continue;
      }
    }

    const alreadyHave = lesson.resources.some((r) => normalizeUrl(r.url) === normalizeUrl(rawRes.url));
    if (alreadyHave) continue;

    const resourceStatus = classifyResource(rawRes);
    const resource: Resource = {
      id: generateId(),
      url: rawRes.url,
      filename: filenameFromUrl(rawRes.url),
      title: rawRes.title,
      type: rawRes.type,
      status: resourceStatus,
      discoveredAt: nowISO(),
    };

    // For m3u8: fetch content to extract VTT references
    if (rawRes.type === 'm3u8') {
      try {
        const vttUrls = await fetchM3u8ForVtt(rawRes.url);
        if (vttUrls.length > 0) {
          resource.subtitleUrls = vttUrls;
          state = appendLog(state, 'info', `  Found ${vttUrls.length} subtitle(s) in playlist: ${rawRes.url}`);
          // Queue VTT files as sibling resources
          for (const vttUrl of vttUrls) {
            const alreadyVtt = lesson.resources.some((r) => normalizeUrl(r.url) === normalizeUrl(vttUrl));
            if (!alreadyVtt) {
              lesson.resources.push({
                id: generateId(),
                url: vttUrl,
                filename: filenameFromUrl(vttUrl),
                title: 'Subtitle',
                type: 'vtt',
                status: 'downloadable_allowed',
                discoveredAt: nowISO(),
                parentM3u8Url: rawRes.url,
              });
              state.progress.resourcesFound++;
            }
          }
        }
      } catch (e) {
        state = appendLog(state, 'warn', `  Could not parse m3u8 for VTT: ${String(e)}`);
      }
    }

    lesson.resources.push(resource);
    state.progress.resourcesFound++;
    state = appendLog(
      state,
      'success',
      `  Found resource [${rawRes.type.toUpperCase()}]: ${filenameFromUrl(rawRes.url)}`,
    );
  }

  // Queue new lesson links
  const currentOrigin = getOrigin(state.course?.url ?? '');
  for (const link of result.lessonLinks) {
    const norm = normalizeUrl(link.url);
    if (
      !state.visited.includes(norm) &&
      !state.queue.includes(link.url) &&
      (!state.options.sameOriginOnly || getOrigin(link.url) === currentOrigin)
    ) {
      state.queue.push(link.url);
      state.progress.totalPages++;

      // Pre-create lesson placeholder
      let linkMod = state.course?.modules.find((m) => m.title === moduleTitle);
      if (!linkMod) linkMod = mod;
      const exists = linkMod.lessons.some((l) => normalizeUrl(l.url) === norm);
      if (!exists) {
        linkMod.lessons.push({
          id: generateId(),
          index: linkMod.lessons.length,
          title: link.title || link.url,
          url: link.url,
          resources: [],
          visited: false,
        });
      }
    }
  }

  return state;
}

/** Fetch m3u8 in page context to extract VTT references */
async function fetchM3u8ForVtt(m3u8Url: string): Promise<string[]> {
  try {
    // Use service worker fetch (works for same-origin and CORS-enabled CDNs)
    const response = await fetch(m3u8Url, { credentials: 'include' });
    if (!response.ok) return [];
    const text = await response.text();
    return extractVttFromM3u8(text, m3u8Url);
  } catch {
    return [];
  }
}

export type { RawResource };
