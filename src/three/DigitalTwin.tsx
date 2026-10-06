import { useEffect, useRef } from 'react';
import { TwinEngine, type SimInputs, type VisualInputs } from './TwinEngine';
import { setEngine } from './engineRef';
import { CREW_TRAVEL_SECONDS, selDetected, useAppStore, type AppState } from '../store/useAppStore';
import { selectAsset, selectSector } from '../store/actions';
import { riskLevel } from '../simulation/riskEngine';

function visualOf(s: AppState): VisualInputs {
  return {
    view: s.view,
    xray: s.xray,
    heat: s.heat,
    blast: s.blast,
    layers: s.layers,
    highlight: s.highlight,
    hoveredSector: s.hoveredSector,
    selectedSector: s.selectedSector,
    routeVisible: s.routeVisible || s.nav === 'repair',
  };
}

function simOf(s: AppState): SimInputs {
  const detected = selDetected(s);
  return {
    leakSeverity: s.leakSeverity,
    detected,
    resolved: s.repair.status === 'resolved',
    forecastHours: s.forecastHours,
    b12Risk: s.repair.status === 'resolved' ? 'low' : detected || s.demo.flags.localize ? riskLevel(Math.max(s.risk, s.demo.flags.localize ? 80 : 0)) : riskLevel(Math.min(s.risk, 45)),
    confidence: s.confidence,
  };
}

const shallowEq = (a: object, b: object) => {
  const ka = Object.keys(a) as (keyof typeof a)[];
  return ka.every((k) => a[k] === b[k]);
};

/**
 * Mounts the Three.js digital twin and keeps it in sync with the store.
 * Store → engine via a subscription (no React re-renders), engine → store via callbacks.
 */
export function DigitalTwin() {
  const host = useRef<HTMLDivElement>(null);
  const labels = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t0 = performance.now();
    const engine = new TwinEngine(host.current!, labels.current!, {
      onHover: (h) => useAppStore.setState({ hover: h }),
      onSelectSector: (id) => selectSector(id),
      onSelectAsset: (a) => selectAsset(a),
      onCamera: (c) => useAppStore.setState({ camera: c }),
    });
    setEngine(engine);
    if (import.meta.env.DEV) {
      (window as unknown as { __peka: TwinEngine }).__peka = engine;
      console.info(`[twin] scene built in ${Math.round(performance.now() - t0)} ms`);
    }

    let vis = visualOf(useAppStore.getState());
    let sim = simOf(useAppStore.getState());
    let flags = useAppStore.getState().demo.flags;
    engine.setTheme(useAppStore.getState().theme);
    engine.setVisual(vis);
    engine.setSim(sim);
    engine.setDemo(flags);

    const unsub = useAppStore.subscribe((s, prev) => {
      if (s.theme !== prev.theme) engine.setTheme(s.theme);
      const v = visualOf(s);
      if (!shallowEq(v, vis)) {
        vis = v;
        engine.setVisual(v);
      }
      const si = simOf(s);
      if (!shallowEq(si, sim)) {
        sim = si;
        engine.setSim(si);
      }
      if (s.demo.flags !== flags) {
        flags = s.demo.flags;
        engine.setDemo(flags);
      }
      if (s.repair.status !== prev.repair.status) {
        if (s.repair.status === 'dispatched') engine.dispatchCrew(CREW_TRAVEL_SECONDS);
        if (s.repair.status === 'idle') engine.resetCrew();
      }
      if (s.selectedAsset?.assetId !== prev.selectedAsset?.assetId) engine.selectAsset(s.selectedAsset?.assetId ?? null);
    });

    return () => {
      unsub();
      setEngine(null);
      engine.dispose();
    };
  }, []);

  return (
    <div className="twin-host">
      <div ref={host} className="twin-canvas-host" />
      <div ref={labels} className="twin-labels" />
    </div>
  );
}
