import React, { useEffect, useReducer, useCallback } from 'react';
import type { CrawlState, CrawlOptions } from '../shared/types';
import { DEFAULT_OPTIONS } from '../shared/types';
import { MSG } from '../shared/messages';
import type { StartScanPayload, UpdateOptionsPayload } from '../shared/messages';
import { Header } from './components/Header';
import { Controls } from './components/Controls';
import { Progress } from './components/Progress';
import { LogViewer } from './components/LogViewer';
import { OptionsPanel } from './components/OptionsPanel';

// ─── State ─────────────────────────────────────────────────────────────────

interface UIState {
  crawlState: CrawlState | null;
  currentTabUrl: string;
  currentTabDomain: string;
  showOptions: boolean;
  localOptions: CrawlOptions;
}

type UIAction =
  | { type: 'SET_STATE'; payload: CrawlState }
  | { type: 'SET_TAB'; payload: { url: string; domain: string } }
  | { type: 'TOGGLE_OPTIONS' }
  | { type: 'UPDATE_LOCAL_OPTION'; payload: Partial<CrawlOptions> };

function reducer(state: UIState, action: UIAction): UIState {
  switch (action.type) {
    case 'SET_STATE':
      return {
        ...state,
        crawlState: action.payload,
        localOptions: action.payload.options ?? state.localOptions,
      };
    case 'SET_TAB':
      return { ...state, currentTabUrl: action.payload.url, currentTabDomain: action.payload.domain };
    case 'TOGGLE_OPTIONS':
      return { ...state, showOptions: !state.showOptions };
    case 'UPDATE_LOCAL_OPTION':
      return { ...state, localOptions: { ...state.localOptions, ...action.payload } };
    default:
      return state;
  }
}

const initialUIState: UIState = {
  crawlState: null,
  currentTabUrl: '',
  currentTabDomain: '',
  showOptions: false,
  localOptions: { ...DEFAULT_OPTIONS },
};

// ─── App ───────────────────────────────────────────────────────────────────

export default function App() {
  const [ui, dispatch] = useReducer(reducer, initialUIState);

  // ── Load initial state ──────────────────────────────────────────────────
  useEffect(() => {
    // Get current tab info
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (tab?.url) {
        try {
          const u = new URL(tab.url);
          dispatch({ type: 'SET_TAB', payload: { url: tab.url, domain: u.hostname } });
        } catch {
          dispatch({ type: 'SET_TAB', payload: { url: tab.url ?? '', domain: '' } });
        }
      }
    });

    // Get background state
    chrome.runtime.sendMessage({ type: MSG.GET_STATE }, (state: CrawlState) => {
      if (state) dispatch({ type: 'SET_STATE', payload: state });
    });

    // Listen for background state updates
    const listener = (msg: { type: string; payload?: { state: CrawlState } }) => {
      if (msg.type === MSG.STATE_UPDATE && msg.payload?.state) {
        dispatch({ type: 'SET_STATE', payload: msg.payload.state });
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  // ── Actions ─────────────────────────────────────────────────────────────

  const handleScan = useCallback(() => {
    const payload: StartScanPayload = {
      startUrl: ui.currentTabUrl,
      options: ui.localOptions,
    };
    chrome.runtime.sendMessage({ type: MSG.START_SCAN, payload });
  }, [ui.currentTabUrl, ui.localOptions]);

  const handlePause = useCallback(() => {
    chrome.runtime.sendMessage({ type: MSG.PAUSE_SCAN });
  }, []);

  const handleResume = useCallback(() => {
    chrome.runtime.sendMessage({ type: MSG.RESUME_SCAN });
  }, []);

  const handleDownload = useCallback(() => {
    chrome.runtime.sendMessage({ type: MSG.START_DOWNLOAD });
  }, []);

  const handleDownloadVtts = useCallback(() => {
    chrome.runtime.sendMessage({ type: MSG.DOWNLOAD_VTTS });
  }, []);

  const handleExport = useCallback(() => {
    chrome.runtime.sendMessage({ type: MSG.EXPORT_INDEX }, (res: { error?: string }) => {
      if (res?.error) alert(res.error);
    });
  }, []);

  const handleExportM3u8Index = useCallback(() => {
    chrome.runtime.sendMessage({ type: MSG.EXPORT_M3U8_INDEX }, (res: { error?: string }) => {
      if (res?.error) alert(res.error);
    });
  }, []);

  const handleClear = useCallback(() => {
    if (confirm('Clear all scan data and start fresh?')) {
      chrome.runtime.sendMessage({ type: MSG.CLEAR_DATA });
    }
  }, []);

  const handleOptionChange = useCallback((opts: Partial<CrawlOptions>) => {
    dispatch({ type: 'UPDATE_LOCAL_OPTION', payload: opts });
    const payload: UpdateOptionsPayload = { options: opts };
    chrome.runtime.sendMessage({ type: MSG.UPDATE_OPTIONS, payload });
  }, []);

  // ── Derived ─────────────────────────────────────────────────────────────
  const status = ui.crawlState?.status ?? 'idle';
  const isScanning = status === 'scanning';
  const isPaused = status === 'paused';
  const hasCourse = !!ui.crawlState?.course;
  const canDownload = (status === 'scan_complete' || status === 'complete' || status === 'paused') && hasCourse;
  const canExport = hasCourse;
  const canScan = !isScanning;

  return (
    <div style={styles.container}>
      <Header domain={ui.currentTabDomain} status={status} />

      <div style={styles.tosNote}>
        ⚖️ Only downloads files explicitly provided by the site. No DRM bypass. No paywall bypass.
      </div>

      <Controls
        canScan={canScan}
        isScanning={isScanning}
        isPaused={isPaused}
        canDownload={canDownload}
        canExport={canExport}
        onScan={handleScan}
        onPause={handlePause}
        onResume={handleResume}
        onDownload={handleDownload}
        onDownloadVtts={handleDownloadVtts}
        onExportIndex={handleExport}
        onExportM3u8Index={handleExportM3u8Index}
        onClear={handleClear}
        onToggleOptions={() => dispatch({ type: 'TOGGLE_OPTIONS' })}
        showOptions={ui.showOptions}
      />

      {ui.showOptions && (
        <OptionsPanel options={ui.localOptions} onChange={handleOptionChange} />
      )}

      {ui.crawlState && (
        <Progress progress={ui.crawlState.progress} course={ui.crawlState.course} />
      )}

      <LogViewer logs={ui.crawlState?.logs ?? []} />
    </div>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    maxHeight: '600px',
    overflow: 'hidden',
  },
  tosNote: {
    fontSize: 11,
    color: '#94a3b8',
    padding: '4px 12px',
    background: '#1e293b',
    borderBottom: '1px solid #334155',
    lineHeight: 1.4,
  },
};
