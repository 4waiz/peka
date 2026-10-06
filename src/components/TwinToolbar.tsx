import { Building2, Crosshair, Layers, ScanEye, TriangleAlert } from 'lucide-react';
import { selPredicted, useAppStore } from '../store/useAppStore';
import { cameraPreset, focusLeak, setView, toggleXray } from '../store/actions';
import { LAYER_ORDER, UTILITIES } from '../simulation/infrastructureData';
import type { ViewMode } from '../three/TwinEngine';

const VIEWS: { key: ViewMode; label: string }[] = [
  { key: '3d', label: '3D Twin View' },
  { key: 'map', label: 'Map View' },
  { key: 'asset', label: 'Asset View' },
];

export function ViewTabs() {
  const view = useAppStore((s) => s.view);
  return (
    <div className="view-tabs" role="tablist">
      {VIEWS.map((v) => (
        <button key={v.key} role="tab" aria-selected={view === v.key} className={`view-tab ${view === v.key ? 'is-active' : ''}`} onClick={() => setView(v.key)}>
          {v.label}
        </button>
      ))}
    </div>
  );
}

export function CameraControls() {
  const xray = useAppStore((s) => s.xray);
  const btn = (label: string, Icon: typeof Crosshair, onClick: () => void, opts: { active?: boolean; danger?: boolean; title?: string } = {}) => (
    <button className={`cam-btn ${opts.active ? 'is-active' : ''} ${opts.danger ? 'is-danger' : ''}`} onClick={onClick} title={opts.title ?? label}>
      <Icon size={17} strokeWidth={1.8} />
      <span>{label}</span>
    </button>
  );
  return (
    <div className="cam-controls">
      {btn('Reset', Crosshair, () => cameraPreset('overview'), { title: 'Reset view (R)' })}
      {btn('City', Building2, () => cameraPreset('city'), { title: 'City view' })}
      {btn('Under', Layers, () => cameraPreset('underground'), { title: 'Underground utilities (U)' })}
      {btn('Leak', TriangleAlert, focusLeak, { danger: true, title: 'Fly to the leak (L)' })}
      <div className="cam-sep" />
      {btn('X-Ray', ScanEye, toggleXray, { active: xray, title: 'Open the streets and see the utilities (X)' })}
    </div>
  );
}

export function LayerToggles() {
  const layers = useAppStore((s) => s.layers);
  const toggle = useAppStore((s) => s.toggleLayer);
  return (
    <div className="layer-toggles">
      <span className="lt-label">Layers</span>
      {LAYER_ORDER.map((u) => {
        const spec = UTILITIES[u];
        return (
          <button key={u} className={`lt-chip ${layers[u] ? 'is-on' : ''}`} onClick={() => toggle(u)} style={{ ['--c' as string]: spec.color }} aria-pressed={layers[u]}>
            <i className="lt-box">
              <svg viewBox="0 0 12 12">
                <path d="M2.5 6.2 5 8.6 9.6 3.6" />
              </svg>
            </i>
            {spec.label}
          </button>
        );
      })}
    </div>
  );
}

export function ForecastScrubber() {
  const hours = useAppStore((s) => s.forecastHours);
  const predicted = useAppStore(selPredicted);
  const demo = useAppStore((s) => s.demo.running);
  const disabled = !predicted || demo;
  // only show the time machine once there is a forecast to explore
  if (!predicted && hours < 0.5) return null;
  return (
    <div className={`forecast ${disabled ? 'is-disabled' : ''} ${hours > 0.5 ? 'is-active' : ''}`} title={disabled ? 'Available once the AI has produced a failure forecast' : 'Scrub the predicted deterioration'}>
      <div className="fc-head">
        <span className="fc-label">Forecast</span>
        <span className="fc-val">{hours < 0.5 ? 'NOW' : `+${Math.round(hours)}H`}</span>
      </div>
      <input
        type="range"
        min={0}
        max={72}
        step={1}
        value={Math.round(hours)}
        disabled={disabled}
        onChange={(e) => useAppStore.setState({ forecastHours: Number(e.target.value) })}
        style={{ ['--p' as string]: `${(hours / 72) * 100}%` }}
      />
      <div className="fc-ticks">
        <span>Now</span>
        <span>24h</span>
        <span className="fail">36–52h</span>
        <span>72h</span>
      </div>
    </div>
  );
}
