import { BrainCircuit, X } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { CONTRIBUTIONS } from '../simulation/riskEngine';

export function ExplainabilityPanel() {
  const open = useAppStore((s) => s.explainOpen);
  const confidence = useAppStore((s) => s.confidence);
  if (!open) return null;
  const max = Math.max(...CONTRIBUTIONS.map((c) => c.value));
  return (
    <div className="panel explain" role="dialog" aria-label="Why was this flagged?">
      <div className="panel-head">
        <span className="panel-title">
          <BrainCircuit size={14} /> Why was this flagged?
        </span>
        <button className="icon-btn" onClick={() => useAppStore.setState({ explainOpen: false })} aria-label="Close">
          <X size={14} />
        </button>
      </div>
      <div className="ex-conf">
        <span>AI confidence</span>
        <b>{Math.max(confidence, 93)}%</b>
      </div>
      <div className="ex-sub">Contributing signals</div>
      <ul className="ex-list">
        {CONTRIBUTIONS.map((c, i) => (
          <li key={c.key}>
            <div className="ex-top">
              <span>{c.label}</span>
              <b>+{c.value}%</b>
            </div>
            <div className="ex-bar">
              <div style={{ width: `${(c.value / max) * 100}%`, animationDelay: `${i * 80}ms` }} />
            </div>
          </li>
        ))}
      </ul>
      <div className="ex-type">
        <span>Likely failure type</span>
        <b>Water distribution pipe leak</b>
      </div>
      <div className="ex-type">
        <span>Evidence window</span>
        <b>Last 6 h of telemetry · 4 sensors · 1 asset</b>
      </div>
      <p className="ex-note">Prototype model — contribution weights are illustrative and derived from the simulated scenario.</p>
    </div>
  );
}
