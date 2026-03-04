/**
 * Mock course website server.
 * Serves a realistic course structure for E2E testing.
 *
 * Run: pnpm mock:server
 * URL: http://localhost:3456
 */

import express from 'express';
import { join } from 'path';
import { existsSync, mkdirSync, writeFileSync } from 'fs';

const PORT = 3456;
const PUBLIC = join(__dirname, 'public');

// Ensure asset files exist (generate minimal valid binaries on first run)
ensureAssets();

const app = express();

// Serve static files
app.use(express.static(PUBLIC, {
  setHeaders(res, filePath) {
    // Allow CORS so the extension's service worker can fetch m3u8 content
    res.setHeader('Access-Control-Allow-Origin', '*');

    // Serve m3u8 with correct MIME type
    if (filePath.endsWith('.m3u8')) {
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    }
    if (filePath.endsWith('.vtt')) {
      res.setHeader('Content-Type', 'text/vtt');
    }
  },
}));

// Redirect bare domain to course index
app.get('/', (_req, res) => {
  res.redirect('/course.html');
});

app.listen(PORT, () => {
  console.log(`\n🎓 Mock course server running at http://localhost:${PORT}\n`);
  console.log('   Course index:          http://localhost:' + PORT + '/course.html');
  console.log('   Module 1 index:        http://localhost:' + PORT + '/module1/index.html');
  console.log('   Module 2 index:        http://localhost:' + PORT + '/module2/index.html');
  console.log('\n   Press Ctrl+C to stop.\n');
});

// ─── Asset generation ──────────────────────────────────────────────────────

function ensureAssets() {
  const assetDir = join(PUBLIC, 'assets');
  mkdirSync(assetDir, { recursive: true });

  // Minimal valid PDF
  if (!existsSync(join(assetDir, 'sample.pdf'))) {
    writeFileSync(
      join(assetDir, 'sample.pdf'),
      '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
      '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
      '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj\n' +
      'xref\n0 4\n0000000000 65535 f\n0000000009 00000 n\n' +
      '0000000052 00000 n\n0000000101 00000 n\n' +
      'trailer<</Size 4/Root 1 0 R>>\nstartxref\n149\n%%EOF\n',
    );
  }

  // Minimal MP4 (ftyp box - makes it a valid MP4 container header)
  if (!existsSync(join(assetDir, 'sample.mp4'))) {
    // Minimal valid ftyp box for MP4
    const ftyp = Buffer.alloc(24);
    ftyp.writeUInt32BE(24, 0);           // box size
    ftyp.write('ftyp', 4, 'ascii');       // box type
    ftyp.write('isom', 8, 'ascii');       // major brand
    ftyp.writeUInt32BE(0x200, 12);        // minor version
    ftyp.write('isomiso2', 16, 'ascii');  // compatible brands
    writeFileSync(join(assetDir, 'sample.mp4'), ftyp);
  }

  // Minimal ZIP (empty archive)
  if (!existsSync(join(assetDir, 'sample.zip'))) {
    // End of central directory record for empty archive
    const zip = Buffer.from(
      '504b0506' + '0000' + '0000' + '0000' + '0000' +
      '00000000' + '00000000' + '0000',
      'hex',
    );
    writeFileSync(join(assetDir, 'sample.zip'), zip);
  }

  // HLS m3u8 playlist with subtitle reference
  if (!existsSync(join(assetDir, 'playlist.m3u8'))) {
    writeFileSync(
      join(assetDir, 'playlist.m3u8'),
      [
        '#EXTM3U',
        '#EXT-X-VERSION:3',
        '#EXT-X-TARGETDURATION:10',
        '#EXT-X-MEDIA-SEQUENCE:0',
        '',
        '# Subtitle track',
        '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="English",DEFAULT=YES,AUTOSELECT=YES,LANGUAGE="en",URI="subtitles.vtt"',
        '',
        '# Video segments (stub)',
        '#EXTINF:10.0,',
        'segment000.ts',
        '#EXTINF:10.0,',
        'segment001.ts',
        '#EXT-X-ENDLIST',
      ].join('\n'),
    );
  }

  // WebVTT subtitle file
  if (!existsSync(join(assetDir, 'subtitles.vtt'))) {
    writeFileSync(
      join(assetDir, 'subtitles.vtt'),
      [
        'WEBVTT',
        '',
        '00:00:00.000 --> 00:00:05.000',
        'Welcome to the mock course!',
        '',
        '00:00:05.000 --> 00:00:10.000',
        'This is a test subtitle for the HLS stream.',
        '',
      ].join('\n'),
    );
  }
}
