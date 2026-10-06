import { useEffect, useMemo, useRef, useState } from 'react';
import { TriangleAlert } from 'lucide-react';
import { selPredicted, useAppStore } from '../store/useAppStore';
import { FAILURE_THRESHOLD, FAILURE_WINDOW, FORECAST_K, forecastPressure } from '../simulation/sensorEngine';

const X0 = -12;
const X1 = 72;
const Y0 = 10;
const Y1 = -30;
const M = { l: 40, r: 12, t: 12, b: 22 };
const TICKS_X: [number, string][] = [
  [-12, '−12h'],
  [0, 'Now'],
  [12, '12h'],
  [24, '24h'],
  [36, '36h'],
  [48, '48h'],
  [72, '72h'],
];
const TICKS_Y = [10, 0, -10, -20, -30];

function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ w: 400, h: 140 });
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

export function PredictionTimeline() {
  const [wrapRef, { w, h }] = useSize<HTMLDivElement>();
  const history = useAppStore((s) => s.history.pressure);
  const anomaly = useAppStore((s) => s.anomaly);
  const repair = useAppStore((s) => s.repair);
  const forecast = useAppStore((s) => s.forecastHours);
  const predicted = useAppStore(selPredicted);
  const demoRunning = useAppStore((s) => s.demo.running);
  const flash = useAppStore((s) => (s.flashPanel?.key === 'timeline' ? s.flashPanel.n : 0));
  const [hoverT, setHoverT] = useState<number | null>(null);
  const dragging = useRef(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!flash || !panelRef.current) return;
    panelRef.current.classList.remove('flash');
    void panelRef.current.offsetWidth;
    panelRef.current.classList.add('flash');
  }, [flash]);

  const iw = Math.max(10, w - M.l - M.r);
  const ih = Math.max(10, h - M.t - M.b);
  const sx = (t: number) => M.l + ((t - X0) / (X1 - X0)) * iw;
  const sy = (v: number) => M.t + ((Y0 - v) / (Y0 - Y1)) * ih;
  const repairFactor = repair.status === 'repairing' ? repair.repairProgress : repair.status === 'resolved' ? 1 : 0;
  const a = anomaly * (1 - repairFactor);
  const base = history[history.length - 1] ?? 0;

  const series = useMemo(() => {
    const n = history.length;
    const actual = history.map((v, i) => [sx(X0 + (i / (n - 1)) * (0 - X0)), sy(v)] as const);
    const mean: [number, number][] = [];
    const lo: [number, number][] = [];
    const hi: [number, number][] = [];
    for (let t = 0; t <= X1; t += 1.5) {
      mean.push([sx(t), sy(Math.max(Y1, forecastPressure(t, base, FORECAST_K.mean, a)))]);
      lo.push([sx(t), sy(Math.max(Y1, forecastPressure(t, base, FORECAST_K.optimistic, a)))]);
      hi.push([sx(t), sy(Math.max(Y1, forecastPressure(t, base, FORECAST_K.pessimistic, a)))]);
    }
    return { actual, mean, lo, hi };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history, base, a, w, h]);

  const toPath = (pts: readonly (readonly [number, number])[]) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('');
  const cone = `${toPath(series.lo)}${[...series.hi].reverse().map(([x, y]) => `L${x.toFixed(1)} ${y.toFixed(1)}`).join('')}Z`;
  const showPred = predicted && a > 0.05;
  const cursorT = forecast > 0.2 ? forecast : null;
  const cursorV = cursorT !== null ? forecastPressure(cursorT, base, FORECAST_K.mean, a) : 0;

  const tFromEvent = (e: React.PointerEvent) => {
    const r = (e.currentTarget as SVGElement).getBoundingClientRect();
    const x = (e.clientX - r.left) * (w / Math.max(1, r.width));
    return X0 + ((x - M.l) / iw) * (X1 - X0);
  };
  const scrub = (t: number) => {
    if (!showPred || demoRunning) return;
    useAppStore.setState({ forecastHours: Math.round(Math.min(72, Math.max(0, t))) });
  };

  const hv = hoverT !== null ? Math.min(X1, Math.max(X0, hoverT)) : null;
  let tip: string | null = null;
  if (hv !== null) {
    if (hv < 0) {
      const idx = Math.round(((hv - X0) / -X0) * (history.length - 1));
      tip = `${hv.toFixed(0)}h · actual ${history[Math.max(0, Math.min(history.length - 1, idx))].toFixed(1)}%`;
    } else if (showPred) {
      const m = forecastPressure(hv, base, FORECAST_K.mean, a);
      const lo = forecastPressure(hv, base, FORECAST_K.optimistic, a);
      const hi = forecastPressure(hv, base, FORECAST_K.pessimistic, a);
      tip = `+${hv.toFixed(0)}h · ${m.toFixed(1)}% (${hi.toFixed(1)} … ${lo.toFixed(1)})`;
    }
  }

  return (
    <div className="panel timeline" ref={panelRef}>
      <div className="panel-head">
        <span className="panel-title">Failure Prediction Timeline</span>
        <div className="legend">
          <span>
            <i className="lg-dot actual" /> Actual
          </span>
          <span>
            <i className="lg-dot predicted" /> Predicted (AI)
          </span>
        </div>
      </div>
      <div className="chart-wrap" ref={wrapRef}>
        <svg
          width={w}
          height={h}
          className={`chart ${showPred && !demoRunning ? 'is-scrubbable' : ''}`}
          onPointerMove={(e) => {
            const t = tFromEvent(e);
            setHoverT(t);
            if (dragging.current) scrub(t);
          }}
          onPointerLeave={() => {
            setHoverT(null);
            dragging.current = false;
          }}
          onPointerDown={(e) => {
            dragging.current = true;
            scrub(tFromEvent(e));
          }}
          onPointerUp={() => (dragging.current = false)}
        >
          <defs>
            <linearGradient id="band" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#ff4d5a" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#ff4d5a" stopOpacity="0.04" />
            </linearGradient>
          </defs>
          {TICKS_Y.map((v) => (
            <g key={v}>
              <line x1={M.l} x2={M.l + iw} y1={sy(v)} y2={sy(v)} className={`grid ${v === 0 ? 'zero' : ''}`} />
              <text x={M.l - 7} y={sy(v) + 3.5} className="tick" textAnchor="end">
                {v}
              </text>
            </g>
          ))}
          <text transform={`translate(11 ${M.t + ih / 2}) rotate(-90)`} className="axis-title" textAnchor="middle">
            Pressure (%)
          </text>
          {TICKS_X.map(([t, l]) => (
            <text key={t} x={sx(t)} y={M.t + ih + 15} className={`tick ${t === 0 ? 'now' : ''}`} textAnchor="middle">
              {l}
            </text>
          ))}
          <line x1={sx(0)} x2={sx(0)} y1={M.t} y2={M.t + ih} className="now-line" />

          {showPred && (
            <g className="pred-layer">
              <rect x={sx(FAILURE_WINDOW[0])} y={M.t} width={sx(FAILURE_WINDOW[1]) - sx(FAILURE_WINDOW[0])} height={ih} fill="url(#band)" />
              <line x1={sx(FAILURE_WINDOW[0])} x2={sx(FAILURE_WINDOW[0])} y1={M.t} y2={M.t + ih} className="fail-line" />
              <line x1={sx(FAILURE_WINDOW[1])} x2={sx(FAILURE_WINDOW[1])} y1={M.t} y2={M.t + ih} className="fail-line dashed" />
              <line x1={M.l} x2={M.l + iw} y1={sy(FAILURE_THRESHOLD)} y2={sy(FAILURE_THRESHOLD)} className="threshold" />
              <text x={M.l + iw - 2} y={sy(FAILURE_THRESHOLD) - 4} className="threshold-label" textAnchor="end">
                failure threshold
              </text>
              <path d={cone} className="cone" />
              <path d={toPath(series.mean)} className="pred-line" />
            </g>
          )}
          <path d={toPath(series.actual)} className="actual-line" />
          {series.actual.filter((_, i) => i % 4 === 3).map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={2.2} className="actual-dot" />
          ))}
          {!showPred && (
            <text x={sx(30)} y={M.t + ih / 2} className="pending" textAnchor="middle">
              {anomaly > 0.03 && repair.status !== 'resolved' ? 'AI forecast pending — correlating telemetry…' : 'No degradation forecast — network nominal'}
            </text>
          )}
          {showPred && cursorT !== null && (
            <g className="cursor">
              <line x1={sx(cursorT)} x2={sx(cursorT)} y1={M.t} y2={M.t + ih} />
              <circle cx={sx(cursorT)} cy={sy(Math.max(Y1, cursorV))} r={4} />
              <text x={sx(cursorT) + (cursorT > 60 ? -6 : 6)} y={M.t + ih - 6} textAnchor={cursorT > 60 ? 'end' : 'start'}>
                +{Math.round(cursorT)}h · {cursorV.toFixed(1)}%
              </text>
            </g>
          )}
          {hv !== null && tip && (
            <g className="hover">
              <line x1={sx(hv)} x2={sx(hv)} y1={M.t} y2={M.t + ih} />
            </g>
          )}
        </svg>
        {showPred && (
          <div className="fail-annot" style={{ left: Math.min(w - 150, sx(FAILURE_WINDOW[0]) - 8), top: 4 }}>
            <TriangleAlert size={16} />
            <div>
              <div className="fa-l">Estimated failure</div>
              <div className="fa-v">36 – 52 hours</div>
            </div>
          </div>
        )}
        {tip && hv !== null && (
          <div className="chart-tip" style={{ left: Math.min(w - 170, Math.max(4, sx(hv) + 8)), top: h - 46 }}>
            {tip}
          </div>
        )}
      </div>
    </div>
  );
}
