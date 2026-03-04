import React, { useEffect, useRef } from 'react';
import type { LogEntry } from '../../shared/types';

interface Props {
  logs: LogEntry[];
}

const LEVEL_COLOR: Record<LogEntry['level'], string> = {
  info: '#94a3b8',
  warn: '#f59e0b',
  error: '#ef4444',
  success: '#22c55e',
};

const LEVEL_PREFIX: Record<LogEntry['level'], string> = {
  info: '·',
  warn: '⚠',
  error: '✕',
  success: '✓',
};

export function LogViewer({ logs }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs.length]);

  if (logs.length === 0) {
    return (
      <div style={styles.empty}>
        No activity yet. Navigate to a course page and click "Scan this course".
      </div>
    );
  }

  // Show last 60 logs
  const visible = logs.slice(-60);

  return (
    <div style={styles.container}>
      {visible.map((entry, i) => (
        <div key={i} style={styles.entry}>
          <span style={{ ...styles.prefix, color: LEVEL_COLOR[entry.level] }}>
            {LEVEL_PREFIX[entry.level]}
          </span>
          <span style={{ ...styles.message, color: LEVEL_COLOR[entry.level] }}>
            {entry.message}
          </span>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    flex: 1,
    overflowY: 'auto',
    padding: '6px 12px',
    fontFamily: 'ui-monospace, monospace',
    fontSize: 10.5,
    lineHeight: 1.6,
    background: '#070d14',
    minHeight: 80,
    maxHeight: 200,
  },
  empty: {
    padding: '12px',
    fontSize: 11,
    color: '#475569',
    fontStyle: 'italic',
    textAlign: 'center',
    background: '#070d14',
  },
  entry: {
    display: 'flex',
    gap: 6,
    alignItems: 'flex-start',
  },
  prefix: {
    flexShrink: 0,
    fontWeight: 700,
    width: 10,
  },
  message: {
    wordBreak: 'break-all',
  },
};
