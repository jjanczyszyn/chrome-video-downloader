/**
 * Content script – injected on every page.
 * Primary role: communicate with the background SW.
 *
 * NOTE: The main extraction is done via chrome.scripting.executeScript
 * (self-contained function injected on demand), NOT here.
 * This script handles lightweight tasks:
 * - Reporting that the content script is alive on this page
 * - Listening for DOM-ready signals from the background
 */

import { MSG } from '../shared/messages';

// Let the background know we're loaded on this page
chrome.runtime.sendMessage({ type: MSG.CONTENT_READY, payload: { url: location.href } }).catch(() => {
  // Extension context may not be ready yet on very first load
});

// Expose a global for the injected extraction function to signal back
// (not used in this architecture, but available for future enhancements)
(window as unknown as Record<string, unknown>).__CLE_READY__ = true;
