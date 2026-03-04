/**
 * Crawler orchestrates sequential page visits:
 * 1. Pop URL from queue
 * 2. Navigate a dedicated tab to that URL
 * 3. Wait for DOM + JS render
 * 4. Inject self-contained extraction function via chrome.scripting.executeScript
 * 5. Process results → queue ALL same-origin links, collect m3u8/vtt/etc.
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
    } catch { /* tab was closed */ }
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

function waitForTabComplete(tabId: number, timeoutMs = 20_000): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve(); // don't throw on timeout – try extraction anyway
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

async function extractFromPage(
  url: string,
  options: { sameOriginOnly: boolean; origin: string; jsRenderWaitMs: number },
): Promise<PageExtractionResult> {
  const tabId = await getCrawlTab();

  await chrome.tabs.update(tabId, { url });
  await waitForTabComplete(tabId);

  // Wait for JS-rendered content (SPAs need extra time)
  await new Promise((r) => setTimeout(r, options.jsRenderWaitMs));

  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: pageExtractorFunction,
    args: [options],
  });

  if (!results || results.length === 0 || results[0].result === undefined) {
    throw new Error('executeScript returned no result');
  }
  return results[0].result as PageExtractionResult;
}

// ─── Self-contained page extractor ────────────────────────────────────────
//
// CRITICAL: this function is serialized and injected into the page via
// chrome.scripting.executeScript — it MUST be completely self-contained
// (no imports, no closures over outer variables).

