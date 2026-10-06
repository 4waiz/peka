import { useId, useMemo } from 'react';

interface Props {
  data: number[];
  color: string;
  width?: number;
  height?: number;
  /** fixed min/max span so tiny noise does not look dramatic */
  minSpan?: number;
}

/** Minimal SVG sparkline: hairline stroke, faint area, small live end-point. */
export function Sparkline({ data, color, width = 104, height = 34, minSpan = 1 }: Props) {
  const id = useId();
  const { line, area, last } = useMemo(() => {
    let min = Math.min(...data);
    let max = Math.max(...data);
    if (max - min < minSpan) {
      const mid = (max + min) / 2;
      min = mid - minSpan / 2;
      max = mid + minSpan / 2;
    }
    const pad = 3;
    const n = data.length;
    const pts = data.map((v, i) => {
      const x = (i / (n - 1)) * (width - pad * 2) + pad;
      const y = height - pad - ((v - min) / (max - min)) * (height - pad * 2);
      return [x, y] as const;
    });
    const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
    const area = `${line} L${pts[n - 1][0].toFixed(1)} ${height} L${pts[0][0].toFixed(1)} ${height} Z`;
    return { line, area, last: pts[n - 1] };
  }, [data, width, height, minSpan]);
  return (
    <svg className="sparkline" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      <defs>
        <linearGradient id={`g${id}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" style={{ stopColor: color, stopOpacity: 0.14 }} />
          <stop offset="100%" style={{ stopColor: color, stopOpacity: 0 }} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#g${id})`} />
      <path d={line} fill="none" style={{ stroke: color }} strokeWidth="1.3" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r="2" style={{ fill: color }} />
    </svg>
  );
}
