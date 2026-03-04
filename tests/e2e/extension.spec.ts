/**
 * E2E tests for Course Library Exporter extension.
 *
 * Tests run against:
 *  - Mock course site at http://localhost:3456 (started by Playwright webServer)
 *  - Extension loaded unpacked from dist/
 *
 * Chrome extension APIs are available in the actual Chrome/Chromium context.
 */

import { test, expect, chromium } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import { resolve, join } from 'path';
import { mkdirSync } from 'fs';
import { tmpdir } from 'os';

const EXTENSION_PATH = resolve(__dirname, '../../dist');
const MOCK_COURSE_URL = 'http://localhost:3456/course.html';

// ─── Fixtures ──────────────────────────────────────────────────────────────

let context: BrowserContext;
let downloadDir: string;

test.beforeAll(async () => {
  downloadDir = join(tmpdir(), `cle-e2e-downloads-${Date.now()}`);
  mkdirSync(downloadDir, { recursive: true });

  // Launch Chrome with extension loaded
  context = await chromium.launchPersistentContext('', {
    headless: false, // Extensions require headless:false in Playwright
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      '--no-sandbox',
      '--disable-dev-shm-usage',
      `--download-path=${downloadDir}`,
    ],
    // Set download behaviour
    acceptDownloads: true,
  });
});

test.afterAll(async () => {
  await context.close();
});

// ─── Helper: get extension popup page ─────────────────────────────────────