function pageExtractorFunction(opts: {
  sameOriginOnly: boolean;
  origin: string;
  jsRenderWaitMs: number;
}): PageExtractionResult {
  const { sameOriginOnly, origin } = opts;

  // ── Helpers ──────────────────────────────────────────────────────────────

  type ResourceType = 'pdf'|'mp4'|'zip'|'m3u8'|'vtt'|'docx'|'pptx'|'xlsx'|'rar'|'other';

  const DOWNLOADABLE_EXTS = new Set([
    'pdf','mp4','m4v','mov','webm','zip','gz','tar','rar','7z',
    'm3u8','vtt','srt','docx','doc','pptx','ppt','xlsx','xls',
  ]);

  function abs(href: string): string | null {
    try { return new URL(href, location.href).href; } catch { return null; }
  }

  function ext(url: string): string {
    try {
      return new URL(url).pathname.toLowerCase().split('.').pop()?.split('?')[0] ?? '';
    } catch { return ''; }
  }

  function toType(e: string): ResourceType {
    if (e === 'pdf') return 'pdf';
    if (['mp4','m4v','mov','webm'].includes(e)) return 'mp4';
    if (['zip','gz','tar'].includes(e)) return 'zip';
    if (['rar','7z'].includes(e)) return 'rar';
    if (e === 'm3u8') return 'm3u8';
    if (['vtt','srt'].includes(e)) return 'vtt';
    if (['docx','doc'].includes(e)) return 'docx';
    if (['pptx','ppt'].includes(e)) return 'pptx';
    if (['xlsx','xls'].includes(e)) return 'xlsx';
    return 'other';
  }

  function sameOrigin(url: string): boolean {
    try { return new URL(url).origin === origin; } catch { return false; }
  }

  // ── Titles ───────────────────────────────────────────────────────────────

  const courseTitle =
    (document.querySelector('[data-course-title],[data-course-name]') as HTMLElement|null)?.innerText?.trim() ||
    (document.querySelector('.course-title,.course-name') as HTMLElement|null)?.innerText?.trim() ||
    (document.querySelector('h1') as HTMLElement|null)?.innerText?.trim() ||
    document.title;

  const pageTitle =
    (document.querySelector('[data-lesson-title],[data-post-title],[data-page-title]') as HTMLElement|null)?.innerText?.trim() ||
    (document.querySelector('.lesson-title,.post-title,.page-title') as HTMLElement|null)?.innerText?.trim() ||
    (document.querySelector('h1') as HTMLElement|null)?.innerText?.trim() ||
    document.title;

  const moduleTitle =
    (document.querySelector('[data-module-title],[data-section-title]') as HTMLElement|null)?.innerText?.trim() ||
    (document.querySelector('.module-title,.section-title') as HTMLElement|null)?.innerText?.trim() ||
    (document.querySelector('.breadcrumb li:nth-last-child(2),.bc-item:nth-last-child(2)') as HTMLElement|null)?.innerText?.trim() ||
    undefined;

  // ── Collect ALL same-origin page links for traversal ────────────────────
  //
  // KEY FIX: previous version only looked at specific nav selectors (.sidebar,
  // .course-nav, etc.) which matched nothing on real course sites. Now we grab
  // every <a href> on the page and filter to same-origin, non-file URLs.

  const lessonLinks: Array<{ title: string; url: string }> = [];
  const seenPageUrls = new Set<string>();
  const currentPageBase = location.href.split('#')[0].split('?')[0];

  document.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((el) => {
    const raw = el.getAttribute('href') ?? '';
    if (!raw || raw.startsWith('javascript:') || raw.startsWith('mailto:') || raw.startsWith('tel:')) return;

    const resolved = abs(raw);
    if (!resolved) return;

    // Strip hash – we care about the page, not the anchor
    const pageUrl = resolved.split('#')[0];

    // Skip current page
    if (pageUrl === currentPageBase) return;

    // Skip downloadable files (these go into resources, not the crawl queue)
    if (DOWNLOADABLE_EXTS.has(ext(pageUrl))) return;

    // Apply same-origin filter
    if (sameOriginOnly && !sameOrigin(pageUrl)) return;

    const norm = pageUrl.toLowerCase();
    if (seenPageUrls.has(norm)) return;
    seenPageUrls.add(norm);

    const title = el.innerText?.trim() ||
                  el.getAttribute('title') ||
                  el.getAttribute('aria-label') || '';

    lessonLinks.push({ title, url: pageUrl });
  });

  // ── Collect resources ────────────────────────────────────────────────────

  const resources: Array<{ url: string; title: string; type: ResourceType }> = [];
  const seenRes = new Set<string>();

  function addRes(url: string, title: string, type: ResourceType) {
    const k = url.toLowerCase();
    if (seenRes.has(k)) return;
    seenRes.add(k);
    resources.push({ url, title, type });
  }

  // 1. <a href> pointing to a file
  document.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((el) => {
    const href = abs(el.getAttribute('href') ?? '');
    if (!href) return;
    const e = ext(href);
    if (!DOWNLOADABLE_EXTS.has(e)) return;
    addRes(href, el.innerText?.trim() || el.getAttribute('download') || '', toType(e));
  });

  // 2. <video src> / <source src>
  document.querySelectorAll<HTMLElement>('video[src], source[src]').forEach((el) => {
    const src = abs(el.getAttribute('src') ?? '');
    if (!src) return;
    const e = ext(src);
    addRes(src, 'Video', toType(e) === 'other' ? 'mp4' : toType(e));
  });

  // 3. <track src> subtitle tracks
  document.querySelectorAll<HTMLTrackElement>('track[src]').forEach((el) => {
    const src = abs(el.getAttribute('src') ?? '');
    if (!src) return;
    addRes(src, el.getAttribute('label') || el.getAttribute('srclang') || 'Subtitle', 'vtt');
  });

  // 4. Scan ALL script tag text for m3u8 / vtt URLs
  //    Covers Video.js, JWPlayer, Wistia, Vimeo, custom players
  //    Pattern stops at quote/backtick/space/newline after the URL
  const urlPattern = /https?:\/\/[^\s"'`<>{}|\\^[\]]+\.(m3u8|vtt)(?:[?#][^\s"'`<>{}|\\^[\]]*)?/gi;
  document.querySelectorAll('script, [type="application/json"]').forEach((el) => {
    const text = el.textContent ?? '';
    let m: RegExpExecArray | null;
    urlPattern.lastIndex = 0;
    while ((m = urlPattern.exec(text)) !== null) {
      const url = m[0].replace(/[,;)\]}]+$/, ''); // strip trailing punctuation
      const e = m[1].toLowerCase() as 'm3u8' | 'vtt';
      addRes(url, e === 'm3u8' ? 'HLS Stream' : 'Subtitle', e);
    }
  });

  // 5. data-* attributes (Vimeo, Bunny, custom players)
  const dataAttrs = ['data-src','data-file','data-video','data-video-url',
                     'data-playlist','data-stream','data-hls','data-url'];
  document.querySelectorAll(dataAttrs.map(a => `[${a}]`).join(',')).forEach((el) => {
    dataAttrs.forEach((attr) => {
      const val = el.getAttribute(attr);
      if (!val) return;
      const href = abs(val);
      if (!href) return;
      const e = ext(href);
      if (DOWNLOADABLE_EXTS.has(e)) addRes(href, '', toType(e));
    });
  });

  // 6. Scan page HTML as raw text for any remaining m3u8/vtt URLs
  //    (catches URLs in inline event handlers, CSS background, etc.)
  const bodyText = document.documentElement.innerHTML;
  urlPattern.lastIndex = 0;
  let bm: RegExpExecArray | null;
  while ((bm = urlPattern.exec(bodyText)) !== null) {
    const url = bm[0].replace(/[,;)\]}]+$/, '');
    const e = bm[1].toLowerCase() as 'm3u8' | 'vtt';
    addRes(url, e === 'm3u8' ? 'HLS Stream' : 'Subtitle', e);
  }

  return { courseTitle, pageTitle, moduleTitle, lessonLinks, resources };
}

