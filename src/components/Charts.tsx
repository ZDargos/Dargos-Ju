import { useState } from 'react';
import type { Bucket } from '../lib/stats';

export const BUCKETS: { key: Bucket; label: string; color: string }[] = [
  { key: 'new', label: 'Not started', color: 'var(--b-new)' },
  { key: 'learning', label: 'Learning', color: 'var(--b-learning)' },
  { key: 'young', label: 'Getting there', color: 'var(--b-young)' },
  { key: 'mature', label: 'Known (3+ weeks)', color: 'var(--b-mature)' },
];

export function StackedBar({ counts, label }: { counts: Record<Bucket, number>; label: string }) {
  const total = BUCKETS.reduce((n, b) => n + counts[b.key], 0) || 1;
  return (
    <div className="stacked" role="img" aria-label={`${label}: ${BUCKETS.map((b) => `${counts[b.key]} ${b.label}`).join(', ')}`}>
      {BUCKETS.filter((b) => counts[b.key] > 0).map((b) => (
        <div key={b.key} style={{ flex: counts[b.key] / total, background: b.color }} title={`${b.label}: ${counts[b.key]}`} />
      ))}
    </div>
  );
}

export function BucketLegend({ counts }: { counts?: Record<Bucket, number> }) {
  return (
    <div className="legend">
      {BUCKETS.map((b) => (
        <span key={b.key}>
          <i style={{ background: b.color }} />
          {b.label}
          {counts && <strong style={{ color: 'var(--text)', marginLeft: 4 }}>{counts[b.key]}</strong>}
        </span>
      ))}
    </div>
  );
}

interface BarDatum {
  label: string;
  value: number;
  detail?: string;
}

/** Simple single-series column chart with tap/hover readout. */
export function BarChart({ data, height = 120, showValues = false, xLabels }: { data: BarDatum[]; height?: number; showValues?: boolean; xLabels?: (i: number) => string | null }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  const w = 100 / data.length;
  const top = 4;
  const plotH = height - top;
  const sel = active ?? null;
  return (
    <div>
      <div className="chart-tip" style={{ minHeight: 18 }}>
        {sel !== null ? (
          <>
            <strong style={{ color: 'var(--text)' }}>{data[sel].label}</strong> · {data[sel].detail ?? data[sel].value}
          </>
        ) : (
          ' '
        )}
      </div>
      <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" width="100%" height={height} onMouseLeave={() => setActive(null)} role="img" aria-label="Bar chart">
        <line x1="0" x2="100" y1={top + plotH} y2={top + plotH} stroke="var(--border)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        {data.map((d, i) => {
          const h = d.value ? Math.max(2, (d.value / max) * plotH) : 0;
          const x = i * w + w * 0.18;
          const bw = w * 0.64;
          return (
            <g key={i}>
              <rect
                x={x}
                y={top + plotH - h}
                width={bw}
                height={h}
                rx={Math.min(1.2, bw / 2)}
                fill="var(--bar)"
                opacity={sel === null || sel === i ? 1 : 0.35}
              />
              {/* Hit target larger than the bar */}
              <rect x={i * w} y={0} width={w} height={height} fill="transparent" onMouseEnter={() => setActive(i)} onClick={() => setActive(i)} />
            </g>
          );
        })}
      </svg>
      <div style={{ display: 'flex', fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
        {data.map((d, i) => (
          <div key={i} style={{ flex: 1, textAlign: 'center', whiteSpace: 'nowrap', overflow: 'visible' }}>
            {showValues && <div style={{ color: 'var(--text)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{d.value}</div>}
            {xLabels ? xLabels(i) ?? '' : d.label}
          </div>
        ))}
      </div>
    </div>
  );
}
