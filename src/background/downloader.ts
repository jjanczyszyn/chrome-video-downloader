/**
 * Handles downloading resources via chrome.downloads API.
 * Organises files into "Course Library Exporter/<course>/<module>/<lesson>/" folders.
 */

import type { CrawlState, Resource } from '../shared/types';
import { loadState, saveState, appendLog } from './storage';
import { buildSavePath, nowISO } from '../shared/utils';
import { broadcastState } from './index';

let downloading = false;

export function isDownloading(): boolean {
  return downloading;
}

export async function startDownloads(): Promise<void> {
  if (downloading) return;

  let state = await loadState();
  if (!state.course) {
    state = appendLog(state, 'error', 'No course data. Run scan first.');
    await saveState(state);
    await broadcastState(state);
    return;
  }

  if (state.options.onlyExportIndex) {
    state = appendLog(state, 'info', '"Only export index" option is enabled – skipping downloads.');
    await saveState(state);
    await broadcastState(state);
    return;
  }

  downloading = true;
  state.status = 'downloading';
  state = appendLog(state, 'info', 'Starting downloads…');
  await saveState(state);
  await broadcastState(state);

  try {
    await runDownloadLoop();
  } catch (err) {
    let s = await loadState();
    s = appendLog(s, 'error', `Download error: ${String(err)}`);
    s.status = 'error';
    s.error = String(err);
    await saveState(s);
    await broadcastState(s);
  } finally {
    downloading = false;
  }
}

async function runDownloadLoop(): Promise<void> {
  const state = await loadState();
  if (!state.course) return;

  const { course } = state;
  const moduleTotal = course.modules.length;

  for (let mi = 0; mi < course.modules.length; mi++) {
    const mod = course.modules[mi];
    const lessonTotal = mod.lessons.length;

    for (let li = 0; li < mod.lessons.length; li++) {
      const lesson = mod.lessons[li];

      for (const resource of lesson.resources) {
        if (resource.status !== 'downloadable_allowed') continue;

        const savePath = buildSavePath({
          courseTitle: course.title,
          moduleIndex: mi,
          moduleTotal,
          moduleTitle: mod.title,
          lessonIndex: li,
          lessonTotal,
          lessonTitle: lesson.title,
          filename: resource.filename,
        });

        await downloadResource(resource, savePath);

        // Reload and re-reference to persist
        const fresh = await loadState();
        const r = findResource(fresh, resource.id);
        if (r) {
          r.status = 'download_started';
          r.downloadPath = savePath;
          await saveState(fresh);
          await broadcastState(fresh);
        }
      }
    }
  }

  let finalState = await loadState();
  finalState.status = 'complete';
  finalState.completedAt = nowISO();
  finalState = appendLog(
    finalState,
    'success',
    `All downloads initiated. ${finalState.progress.resourcesDownloaded} succeeded, ${finalState.progress.resourcesFailed} failed.`,
  );
  await saveState(finalState);
  await broadcastState(finalState);
}

async function downloadResource(resource: Resource, savePath: string): Promise<void> {
  return new Promise((resolve) => {
    chrome.downloads.download(
      {
        url: resource.url,
        filename: savePath,
        conflictAction: 'uniquify',
        saveAs: false,
      },
      async (downloadId) => {
        const state = await loadState();
        const r = findResource(state, resource.id);
        if (!r) { resolve(); return; }

        if (chrome.runtime.lastError) {
          r.status = 'download_failed';
          r.error = chrome.runtime.lastError.message;
          state.progress.resourcesFailed++;
          const logged = appendLog(state, 'error', `  Failed: ${resource.filename} – ${r.error}`);
          await saveState(logged);
          await broadcastState(logged);
          resolve();
          return;
        }

        r.status = 'download_started';
        r.downloadId = downloadId;
        r.downloadPath = savePath;
        state.progress.resourcesDownloaded++;
        const logged = appendLog(state, 'info', `  Downloading: ${resource.filename}`);
        await saveState(logged);
        await broadcastState(logged);

        // Listen for completion
        function onChanged(delta: chrome.downloads.DownloadDelta) {
          if (delta.id !== downloadId) return;
          if (delta.state?.current === 'complete') {
            chrome.downloads.onChanged.removeListener(onChanged);
            updateResourceComplete(resource.id, 'download_complete');
            resolve();
          } else if (delta.state?.current === 'interrupted') {
            chrome.downloads.onChanged.removeListener(onChanged);
            updateResourceComplete(resource.id, 'download_failed', delta.error?.current);
            resolve();
          }
        }

        chrome.downloads.onChanged.addListener(onChanged);

        // Fallback timeout in case events are missed
        setTimeout(() => {
          chrome.downloads.onChanged.removeListener(onChanged);
          resolve();
        }, 60_000);
      },
    );
  });
}

async function updateResourceComplete(
  resourceId: string,
  status: 'download_complete' | 'download_failed',
  error?: string,
) {
  const state = await loadState();
  const r = findResource(state, resourceId);
  if (!r) return;
  r.status = status;
  r.completedAt = nowISO();
  if (error) r.error = error;
  if (status === 'download_complete') {
    appendLog(state, 'success', `  Complete: ${r.filename}`);
  } else {
    state.progress.resourcesFailed++;
    appendLog(state, 'error', `  Failed: ${r.filename} – ${error ?? 'interrupted'}`);
  }
  await saveState(state);
  await broadcastState(state);
}

function findResource(state: CrawlState, id: string): Resource | undefined {
  for (const mod of state.course?.modules ?? []) {
    for (const lesson of mod.lessons) {
      const r = lesson.resources.find((res) => res.id === id);
      if (r) return r;
    }
  }
  return undefined;
}