// ─── Crawl orchestration ───────────────────────────────────────────────────

let crawling = false;

export function isCrawling(): boolean { return crawling; }

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
  try { await runCrawlLoop(); }
  finally { crawling = false; closeCrawlTab(); }
}

async function runCrawlLoop(): Promise<void> {
  while (true) {
    let state = await loadState();
    if (!crawling || state.status === 'paused') break;

    if (state.queue.length === 0) {
      state.status = 'scan_complete';
      state.completedAt = nowISO();
      if (state.course) state.course.completedAt = state.completedAt;
      state = appendLog(state, 'success',
        `Scan complete. ${state.progress.pagesVisited} pages visited, ` +
        `${state.progress.resourcesFound} resources found.`);
      await saveState(state);
      await broadcastState(state);
      break;
    }

    if (state.progress.pagesVisited >= state.options.maxPages) {
      state = appendLog(state, 'warn', `Max pages reached (${state.options.maxPages}). Stopping.`);
      state.status = 'scan_complete';
      state.completedAt = nowISO();
      await saveState(state);
      await broadcastState(state);
      break;
    }

    const url = state.queue.shift()!;
    const normalizedUrl = normalizeUrl(url);

    if (state.visited.includes(normalizedUrl)) {
      await saveState(state);
      continue;
    }

    state.visited.push(normalizedUrl);
    state.progress.pagesVisited++;
    state = appendLog(state, 'info',
      `[${state.progress.pagesVisited}/${state.progress.totalPages}] ${url}`);
    await saveState(state);
    await broadcastState(state);

    try {
      const jsWait = state.options.delayMs < 500 ? 1200 : state.options.delayMs;
      const result = await extractFromPage(url, {
        sameOriginOnly: state.options.sameOriginOnly,
        origin: getOrigin(state.course?.url ?? url),
        jsRenderWaitMs: jsWait,
      });

      state = await loadState();
      state = await applyExtractionResult(state, url, result);
      await saveState(state);
      await broadcastState(state);
    } catch (err) {
      state = await loadState();
      state = appendLog(state, 'error', `  Failed: ${String(err)}`);
      await saveState(state);
      await broadcastState(state);
    }

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

  if (state.course.title === 'Scanning…' && result.courseTitle) {
    state.course.title = result.courseTitle;
  }

  // Group by module title; fall back to a single flat module
  const moduleTitle = result.moduleTitle || result.courseTitle || 'Course';
  let mod = state.course.modules.find((m) => m.title === moduleTitle);
  if (!mod) {
    mod = { id: generateId(), index: state.course.modules.length, title: moduleTitle, lessons: [] };
    state.course.modules.push(mod);
  }

  const lessonTitle = result.pageTitle || pageUrl;
  let lesson = mod.lessons.find((l) => normalizeUrl(l.url) === normalizeUrl(pageUrl));
  if (!lesson) {
    lesson = {
      id: generateId(), index: mod.lessons.length, title: lessonTitle,
      url: pageUrl, resources: [], visited: true, visitedAt: nowISO(),
    };
    mod.lessons.push(lesson);
  } else {
    lesson.visited = true;
    lesson.visitedAt = nowISO();
    if (lessonTitle && lesson.title === pageUrl) lesson.title = lessonTitle;
  }

  // Process discovered resources
  const courseOrigin = getOrigin(state.course.url);
  for (const rawRes of result.resources) {
    // Always allow m3u8/vtt/mp4 even if cross-origin (CDN is normal)
    const isCdn = rawRes.type === 'm3u8' || rawRes.type === 'vtt' || rawRes.type === 'mp4';
    if (state.options.sameOriginOnly && !isCdn && getOrigin(rawRes.url) !== courseOrigin) continue;

    if (lesson.resources.some((r) => normalizeUrl(r.url) === normalizeUrl(rawRes.url))) continue;

    const resource: Resource = {
      id: generateId(),
      url: rawRes.url,
      filename: filenameFromUrl(rawRes.url),
      title: rawRes.title,
      type: rawRes.type,
      status: classifyResource(rawRes),
      discoveredAt: nowISO(),
    };

    // For every m3u8: fetch & parse to discover VTT subtitle files
    if (rawRes.type === 'm3u8') {
      const vttUrls = await fetchM3u8ForVtt(rawRes.url);
      if (vttUrls.length > 0) {
        resource.subtitleUrls = vttUrls;
        state = appendLog(state, 'info',
          `  ↳ playlist has ${vttUrls.length} subtitle track(s)`);
        for (const vttUrl of vttUrls) {
          if (lesson.resources.some((r) => normalizeUrl(r.url) === normalizeUrl(vttUrl))) continue;
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

    lesson.resources.push(resource);
    state.progress.resourcesFound++;
    state = appendLog(state, 'success',
      `  [${rawRes.type.toUpperCase()}] ${filenameFromUrl(rawRes.url)}`);
  }

  // Queue all same-origin page links discovered on this page
  const currentOrigin = getOrigin(state.course?.url ?? '');
  for (const link of result.lessonLinks) {
    const norm = normalizeUrl(link.url);
    if (state.visited.includes(norm)) continue;
    if (state.queue.some((q) => normalizeUrl(q) === norm)) continue;
    if (state.options.sameOriginOnly && getOrigin(link.url) !== currentOrigin) continue;

    state.queue.push(link.url);
    state.progress.totalPages++;

    // Pre-create placeholder so the UI shows pending pages
    const linkMod = state.course?.modules.find((m) => m.title === moduleTitle) ?? mod;
    if (!linkMod.lessons.some((l) => normalizeUrl(l.url) === norm)) {
      linkMod.lessons.push({
        id: generateId(), index: linkMod.lessons.length,
        title: link.title || link.url, url: link.url,
        resources: [], visited: false,
      });
    }
  }

  return state;
}

async function fetchM3u8ForVtt(m3u8Url: string): Promise<string[]> {
  try {
    const resp = await fetch(m3u8Url, { credentials: 'include' });
    if (!resp.ok) return [];
    const text = await resp.text();
    return extractVttFromM3u8(text, m3u8Url);
  } catch { return []; }
}

export type { RawResource };
