import React from 'react';
import type { CrawlStatus } from '../../shared/types';

interface Props {
  domain: string;
  status: CrawlStatus;
}

const STATUS_LABEL: Record<CrawlStatus, string> = {
  idle: 'Ready',
  scanning: 'Scanning…',
  scan_complete: 'Scan complete',
  downloading: 'Downloading…',
  complete: 'Done',
  error: 'Error',
  paused: 'Paused',
};

const STATUS_COLOR: Record<CrawlStatus, string> = {
  idle: '#64748b',
  scanning: '#3b82f6',
  scan_complete: '#22c55e',
  downloading: '#f59e0b',
  complete: '#22c55e',
  error: '#ef4444',
  paused: '#f59e0b',
};

export function Header({ domain, status }: Props) {
  const color = STATUS_COLOR[status];
  const label = STATUS_LABEL[status];

  return (
    <div style={styles.header}>
      <div style={styles.title}>
        <span style={styles.icon}>📦</span>
        <span>Course Library Exporter</span>
      </div>
      <div style={styles.meta}>
        <span style={styles.domain}>{domain || 'No active tab'}</span>
        <span style={{ ...styles.badge, background: color }}>{label}</span>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  header: {
    padding: '10px 12px 8px',
    background: '#0f172a',
    borderBottom: '1px solid #1e293b',
  },
  title: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 14,
    fontWeight: 700,
    color: '#f8fafc',
    marginBottom: 4,
  },
  icon: { fontSize: 16 },
  meta: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  domain: {
    fontSize: 11,
    color: '#94a3b8',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    flex: 1,
  },
  badge: {
    fontSize: 10,
    fontWeight: 600,
    padding: '2px 7px',
    borderRadius: 99,
    color: '#fff',
    whiteSpace: 'nowrap',
  },
};
