/**
 * Build orchestrator for the Course Library Exporter extension.
 *
 * Produces dist/:
 *   popup.html + assets/  ← Vite (React)
 *   background.js         ← esbuild (ES module)
 *   content-script.js     ← esbuild (IIFE, self-contained)
 *   manifest.json         ← copied from root
 *   icons/                ← copied from src/icons/
 */

import { build as viteBuild } from 'vite';
import { build as esbuild } from 'esbuild';
import {
  copyFileSync,
  mkdirSync,
  existsSync,
  writeFileSync,
  readdirSync,
  statSync,
  readFileSync,
} from 'fs';
import { join, resolve } from 'path';

const ROOT = resolve(__dirname, '..');
const DIST = join(ROOT, 'dist');

async function main() {
  console.log('🏗  Building Course Library Exporter…\n');

  // 0. Ensure dist exists
  mkdirSync(DIST, { recursive: true });

  // 1. Build popup with Vite (React)
  //    vite.config.ts uses root=src/popup → outputs index.html to dist/index.html
  console.log('📦 Building popup (React)…');
  await viteBuild({
    configFile: join(ROOT, 'vite.config.ts'),
    logLevel: 'warn',
  });

  // Rename dist/index.html → dist/popup.html (manifest references popup.html)
  const indexHtml = join(DIST, 'index.html');
  const popupHtml = join(DIST, 'popup.html');
  if (existsSync(indexHtml)) {
    const html = readFileSync(indexHtml, 'utf8');
    writeFileSync(popupHtml, html);
    // Leave index.html as-is for easier browser testing
  }
  console.log('   ✓ popup done\n');

  // 2. Build background service worker with esbuild
  console.log('⚙️  Building background service worker…');
  await esbuild({
    entryPoints: [join(ROOT, 'src/background/index.ts')],
    bundle: true,
    outfile: join(DIST, 'background.js'),
    format: 'esm',
    target: 'chrome120',
    platform: 'browser',
    sourcemap: process.env['NODE_ENV'] !== 'production',
    minify: process.env['NODE_ENV'] === 'production',
    define: {
      'process.env.NODE_ENV': JSON.stringify(process.env['NODE_ENV'] ?? 'development'),
    },
  });
  console.log('   ✓ background.js done\n');

  // 3. Build content script with esbuild (IIFE – must be self-contained)
  console.log('📄 Building content script…');
  await esbuild({
    entryPoints: [join(ROOT, 'src/content/index.ts')],
    bundle: true,
    outfile: join(DIST, 'content-script.js'),
    format: 'iife',
    target: 'chrome120',
    platform: 'browser',
    sourcemap: process.env['NODE_ENV'] !== 'production',
    minify: process.env['NODE_ENV'] === 'production',
  });
  console.log('   ✓ content-script.js done\n');

  // 4. Copy manifest
  console.log('📋 Copying manifest.json…');
  copyFileSync(join(ROOT, 'manifest.json'), join(DIST, 'manifest.json'));
  console.log('   ✓ manifest.json done\n');

  // 5. Copy icons (or generate placeholders)
  const iconSrc = join(ROOT, 'src/icons');
  const iconDst = join(DIST, 'icons');
  mkdirSync(iconDst, { recursive: true });

  if (existsSync(iconSrc)) {
    for (const f of readdirSync(iconSrc)) {
      if (statSync(join(iconSrc, f)).isFile()) {
        copyFileSync(join(iconSrc, f), join(iconDst, f));
      }
    }
    console.log('   ✓ icons copied\n');
  } else {
    // Generate minimal 1×1 PNG placeholders so manifest references don't break
    generatePlaceholderIcons(iconDst);
    console.log('   ✓ placeholder icons generated\n');
  }

  console.log(`\n✅ Build complete. Load unpacked from: ${DIST}\n`);
}

/**
 * Generates minimal valid 1×1 transparent PNG files for each required icon size.
 * These are real PNGs – the smallest valid PNG is 67 bytes.
 */
function generatePlaceholderIcons(dir: string) {
  // Minimal 1x1 transparent PNG (hex)
  const png1x1 = Buffer.from(
    '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489' +
    '0000000a49444154789c6260000000020001e221bc330000000049454e44ae426082',
    'hex',
  );
  for (const size of [16, 32, 48, 128]) {
    writeFileSync(join(dir, `icon${size}.png`), png1x1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
