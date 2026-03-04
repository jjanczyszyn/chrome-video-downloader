# Course Library Exporter

A Chrome Extension (Manifest V3) that helps you export the structure and downloadable resources from an online course you are **already logged into**.

## What It Does

- Crawls course pages you have access to and builds a structured index: **modules → lessons → resources**
- Detects files **explicitly provided by the site** (direct `<a href>` links, `<video src>`, `<source src>`, `<track src>` elements, m3u8 playlist references in script tags)
- Downloads found resources using `chrome.downloads` into organized folders mirroring the course hierarchy
- For HLS (m3u8) playlists: downloads the playlist file and any referenced VTT subtitle files
- Exports a JSON and Markdown index of the full course structure

## What It Does NOT Do

| ❌ Never | Explanation |
|----------|-------------|
| Automate login / capture passwords | You must be already logged in |
| Bypass paywalls | Only accesses content your session can reach |
| Defeat DRM | Does not reconstruct encrypted HLS streams |
| Scrape cross-origin content (by default) | Same-origin only option is on by default |
| Download content that requires hidden APIs | Only uses DOM-visible links and attributes |

---

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm (or npm)
- Chrome / Chromium (for loading the extension)

### Quick Setup

```bash
git clone <repo-url>
cd course-library-exporter
bash scripts/setup.sh
```

The setup script:
1. Checks Node.js version
2. Installs pnpm if missing
3. Installs dependencies
4. Runs unit tests
5. Builds the extension
6. Installs Playwright Chromium for E2E tests

### Manual Setup

```bash
pnpm install
pnpm build
```

---

## Loading the Extension in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right toggle)
3. Click **Load unpacked**
4. Select the `dist/` folder in this repo
5. Pin the extension icon for easy access

---

## Running the Mock Course Site

The repo includes a realistic mock course site for development and testing:

```bash
pnpm mock:server
```

Then open `http://localhost:3456` in Chrome.

**Mock site structure:**
```
Advanced TypeScript Mastery (course)
├── Module 1: Foundations
│   ├── Lesson 1.1 – TypeScript Basics & Setup      → PDF download
│   ├── Lesson 1.2 – Types and Interfaces           → MP4 + ZIP downloads
│   └── Lesson 1.3 – Video Deep Dive (HLS)         → m3u8 playlist + VTT subtitle
└── Module 2: Advanced Patterns
    └── Lesson 2.1 – Generics and Utility Types    → PDF + ZIP downloads
```

---

## Usage

1. **Log in** to your course platform in Chrome
2. Navigate to a course page
3. Click the **Course Library Exporter** extension icon
4. Click **"Scan this course"** – the extension crawls all accessible lesson pages
5. Once scan is complete:
   - Click **"Download resources"** to download files into organized folders
   - Click **"Export index"** to download `course-title.json` and `course-title.md`

### Download Folder Structure

Files are saved to your Chrome downloads folder under:

```
Course Library Exporter/
└── Advanced TypeScript Mastery/
    ├── 01 - Module 1 Foundations/
    │   ├── 01 - TypeScript Basics Setup/
    │   │   └── lesson-notes.pdf
    │   ├── 02 - Types and Interfaces/
    │   │   ├── lesson-video.mp4
    │   │   └── exercises.zip
    │   └── 03 - Video Deep Dive HLS/
    │       ├── playlist.m3u8
    │       └── subtitles.vtt
    └── 02 - Module 2 Advanced Patterns/
        └── 01 - Generics and Utility Types/
            ├── cheatsheet.pdf
            └── exercises.zip
```

### Options

| Option | Default | Description |
|--------|---------|-------------|
| Max pages | 200 | Stop crawling after this many pages |
| Delay (ms) | 300 | Pause between page fetches |
| Same-origin only | ON | Only follow links on the same domain |
| Sanitize filenames | ON | Remove illegal filesystem characters |
| Export index only | OFF | Skip downloads, only generate JSON/MD |

---

## Development

```bash
# Watch mode (rebuilds on file changes)
pnpm dev

# Build
pnpm build

# Type check
pnpm type-check
```

### Project Structure

```
├── src/
│   ├── background/        # Service worker (crawler, downloader, exporter)
│   │   ├── index.ts       # Message router and lifecycle
│   │   ├── crawler.ts     # Page-by-page crawl orchestrator
│   │   ├── downloader.ts  # chrome.downloads integration
│   │   ├── exporter.ts    # JSON + Markdown export
│   │   └── storage.ts     # chrome.storage.local helpers
│   ├── content/
│   │   └── index.ts       # Lightweight content script
│   ├── popup/             # React UI
│   │   ├── App.tsx
│   │   └── components/
│   └── shared/            # Types, utils, message contracts
├── mock-site/             # Express server + course HTML pages
├── tests/
│   ├── unit/              # Vitest unit tests
│   └── e2e/               # Playwright E2E tests
├── scripts/
│   ├── build.ts           # Orchestrates Vite + esbuild builds
│   └── setup.sh           # One-shot developer setup
└── dist/                  # Built extension (load this in Chrome)
```

---

## Testing

### Unit Tests

Tests cover: URL normalization, filename sanitization, resource classification, folder ordering, m3u8 VTT extraction.

```bash
pnpm test
```

### E2E Tests (Playwright)

Requires the extension to be built first (`pnpm build`) and mock server running.

```bash
pnpm test:e2e
```

The E2E tests:
- Load the extension unpacked into a real Chromium instance
- Navigate to the mock course site
- Scan the course via the popup UI
- Assert the extension discovers expected structure and resources
- Verify m3u8 playlists contain VTT subtitle references
- Verify all asset types are served correctly

---

## Troubleshooting

**Extension not loading:**
- Ensure `dist/manifest.json` exists (`pnpm build` if not)
- Reload the extension on `chrome://extensions`

**Scan finds no resources:**
- The course site may render content dynamically after scroll/interaction – the extension reads DOM at page load time
- Try increasing the delay option (500–1000ms) for slow-loading pages

**Download fails:**
- Check Chrome's download settings (`chrome://settings/downloads`)
- Ensure "Ask where to save each file before downloading" is OFF for automatic organization

**E2E tests fail:**
- Run `pnpm mock:server` separately and verify `http://localhost:3456` loads
- Ensure `pnpm exec playwright install chromium` has been run
- On CI, headless Chrome must be available (the CI workflow handles this)

**Service worker restarts:**
- Chrome MV3 service workers are ephemeral. If the popup shows "Paused" unexpectedly, click "Resume scan".

---

## Architecture Notes

### Crawling

The background service worker opens a dedicated (non-active) tab, navigates it to each URL in the queue, and uses `chrome.scripting.executeScript` to inject a **self-contained** extraction function. Results are returned synchronously via the `executeScript` return value.

The extraction function is intentionally self-contained (no imports) because `executeScript` runs in the page context where the extension's module graph is not available.

### m3u8 + VTT Handling

When an m3u8 playlist URL is discovered:
1. The service worker fetches the playlist text (using `credentials: 'include'` for same-origin, or CORS for CDN URLs)
2. Parses `#EXT-X-MEDIA:TYPE=SUBTITLES` tags and bare `.vtt` lines
3. Queues all discovered VTT URLs for download alongside the playlist

### Security

- The extension declares `"host_permissions": ["<all_urls>"]` because course platforms vary widely in domain
- Content script runs on all pages but only sends a heartbeat – heavy DOM access is done on-demand via `executeScript`
- No network requests are made outside of page navigation and `chrome.downloads`

---

## License

MIT. See LICENSE.
