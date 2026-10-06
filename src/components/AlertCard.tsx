import { useEffect, useRef } from 'react';
import { CircleHelp, LocateFixed, TriangleAlert } from 'lucide-react';
import { selDetected, useAppStore } from '../store/useAppStore';
import { getEngine } from '../three/engineRef';
import { focusLeak } from '../store/actions';

let cardEl: HTMLDivElement | null = null;

/** Crimson glass alert floating over the twin. */
export function AlertCard() {
  const detected = useAppStore(selDetected);
  const confidence = useAppStore((s) => s.confidence);
  const forecast = useAppStore((s) => s.forecastHours);
  return (
    <div
      ref={(el) => {
        cardEl = el;
      }}
      className={`alert-card ${detected ? 'is-visible' : ''}`}
      role="alert"
      aria-hidden={!detected}
    >
      <div className="alert-icon">
        <TriangleAlert strokeWidth={1.7} />
      </div>
      <div className="alert-body">
        <div className="alert-title">
          Possible Underground
          <br />
          Water Leak
        </div>
        <div className="alert-row">
          <span>Confidence</span>
          <b>{Math.max(confidence, detected ? 60 : 0)}%</b>
        </div>
        <div className="alert-row">
          <span>Estimated failure</span>
          <b>36 – 52 hours</b>
        </div>
        {forecast > 0.5 && <div className="alert-forecast">Viewing forecast +{Math.round(forecast)} h</div>}
        <div className="alert-foot">Sector B-12 · WTR-B12-047</div>
        <div className="alert-actions">
          <button className="link-btn light" onClick={() => useAppStore.setState({ explainOpen: true })}>
            <CircleHelp size={13} /> Why was this flagged?
          </button>
          <button className="link-btn light" onClick={() => focusLeak()} title="Fly to the breach">
            <LocateFixed size={13} /> Locate
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Live SVG leader line from the alert card to the 3D warning beacon above the
 * breach (projected every frame from the engine).
 */
export function AlertLeader({ stageRef }: { stageRef: React.RefObject<HTMLDivElement | null> }) {
  const detected = useAppStore(selDetected);
  const svgRef = useRef<SVGSVGElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const dotRef = useRef<SVGCircleElement>(null);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const e = getEngine();
      const stage = stageRef.current;
      const svg = svgRef.current;
      const path = pathRef.current;
      if (!e || !stage || !svg || !path || !cardEl) return;
      const a = e.anchors.leak;
      const visible = detected && a.visible;
      svg.style.opacity = visible ? '1' : '0';
      if (!visible) return;
      const sr = stage.getBoundingClientRect();
      const cr = cardEl.getBoundingClientRect();
      // screen px → layout px (the whole UI is CSS-zoomed to fit the screen)
      const k = sr.width / Math.max(1, stage.clientWidth);
      const sx = (cr.left - sr.left) / k + 28;
      const sy = (cr.bottom - sr.top) / k;
      const ex = a.x;
      const ey = a.y;
      const goingDown = ey > sy;
      const midY = goingDown ? sy + Math.max(16, (ey - sy) * 0.3) : sy;
      path.setAttribute('d', `M${sx.toFixed(1)} ${sy.toFixed(1)} L${sx.toFixed(1)} ${midY.toFixed(1)} L${ex.toFixed(1)} ${ey.toFixed(1)}`);
      dotRef.current?.setAttribute('cx', ex.toFixed(1));
      dotRef.current?.setAttribute('cy', ey.toFixed(1));
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [detected, stageRef]);

  return (
    <svg ref={svgRef} className="leader" aria-hidden>
      <path ref={pathRef} />
      <circle ref={dotRef} r="4" />
    </svg>
  );
}
