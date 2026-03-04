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
  onExport: () => void;
  onClear: () => void;
  onToggleOptions: () => void;
}

export function Controls(props: Props) {
  const {
    canScan, isScanning, isPaused, canDownload, canExport, showOptions,
    onScan, onPause, onResume, onDownload, onExport, onClear, onToggleOptions,
  } = props;

  return (
    <div style={styles.container}>
      <div style={styles.row}>
        {!isScanning && !isPaused && (
          <Btn onClick={onScan} disabled={!canScan} primary>
            🔍 Scan this course
          </Btn>
        )}
        {isScanning && (
          <Btn onClick={onPause} danger>
            ⏸ Pause scan
          </Btn>
        )}
        {isPaused && (
          <Btn onClick={onResume} primary>
            ▶ Resume scan
          </Btn>
        )}
        <Btn onClick={onDownload} disabled={!canDownload}>
          ⬇ Download resources
        </Btn>
      </div>

      <div style={styles.row}>
        <Btn onClick={onExport} disabled={!canExport}>
          📄 Export index
        </Btn>
        <Btn onClick={onToggleOptions}>
          {showOptions ? '✕ Hide options' : '⚙ Options'}
        </Btn>
        <Btn onClick={onClear} danger>
          🗑 Clear
        </Btn>
      </div>
    </div>
  );
}

function Btn({
  children,
  onClick,
  disabled = false,
  primary = false,
  danger = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
  danger?: boolean;
}) {
  const bg = disabled ? '#1e293b' : danger ? '#7f1d1d' : primary ? '#1d4ed8' : '#1e3a5f';
  const color = disabled ? '#475569' : '#e2e8f0';
  const border = disabled ? '#334155' : danger ? '#991b1b' : primary ? '#2563eb' : '#334155';

  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        ...styles.btn,
        background: bg,
        color,
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
    gap: 6,
    flexWrap: 'wrap',
  },
  btn: {
    padding: '5px 10px',
    borderRadius: 5,
    fontSize: 11,
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    transition: 'opacity 0.1s',
  },
};
