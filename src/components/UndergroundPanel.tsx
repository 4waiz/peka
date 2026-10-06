import { useEffect, useRef } from 'react';
import { Box, Crosshair, Minus, Plus } from 'lucide-react';
import { selDetected, useAppStore } from '../store/useAppStore';
import { getEngine, setUndergroundHost } from '../three/engineRef';
import { cameraPreset } from '../store/actions';
import { ForecastScrubber } from './TwinToolbar';
import { DEPTH_SCALE, UTILITIES } from '../simulation/infrastructureData';

const LEAK_DEPTH_M = -UTILITIES.water.depth * DEPTH_SCALE; // ≈ 3.2 m

/**
 * Live close-up of the utility cross-section under Sector B-12 (a second
 * camera on the same twin) with a depth ruler and a "leak detected" callout.
 */
export function UndergroundPanel() {
  const host = useRef<HTMLDivElement>(null);
  const ruler = useRef<HTMLDivElement>(null);
  const callout = useRef<HTMLDivElement>(null);
  const marker = useRef<HTMLDivElement>(null);
  const detected = useAppStore(selDetected);

  useEffect(() => {
    setUndergroundHost(host.current);
    return () => setUndergroundHost(null);
  }, []);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const ug = getEngine()?.underground;
      if (!ug || !ruler.current) return;
      const ticks = ruler.current.querySelectorAll<HTMLDivElement>('.ug-tick');
      ug.anchors.ruler.forEach((t, i) => {
        const el = ticks[i];
        if (!el) return;
        el.style.transform = `translateY(${t.y.toFixed(1)}px)`;
        el.style.opacity = t.visible ? '1' : '0';
      });
      const r = ug.anchors.ruler;
      if (marker.current && r[3] && r[4]) {
        const y = r[3].y + (r[4].y - r[3].y) * (LEAK_DEPTH_M - 3);
        marker.current.style.transform = `translateY(${y.toFixed(1)}px)`;
      }
      const a = ug.anchors.leak;
      if (callout.current) {
        callout.current.style.transform = `translate(${(a.x + 26).toFixed(1)}px, ${(a.y - 92).toFixed(1)}px)`;
        callout.current.style.opacity = a.visible && detected ? '1' : '0';
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [detected]);

  return (
    <section className="card ug-card">
      <div className="ug-host" ref={host} />
      <div className="ug-ruler" ref={ruler} aria-hidden>
        {Array.from({ length: 9 }, (_, i) => (
          <div key={i} className="ug-tick">
            <i />
            <span>{i === 0 ? '0 m' : `−${i} m`}</span>
            {i === 0 && <em>Ground level</em>}
          </div>
        ))}
        <div className={`ug-marker ${detected ? 'is-on' : ''}`} ref={marker}>
          <i />
        </div>
      </div>
      <div className="ug-callout" ref={callout} aria-hidden={!detected}>
        <div className="ugc-thumb" />
        <div>
          <b>Leak detected</b>
          <span>Main water pipe (Ø900 mm)</span>
          <span>Depth: {LEAK_DEPTH_M.toFixed(1)} m</span>
        </div>
      </div>
      <div className="ug-title">
        <span className="ug-dot" />
        Underground · Sector B-12
      </div>
      <div className="ug-controls">
        <button onClick={() => getEngine()?.underground?.home()} title="Recenter">
          <Crosshair size={15} />
        </button>
        <button onClick={() => getEngine()?.underground?.zoom(0.8)} title="Zoom in">
          <Plus size={15} />
        </button>
        <button onClick={() => getEngine()?.underground?.zoom(1.25)} title="Zoom out">
          <Minus size={15} />
        </button>
        <button onClick={() => cameraPreset('underground')} title="Open this view in the main 3D twin">
          <Box size={14} />
          <span>3D</span>
        </button>
      </div>
      <div className="ug-forecast">
        <ForecastScrubber />
      </div>
    </section>
  );
}
