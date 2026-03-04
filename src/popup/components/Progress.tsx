import React from 'react';
import type { CrawlProgress, CourseData } from '../../shared/types';

interface Props {
  progress: CrawlProgress;
  course?: CourseData;
}

export function Progress({ progress, course }: Props) {
  const scanPct = progress.totalPages > 0
    ? Math.round((progress.pagesVisited / progress.totalPages) * 100)
    : 0;

  const dlPct = progress.resourcesFound > 0
    ? Math.round((progress.resourcesDownloaded / progress.resourcesFound) * 100)
    : 0;

  return (
    <div style={styles.container}>
      {course && (
        <div style={styles.courseTitle}>
          📚 {course.title}
          {course.modules.length > 0 && (
            <span style={styles.meta}>
              {' '}· {course.modules.length} modules
              · {course.modules.reduce((s, m) => s + m.lessons.length, 0)} lessons
            </span>
          )}
        </div>
      )}

      <div style={styles.stats}>
        <Stat label="Pages" value={`${progress.pagesVisited} / ${progress.totalPages}`} />
        <Stat label="Resources" value={String(progress.resourcesFound)} />
        <Stat label="Downloaded" value={String(progress.resourcesDownloaded)} />
        {progress.resourcesFailed > 0 && (
          <Stat label="Failed" value={String(progress.resourcesFailed)} danger />
        )}
      </div>

      <ProgressBar label="Scan" pct={scanPct} color="#3b82f6" />
      {progress.resourcesFound > 0 && (
        <ProgressBar label="Downloads" pct={dlPct} color="#22c55e" />
      )}
    </div>
  );
}

function Stat({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) {
  return (
    <div style={styles.stat}>
      <span style={{ ...styles.statValue, color: danger ? '#ef4444' : '#e2e8f0' }}>{value}</span>
      <span style={styles.statLabel}>{label}</span>
    </div>
  );
}

function ProgressBar({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <div style={styles.barContainer}>
      <div style={styles.barHeader}>
        <span style={styles.barLabel}>{label}</span>
        <span style={styles.barPct}>{pct}%</span>
      </div>
      <div style={styles.barTrack}>
        <div style={{ ...styles.barFill, width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '8px 12px',
    borderBottom: '1px solid #1e293b',
  },
  courseTitle: {
    fontSize: 12,
    fontWeight: 600,
    color: '#e2e8f0',
    marginBottom: 6,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  meta: {
    fontWeight: 400,
    color: '#94a3b8',
  },
  stats: {
    display: 'flex',
    gap: 16,
    marginBottom: 8,
  },
  stat: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  statValue: {
    fontSize: 16,
    fontWeight: 700,
  },
  statLabel: {
    fontSize: 10,
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  barContainer: {
    marginBottom: 4,
  },
  barHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: 10,
    color: '#94a3b8',
    marginBottom: 2,
  },
  barLabel: {},
  barPct: {},
  barTrack: {
    height: 4,
    background: '#1e293b',
    borderRadius: 99,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 99,
    transition: 'width 0.3s ease',
  },
};
