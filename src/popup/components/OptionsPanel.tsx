import React from 'react';
import type { CrawlOptions } from '../../shared/types';

interface Props {
  options: CrawlOptions;
  onChange: (opts: Partial<CrawlOptions>) => void;
}

export function OptionsPanel({ options, onChange }: Props) {
  return (
    <div style={styles.container}>
      <div style={styles.title}>⚙ Options</div>

      <div style={styles.grid}>
        <Label>Max pages</Label>
        <input
          type="number"
          min={1}
          max={2000}
          value={options.maxPages}
          onChange={(e) => onChange({ maxPages: Number(e.target.value) })}
          style={styles.input}
        />

        <Label>Delay (ms)</Label>
        <input
          type="number"
          min={0}
          max={5000}
          step={100}
          value={options.delayMs}
          onChange={(e) => onChange({ delayMs: Number(e.target.value) })}
          style={styles.input}
        />

        <Label>Same-origin only</Label>
        <Toggle
          checked={options.sameOriginOnly}
          onChange={(v) => onChange({ sameOriginOnly: v })}
        />

        <Label>Sanitize filenames</Label>
        <Toggle
          checked={options.sanitizeFilenames}
          onChange={(v) => onChange({ sanitizeFilenames: v })}
        />

        <Label>Export index only (no downloads)</Label>
        <Toggle
          checked={options.onlyExportIndex}
          onChange={(v) => onChange({ onlyExportIndex: v })}
        />
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <span style={styles.label}>{children}</span>;
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      style={{
        ...styles.toggle,
        background: checked ? '#1d4ed8' : '#1e293b',
        borderColor: checked ? '#2563eb' : '#334155',
      }}
    >
      {checked ? 'ON' : 'OFF'}
    </button>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '8px 12px',
    background: '#0f1f38',
    borderBottom: '1px solid #1e293b',
  },
  title: {
    fontSize: 11,
    fontWeight: 700,
    color: '#94a3b8',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: '1fr auto',
    gap: '4px 8px',
    alignItems: 'center',
  },
  label: {
    fontSize: 11,
    color: '#cbd5e1',
  },
  input: {
    background: '#1e293b',
    border: '1px solid #334155',
    borderRadius: 4,
    color: '#e2e8f0',
    fontSize: 11,
    padding: '2px 6px',
    width: 64,
    textAlign: 'right',
  } as React.CSSProperties,
  toggle: {
    border: '1px solid',
    borderRadius: 4,
    color: '#e2e8f0',
    cursor: 'pointer',
    fontSize: 10,
    fontWeight: 700,
    padding: '2px 8px',
    letterSpacing: '0.05em',
  },
};
