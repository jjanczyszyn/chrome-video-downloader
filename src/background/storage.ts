import type { CrawlState, CrawlOptions } from '../shared/types';
import { DEFAULT_OPTIONS } from '../shared/types';
import { nowISO } from '../shared/utils';

const STATE_KEY = 'crawlState';

export function initialState(): CrawlState {
  return {
    status: 'idle',
    course: undefined,
    options: { ...DEFAULT_OPTIONS },
    queue: [],
    visited: [],
    logs: [],
    progress: {
      pagesVisited: 0,
      totalPages: 0,
      resourcesFound: 0,
      resourcesDownloaded: 0,
      resourcesFailed: 0,
    },
    error: undefined,
    startedAt: undefined,
    completedAt: undefined,
  };
}

export async function loadState(): Promise<CrawlState> {
  const result = await chrome.storage.local.get(STATE_KEY);
  return (result[STATE_KEY] as CrawlState) ?? initialState();
}

export async function saveState(state: CrawlState): Promise<void> {
  await chrome.storage.local.set({ [STATE_KEY]: state });
}

export async function clearState(): Promise<void> {
  await chrome.storage.local.remove(STATE_KEY);
}

/** Append a log entry (capped at 500 to avoid storage bloat) */
export function appendLog(
  state: CrawlState,
  level: 'info' | 'warn' | 'error' | 'success',
  message: string,
): CrawlState {
  const entry = { timestamp: nowISO(), level, message };
  const logs = [...state.logs, entry];
  if (logs.length > 500) logs.splice(0, logs.length - 500);
  return { ...state, logs };
}

export async function updateOptions(opts: Partial<CrawlOptions>): Promise<CrawlState> {
  const state = await loadState();
  const next: CrawlState = { ...state, options: { ...state.options, ...opts } };
  await saveState(next);
  return next;
}
