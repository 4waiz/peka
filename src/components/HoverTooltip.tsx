import { useEffect, useRef } from 'react';
import { selDetected, useAppStore } from '../store/useAppStore';
import { SECTOR_BY_ID, UTILITIES } from '../simulation/infrastructureData';
import { getAssetDetails } from '../simulation/assets';
import { riskLevel } from '../simulation/riskEngine';

/** Small tooltip following the cursor for hovered sectors and utility assets. */
export function HoverTooltip({ stageRef }: { stageRef: React.RefObject<HTMLDivElement | null> }) {
  const hover = useAppStore((s) => s.hover);
  const risk = useAppStore((s) => s.risk);
  const detected = useAppStore(selDetected);
  const resolved = useAppStore((s) => s.repair.status === 'resolved');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const onMove = (e: MouseEvent) => {
      const el = ref.current;
      if (!el) return;
      const r = stage.getBoundingClientRect();
      // the UI is CSS-zoomed: convert screen px → layout px
      const k = r.width / Math.max(1, stage.clientWidth);
      const w = stage.clientWidth;
      const h = stage.clientHeight;
      const x = (e.clientX - r.left) / k + 16;
      const y = (e.clientY - r.top) / k + 16;
      el.style.transform = `translate(${Math.min(x, w - 250)}px, ${Math.min(y, h - 140)}px)`;
    };
    stage.addEventListener('mousemove', onMove);
    return () => stage.removeEventListener('mousemove', onMove);
  }, [stageRef]);

  let content: React.ReactNode = null;
  if (hover?.kind === 'sector' && hover.sector) {
    const s = SECTOR_BY_ID[hover.sector];
    const lvl = hover.sector === 'B-12' && detected && !resolved ? riskLevel(risk) : s.baseRisk;
    const health = hover.sector === 'B-12' && detected && !resolved ? 71.4 : s.health;
    content = (
      <>
        <div className="tt-head">
          <b>Sector {s.id}</b>
          <span className={`pill pill-${lvl === 'low' ? 'ok' : lvl}`}>{lvl === 'high' ? 'High risk' : lvl === 'medium' ? 'Medium risk' : 'Low risk'}</span>
        </div>
        <div className="tt-sub">{s.district}</div>
        <div className="tt-grid">
          <span>Infrastructure health</span>
          <b>{health.toFixed(1)}%</b>
          <span>Monitored assets</span>
          <b>{s.assets}</b>
          <span>Residents</span>
          <b>{s.population.toLocaleString()}</b>
        </div>
        <div className="tt-hint">Click to focus sector</div>
      </>
    );
  } else if (hover?.kind === 'asset' && hover.asset) {
    const d = getAssetDetails(hover.asset);
    const spec = UTILITIES[d.utility];
    content = (
      <>
        <div className="tt-head">
          <b style={{ color: spec.color }}>{d.assetId}</b>
          {d.critical && <span className="pill pill-high">Critical</span>}
        </div>
        <div className="tt-sub">
          {d.type} · {d.diameter}
        </div>
        <div className="tt-grid">
          <span>Health</span>
          <b className={d.health < 70 ? 'bad' : ''}>{d.health}%</b>
          <span>Depth</span>
          <b>{d.depthM}</b>
        </div>
        <div className="tt-hint">Click to inspect · double-click to follow pipe</div>
      </>
    );
  }

  return (
    <div ref={ref} className={`hover-tip ${content ? 'is-visible' : ''}`}>
      {content}
    </div>
  );
}
