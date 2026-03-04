/**
 * Background Service Worker – entry point.
 * Orchestrates crawling, downloading, and exporting.
 */

import type { CrawlState } from '../shared/types';
import { MSG } from '../shared/messages';
import type { StartScanPayload, UpdateOptionsPayload, ChromeMessage } from '../shared/messages';
import { loadState, saveState, clearState, appendLog, updateOptions } from './storage';
import { startCrawl, pauseCrawl, resumeCrawl } from './crawler';
import { startDownloads } from './downloader';
import { exportCourse } from './exporter';

// ─── Message listener ──────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener(
  (message: ChromeMessage, _sender, sendResponse) => {
    handleMessage(message).then(sendResponse).catch((err) => {
      sendResponse({ error: String(err) });
    });
    return true; // async response
  },
);

async function handleMessage(message: ChromeMessage): Promise<unknown> {
  switch (message.type) {
    case MSG.GET_STATE: {
      return loadState();
    }

    case MSG.START_SCAN: {
      const { startUrl, options } = message.payload as StartScanPayload;
      // Apply options before starting
      await updateOptions(options);
      // Non-blocking: crawl runs in background
      startCrawl(startUrl).catch(console.error);
      return { ok: true };
    }

    case MSG.PAUSE_SCAN: {
      await pauseCrawl();
      return { ok: true };
    }

    case MSG.RESUME_SCAN: {
      await resumeCrawl();
      return { ok: true };
    }

    case MSG.START_DOWNLOAD: {
      startDownloads().catch(console.error);
      return { ok: true };
    }

    case MSG.EXPORT_INDEX: {
      const state = await loadState();
      if (state.course) {
        exportCourse(state.course);
        return { ok: true };
      }
      return { error: 'No course data available. Run scan first.' };
    }

    case MSG.UPDATE_OPTIONS: {
      const { options } = message.payload as UpdateOptionsPayload;
      const state = await updateOptions(options);
      await broadcastState(state);
      return { ok: true };
    }

    case MSG.CLEAR_DATA: {
      await clearState();
      const fresh = await loadState();
      await broadcastState(fresh);
      return { ok: true };
    }

    default:
      return { error: `Unknown message type: ${(message as { type: string }).type}` };
  }
}

// ─── State broadcasting ────────────────────────────────────────────────────

/**
 * Broadcast state to all open extension views (popup, devtools, etc.).
 * Exported so crawler/downloader can call it after mutations.
 */
export async function broadcastState(state: CrawlState): Promise<void> {
  try {
    await chrome.runtime.sendMessage({ type: MSG.STATE_UPDATE, payload: { state } });
  } catch {
    // No receivers open – that's fine.
  }
}

// ─── Lifecycle ─────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  console.log('[CourseLibraryExporter] Extension installed/updated.');
});

// Recover from service worker restarts: if we were mid-scan, mark as paused
chrome.runtime.onStartup.addListener(async () => {
  const state = await loadState();
  if (state.status === 'scanning' || state.status === 'downloading') {
    const next = appendLog({ ...state, status: 'paused' }, 'warn',
      'Service worker restarted – scan paused. Click Resume to continue.');
    await saveState(next);
  }
});