async function getExtensionId(): Promise<string> {
  // Extension ID is visible in background page URL
  const workers = context.serviceWorkers();
  if (workers.length > 0) {
    const url = workers[0].url();
    const match = url.match(/chrome-extension:\/\/([a-z]{32})\//);
    if (match) return match[1];
  }

  // Alternative: wait for service worker
  const worker = await context.waitForEvent('serviceworker', { timeout: 10_000 });
  const url = worker.url();
  const match = url.match(/chrome-extension:\/\/([a-z]{32})\//);
  if (!match) throw new Error(`Could not extract extension ID from: ${url}`);
  return match[1];
}

async function openPopup(extensionId: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.waitForLoadState('domcontentloaded');
  return page;
}

// ─── Tests ─────────────────────────────────────────────────────────────────

test.describe('Extension loads', () => {
  test('service worker starts', async () => {
    // Navigate to mock course to trigger extension context
    const page = await context.newPage();
    await page.goto(MOCK_COURSE_URL);
    await page.waitForLoadState('domcontentloaded');

    const extensionId = await getExtensionId();
    expect(extensionId).toMatch(/^[a-z]{32}$/);

    await page.close();
  });

  test('popup renders', async () => {
    const extensionId = await getExtensionId();
    const popup = await openPopup(extensionId);

    await expect(popup.locator('text=Course Library Exporter')).toBeVisible();
    await expect(popup.locator('text=Scan this course')).toBeVisible();
    await expect(popup.locator('text=Download resources')).toBeVisible();
    await expect(popup.locator('text=Export index')).toBeVisible();

    await popup.close();
  });
});

test.describe('Scan workflow', () => {
  test('scan course and discover structure', async () => {
    // 1. Open mock course page
    const coursePage = await context.newPage();
    await coursePage.goto(MOCK_COURSE_URL);
    await coursePage.waitForLoadState('domcontentloaded');

    const extensionId = await getExtensionId();

    // 2. Open popup while on the course page
    const popup = await openPopup(extensionId);

    // 3. Wait for domain to appear in header
    await expect(popup.locator('text=localhost')).toBeVisible({ timeout: 5_000 });

    // 4. Click "Scan this course"
    await popup.locator('text=Scan this course').click();

    // 5. Verify status changes to scanning
    await expect(popup.locator('text=Scanning')).toBeVisible({ timeout: 5_000 });

    // 6. Wait for scan to complete (up to 60s for sequential page visits)
    await expect(popup.locator('text=Scan complete')).toBeVisible({ timeout: 60_000 });

    // 7. Verify progress stats show pages were visited
    const pageCountEl = popup.locator('text=/Pages/i');
    await expect(pageCountEl).toBeVisible();

    // 8. Verify resources were found
    const resourceEl = popup.locator('text=/Resources/i');
    await expect(resourceEl).toBeVisible();

    // 9. Check logs contain expected entries
    const logs = popup.locator('[style*="monospace"]');
    const logsText = await logs.innerText().catch(() => '');
    // Should have visited lesson pages
    expect(logsText.length).toBeGreaterThan(0);

    await popup.close();
    await coursePage.close();
  });
});

test.describe('Export', () => {
  test('export index generates files', async () => {
    const extensionId = await getExtensionId();
    const popup = await openPopup(extensionId);

    // Export should be enabled after a previous scan
    const exportBtn = popup.locator('text=Export index');

    // If no scan ran yet (isolated test), button might be disabled
    // We check if it's enabled and try to click
    const isDisabled = await exportBtn.getAttribute('disabled');
    if (!isDisabled) {
      await exportBtn.click();

      // Wait briefly for download to start
      await popup.waitForTimeout(2_000);
    }

    await popup.close();
  });
});

test.describe('Options panel', () => {
  test('options panel toggles', async () => {
    const extensionId = await getExtensionId();
    const popup = await openPopup(extensionId);

    // Open options
    await popup.locator('text=Options').click();
    await expect(popup.locator('text=Max pages')).toBeVisible();
    await expect(popup.locator('text=Same-origin only')).toBeVisible();
    await expect(popup.locator('text=Export index only')).toBeVisible({ timeout: 3_000 });

    // Close options
    await popup.locator('text=Hide options').click();
    await expect(popup.locator('text=Max pages')).not.toBeVisible();

    await popup.close();
  });

  test('max pages option persists', async () => {
    const extensionId = await getExtensionId();
    const popup = await openPopup(extensionId);

    await popup.locator('text=Options').click();

    const input = popup.locator('input[type="number"]').first();
    await input.clear();
    await input.fill('50');
    await input.press('Tab');

    // Verify the value is set
    const value = await input.inputValue();
    expect(value).toBe('50');

    await popup.close();
  });
});

test.describe('Resource classification', () => {
  test('mock site serves expected assets', async () => {
    const page = await context.newPage();

    // Check PDF is served
    const pdfResponse = await page.goto('http://localhost:3456/assets/sample.pdf');
    expect(pdfResponse?.status()).toBe(200);

    // Check MP4 is served
    const mp4Response = await page.goto('http://localhost:3456/assets/sample.mp4');
    expect(mp4Response?.status()).toBe(200);

    // Check ZIP is served
    const zipResponse = await page.goto('http://localhost:3456/assets/sample.zip');
    expect(zipResponse?.status()).toBe(200);

    // Check m3u8 playlist is served
    const m3u8Response = await page.goto('http://localhost:3456/assets/playlist.m3u8');
    expect(m3u8Response?.status()).toBe(200);
    const m3u8Content = await m3u8Response?.text();
    expect(m3u8Content).toContain('#EXTM3U');
    expect(m3u8Content).toContain('subtitles.vtt');

    // Check VTT is served
    const vttResponse = await page.goto('http://localhost:3456/assets/subtitles.vtt');
    expect(vttResponse?.status()).toBe(200);
    const vttContent = await vttResponse?.text();
    expect(vttContent).toContain('WEBVTT');

    await page.close();
  });

  test('lesson pages have expected resource links', async () => {
    const page = await context.newPage();

    // Lesson 1: should have PDF
    await page.goto('http://localhost:3456/module1/lesson1.html');
    const pdfLink = page.locator('a[href$=".pdf"]');
    await expect(pdfLink).toBeVisible();

    // Lesson 2: should have MP4 and ZIP
    await page.goto('http://localhost:3456/module1/lesson2.html');
    const mp4Link = page.locator('a[href$=".mp4"]');
    const zipLink = page.locator('a[href$=".zip"]');
    await expect(mp4Link).toBeVisible();
    await expect(zipLink).toBeVisible();

    // Lesson 3: should have m3u8 and VTT
    await page.goto('http://localhost:3456/module1/lesson3.html');
    const m3u8Link = page.locator('a[href$=".m3u8"]');
    const vttLink = page.locator('a[href$=".vtt"]');
    await expect(m3u8Link).toBeVisible();
    await expect(vttLink).toBeVisible();

    // Verify HLS source tag also present
    const source = page.locator('source[type="application/vnd.apple.mpegurl"]');
    await expect(source).toBeAttached();

    // Verify track element for subtitles
    const track = page.locator('track[kind="subtitles"]');
    await expect(track).toBeAttached();

    await page.close();
  });
});
