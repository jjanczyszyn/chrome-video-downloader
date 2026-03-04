import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { resolve } from 'path';

export default async function globalSetup() {
  const distPath = resolve(__dirname, '../../dist');

  // Build extension if dist doesn't exist yet
  if (!existsSync(resolve(distPath, 'manifest.json'))) {
    console.log('[E2E setup] Building extension…');
    execSync('pnpm build', {
      cwd: resolve(__dirname, '../..'),
      stdio: 'inherit',
    });
  } else {
    console.log('[E2E setup] Using existing dist/');
  }
}
