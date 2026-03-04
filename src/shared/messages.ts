import type { CrawlOptions, CrawlState, LogEntry, PageExtractionResult } from './types';

// ─── Message type literals ─────────────────────────────────────────────────

export const MSG = {
  // Popup → Background
  GET_STATE: 'GET_STATE',
  START_SCAN: 'START_SCAN',
  PAUSE_SCAN: 'PAUSE_SCAN',
  RESUME_SCAN: 'RESUME_SCAN',
  START_DOWNLOAD: 'START_DOWNLOAD',
  EXPORT_INDEX: 'EXPORT_INDEX',
  UPDATE_OPTIONS: 'UPDATE_OPTIONS',
  CLEAR_DATA: 'CLEAR_DATA',

  // Background → Popup (via chrome.runtime.sendMessage to all contexts)
  STATE_UPDATE: 'STATE_UPDATE',
  LOG: 'LOG',

  // Content script → Background
  EXTRACTION_RESULT: 'EXTRACTION_RESULT',
  CONTENT_READY: 'CONTENT_READY',
} as const;

export type MsgType = (typeof MSG)[keyof typeof MSG];

// ─── Typed message payloads ────────────────────────────────────────────────

export interface StartScanPayload {
  startUrl: string;
  options: CrawlOptions;
}

export interface ExtractionResultPayload {
  tabId: number;
  url: string;
  result: PageExtractionResult;
}

export interface StateUpdatePayload {
  state: CrawlState;
}

export interface LogPayload {
  entry: LogEntry;
}

export interface UpdateOptionsPayload {
  options: Partial<CrawlOptions>;
}

// ─── Generic message envelope ──────────────────────────────────────────────

export interface ChromeMessage<T = unknown> {
  type: MsgType;
  payload?: T;
}

// Helper to send a typed message to the background service worker
export function sendToBackground<T>(msg: ChromeMessage<T>): Promise<unknown> {
  return chrome.runtime.sendMessage(msg);
}
