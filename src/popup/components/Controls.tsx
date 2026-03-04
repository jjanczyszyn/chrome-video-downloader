import React from 'react';

interface Props {
  canScan: boolean;
  isScanning: boolean;
  isPaused: boolean;
  canDownload: boolean;
  canExport: boolean;
  showOptions: boolean;
  onScan: () => void;
  onPause: () => void;
  onResume: () => void;
  onDownload: () => void;
  onDownloadVtts: () => void;
  onExportIndex: () => void;
  onExportM3u8Index: () => void;
  onClear: () => void;
  onToggleOptions: () => void;
}

export function Controls(props: Props) {
  const {
    canScan, isScanning, isPaused, canDownload, canExport, showOptions,
    onScan, onPause, onResume, onDownload, onDownloadVtts,
    onExportIndex, onExportM3u8Index, onClear, onToggleOptions,
  } = props;

  return (
    <div style={styles.container}>
      {/* Row 1 – Scan controls */}
      <div style={styles.row}>
        {!isScanning && !isPaused && (
          <Btn onClick={onScan} disabled={!canScan} primary>
            🔍 Scan this course
          </Btn>
        )}
        {isScanning && (
          <Btn onClick={onPause} danger>⏸ Pause</Btn>
        )}
        {isPaused && (
          <Btn onClick={onResume} primary>▶ Resume scan</Btn>
        )}
        <Btn onClick={onDownloadVtts} disabled={!canDownload} accent>
          💬 Download VTTs
        </Btn>
        <Btn onClick={onDownload} disabled={!canDownload}>
          ⬇ All resources
        </Btn>
      </div>

      {/* Row 2 – Export / utility */}
      <div style={styles.row}>
        <Btn onClick={onExportM3u8Index} disabled={!canExport} accent>
          📋 m3u8 Index
        </Btn>
        <Btn onClick={onExportIndex} disabled={!canExport}>
          📄 Full export
        </Btn>
        <Btn onClick={onToggleOptions}>
          {showOptions ? '✕ Options' : '⚙ Options'}
        </Btn>
        <Btn onClick={onClear} danger>🗑</Btn>
      </div>
    </div>
  );
}

function Btn({
  children, onClick, disabled = false,
  primary = false, danger = false, accent = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
  danger?: boolean;
  accent?: boolean;
}) {
  const bg = disabled
    ? '#1e293b'
    : danger ? '#7f1d1d'
    : primary ? '#1d4ed8'
    : accent ? '#065f46'
    : '#1e3a5f';

  const border = disabled
    ? '#334155'
    : danger ? '#991b1b'
    : primary ? '#2563eb'
    : accent ? '#047857'
    : '#334155';

  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        ...styles.btn,
        background: bg,
        color: disabled ? '#475569' : '#e2e8f0',
        border: `1px solid ${border}`,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {children}
    </button>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '8px 12px',
    borderBottom: '1px solid #1e293b',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  row: {
    display: 'flex',
    gap: 5,
    flexWrap: 'wrap',
  },
  btn: {
    padding: '5px 10px',
    borderRadius: 5,
    fontSize: 11,
    fontWeight: 600,
    whiteSpace: 'nowrap',
  },
};
